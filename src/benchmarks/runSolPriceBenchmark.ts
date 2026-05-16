import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "../livePayShExecutor";

export type NormalizationConfidence = "high" | "medium" | "low" | "failed";

export interface PriceExtractionResult {
  extractedPriceUsd: number | null;
  extractionPath: string;
  normalizationConfidence: NormalizationConfidence;
  errorSummary?: string;
}

export interface BenchmarkRouteResult {
  run_number: number;
  generated_at: string;
  provider_id: string;
  route: string;
  success: boolean;
  execution_transport: "pay_cli" | "http" | "skipped";
  cli_exit_code: number | null;
  status_code: number | null;
  status_evidence: string;
  latency_ms: number | null;
  paid_execution_proven: boolean;
  extracted_price_usd: number | null;
  extraction_path: string;
  normalization_confidence: NormalizationConfidence;
  proof_reference: string;
  error_summary?: string;
}

export interface SolPriceBenchmarkRun {
  run_number: number;
  generated_at: string;
  routes: BenchmarkRouteResult[];
}

export interface RouteAggregateMetrics {
  provider_id: string;
  success_rate: number;
  median_latency_ms: number | null;
  p95_latency_ms: number | null;
  average_price_usd: number | null;
  min_price_usd: number | null;
  max_price_usd: number | null;
  price_variance_percent: number | null;
  completed_runs: number;
  failed_runs: number;
}

export interface SolPriceBenchmarkArtifact {
  benchmark_id: "finance-data-sol-price";
  intent: "get SOL price";
  generated_at: string;
  winner_claimed: false;
  runs: SolPriceBenchmarkRun[];
  aggregate_metrics: RouteAggregateMetrics[];
  notes: string;
}

const BENCHMARK_ID = "finance-data-sol-price" as const;
const BENCHMARK_INTENT = "get SOL price" as const;
function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function extractStableCryptoPrice(parsedJson: unknown): PriceExtractionResult {
  if (!isObject(parsedJson)) {
    return {
      extractedPriceUsd: null,
      extractionPath: "solana.usd",
      normalizationConfidence: "failed",
      errorSummary: "response_not_object",
    };
  }

  const solana = parsedJson.solana;
  if (!isObject(solana)) {
    return {
      extractedPriceUsd: null,
      extractionPath: "solana.usd",
      normalizationConfidence: "failed",
      errorSummary: "missing_solana_object",
    };
  }

  const price = parseFiniteNumber(solana.usd);
  if (price === null) {
    return {
      extractedPriceUsd: null,
      extractionPath: "solana.usd",
      normalizationConfidence: "failed",
      errorSummary: "missing_or_invalid_solana_usd",
    };
  }

  return {
    extractedPriceUsd: price,
    extractionPath: "solana.usd",
    normalizationConfidence: "high",
  };
}

function isSolUsdcName(name: unknown): boolean {
  if (typeof name !== "string") {
    return false;
  }
  const upper = name.toUpperCase();
  return upper.includes("SOL") && upper.includes("USDC");
}

export function extractPaySpongePrice(parsedJson: unknown): PriceExtractionResult {
  if (!isObject(parsedJson)) {
    return {
      extractedPriceUsd: null,
      extractionPath: "data[0].attributes.base_token_price_usd",
      normalizationConfidence: "failed",
      errorSummary: "response_not_object",
    };
  }

  const data = parsedJson.data;
  if (!Array.isArray(data) || data.length === 0) {
    return {
      extractedPriceUsd: null,
      extractionPath: "data[0].attributes.base_token_price_usd",
      normalizationConfidence: "failed",
      errorSummary: "missing_data_array",
    };
  }

  const preferredPool = data.find((entry) => {
    if (!isObject(entry) || !isObject(entry.attributes)) {
      return false;
    }
    return isSolUsdcName(entry.attributes.name);
  });

  const pool = preferredPool ?? data[0];
  if (!isObject(pool) || !isObject(pool.attributes)) {
    return {
      extractedPriceUsd: null,
      extractionPath: preferredPool ? "data[sol_usdc].attributes.base_token_price_usd" : "data[0].attributes.base_token_price_usd",
      normalizationConfidence: "failed",
      errorSummary: "missing_pool_attributes",
    };
  }

  const attributes = pool.attributes;
  const basePrice = parseFiniteNumber(attributes.base_token_price_usd);
  if (basePrice !== null && basePrice > 1) {
    return {
      extractedPriceUsd: basePrice,
      extractionPath: preferredPool
        ? "data[sol_usdc].attributes.base_token_price_usd"
        : "data[0].attributes.base_token_price_usd",
      normalizationConfidence: preferredPool ? "high" : "medium",
    };
  }

  const quotePrice = parseFiniteNumber(attributes.quote_token_price_usd);
  if (quotePrice !== null && quotePrice > 1) {
    return {
      extractedPriceUsd: quotePrice,
      extractionPath: preferredPool
        ? "data[sol_usdc].attributes.quote_token_price_usd"
        : "data[0].attributes.quote_token_price_usd",
      normalizationConfidence: "low",
    };
  }

  return {
    extractedPriceUsd: null,
    extractionPath: preferredPool
      ? "data[sol_usdc].attributes.base_token_price_usd"
      : "data[0].attributes.base_token_price_usd",
    normalizationConfidence: "failed",
    errorSummary: "missing_or_invalid_sol_price_fields",
  };
}

function buildRouteResult(input: {
  runNumber: number;
  generatedAt: string;
  providerId: string;
  route: string;
  success: boolean;
  executionMode: "live_pay_sh_cli" | "live_pay_sh" | "skipped";
  cliExitCode?: number;
  statusCode?: number;
  parsedJsonAvailable?: boolean;
  latencyMs?: number;
  proofReference: string;
  extraction: PriceExtractionResult;
  executionError?: string;
}): BenchmarkRouteResult {
  const effectiveSuccess = input.success && input.extraction.extractedPriceUsd !== null;
  const executionTransport =
    input.executionMode === "live_pay_sh_cli" ? "pay_cli" : input.executionMode === "live_pay_sh" ? "http" : "skipped";
  const cliExitCode = typeof input.cliExitCode === "number" ? input.cliExitCode : null;
  const statusCode = typeof input.statusCode === "number" ? input.statusCode : null;
  let statusEvidence = "status unavailable";
  if (executionTransport === "pay_cli") {
    if (statusCode !== null) {
      statusEvidence = `pay_cli output included HTTP status ${statusCode}`;
    } else if (cliExitCode === 0 && input.parsedJsonAvailable) {
      statusEvidence = "pay_cli exit code 0 and parsed response body";
    } else {
      statusEvidence = `pay_cli exit code ${cliExitCode === null ? "null" : cliExitCode}; parsed response body ${input.parsedJsonAvailable ? "available" : "unavailable"}`;
    }
  } else if (executionTransport === "http" && statusCode !== null) {
    statusEvidence = `http response status ${statusCode}`;
  } else if (executionTransport === "skipped") {
    statusEvidence = "execution skipped";
  }

  return {
    run_number: input.runNumber,
    generated_at: input.generatedAt,
    provider_id: input.providerId,
    route: input.route,
    success: effectiveSuccess,
    execution_transport: executionTransport,
    cli_exit_code: cliExitCode,
    status_code: statusCode,
    status_evidence: statusEvidence,
    latency_ms: typeof input.latencyMs === "number" ? input.latencyMs : null,
    paid_execution_proven: true,
    extracted_price_usd: input.extraction.extractedPriceUsd,
    extraction_path: input.extraction.extractionPath,
    normalization_confidence: input.extraction.normalizationConfidence,
    proof_reference: input.proofReference,
    error_summary: input.executionError ?? input.extraction.errorSummary,
  };
}

function percentileFromSorted(values: number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const rank = Math.ceil(percentile * values.length);
  const index = Math.max(0, Math.min(values.length - 1, rank - 1));
  return values[index] ?? null;
}

export function calculateMedianLatencyMs(latenciesMs: number[]): number | null {
  if (latenciesMs.length === 0) {
    return null;
  }
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return typeof left === "number" && typeof right === "number" ? (left + right) / 2 : null;
}

export function calculateP95LatencyMs(latenciesMs: number[]): number | null {
  if (latenciesMs.length === 0) {
    return null;
  }
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  return percentileFromSorted(sorted, 0.95);
}

export function calculateSuccessRate(successes: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return successes / total;
}

export function buildAggregateMetrics(runs: SolPriceBenchmarkRun[]): RouteAggregateMetrics[] {
  const byProvider = new Map<string, BenchmarkRouteResult[]>();
  for (const run of runs) {
    for (const route of run.routes) {
      const list = byProvider.get(route.provider_id) ?? [];
      list.push(route);
      byProvider.set(route.provider_id, list);
    }
  }

  return Array.from(byProvider.entries()).map(([providerId, routeRuns]) => {
    const successCount = routeRuns.filter((entry) => entry.success).length;
    const failedRuns = routeRuns.length - successCount;
    const latencies = routeRuns
      .map((entry) => entry.latency_ms)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const prices = routeRuns
      .map((entry) => entry.extracted_price_usd)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    const averagePrice =
      prices.length === 0 ? null : prices.reduce((sum, value) => sum + value, 0) / prices.length;
    const minPrice = prices.length === 0 ? null : Math.min(...prices);
    const maxPrice = prices.length === 0 ? null : Math.max(...prices);
    const priceVariancePercent =
      averagePrice === null || averagePrice === 0 || minPrice === null || maxPrice === null
        ? null
        : ((maxPrice - minPrice) / averagePrice) * 100;

    return {
      provider_id: providerId,
      success_rate: calculateSuccessRate(successCount, routeRuns.length),
      median_latency_ms: calculateMedianLatencyMs(latencies),
      p95_latency_ms: calculateP95LatencyMs(latencies),
      average_price_usd: averagePrice,
      min_price_usd: minPrice,
      max_price_usd: maxPrice,
      price_variance_percent: priceVariancePercent,
      completed_runs: successCount,
      failed_runs: failedRuns,
    };
  });
}

export function buildBenchmarkNotes(runs: SolPriceBenchmarkRun[]): string {
  if (runs.length === 0) {
    return "No benchmark runs executed.";
  }
  const allRouteRuns = runs.flatMap((run) => run.routes);
  const successfulPerRun = runs.map((run) => run.routes.filter((route) => route.success).length);
  const allRunsHaveBothSuccess = successfulPerRun.every((count) => count === 2);
  const allPrices = allRouteRuns
    .map((route) => route.extracted_price_usd)
    .filter((value): value is number => value !== null);
  const hasAnyPriceDifference = allPrices.some((value) => value !== allPrices[0]);

  if (allRunsHaveBothSuccess && hasAnyPriceDifference) {
    return "Prices are comparable but no route winner is claimed until benchmark criteria are finalized. Price difference recorded. No winner claimed.";
  }
  return "Prices are comparable but no route winner is claimed until benchmark criteria are finalized.";
}

export function renderSafeMarkdown(artifact: SolPriceBenchmarkArtifact): string {
  const header = [
    `# SOL Price Benchmark Artifact`,
    "",
    `- benchmark_id: ${artifact.benchmark_id}`,
    `- intent: ${artifact.intent}`,
    `- generated_at: ${artifact.generated_at}`,
    `- winner_claimed: ${artifact.winner_claimed}`,
    `- total_runs: ${artifact.runs.length}`,
    "",
    "## Per-Run Route Results",
    "",
    "| run_number | generated_at | provider_id | route | success | transport | cli_exit_code | status_code | status_evidence | latency_ms | extracted_price_usd | extraction_path | normalization_confidence | proof_reference |",
    "|---:|---|---|---|---:|---|---:|---:|---|---:|---:|---|---|---|",
  ];

  const rows = artifact.runs.flatMap((run) =>
    run.routes.map((route) => {
    const cliExitCode = route.cli_exit_code === null ? "" : String(route.cli_exit_code);
    const statusCode = route.status_code === null ? "" : String(route.status_code);
    const latency = route.latency_ms === null ? "" : String(route.latency_ms);
    const price = route.extracted_price_usd === null ? "" : String(route.extracted_price_usd);
      return `| ${run.run_number} | ${run.generated_at} | ${route.provider_id} | ${route.route} | ${route.success} | ${route.execution_transport} | ${cliExitCode} | ${statusCode} | ${route.status_evidence} | ${latency} | ${price} | ${route.extraction_path} | ${route.normalization_confidence} | ${route.proof_reference} |`;
    }),
  );

  const aggregateHeader = [
    "",
    "## Aggregate Metrics",
    "",
    "| provider_id | success_rate | median_latency_ms | p95_latency_ms | average_price_usd | min_price_usd | max_price_usd | price_variance_percent | completed_runs | failed_runs |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  const aggregateRows = artifact.aggregate_metrics.map((metric) => {
    const median = metric.median_latency_ms === null ? "" : String(metric.median_latency_ms);
    const p95 = metric.p95_latency_ms === null ? "" : String(metric.p95_latency_ms);
    const avgPrice = metric.average_price_usd === null ? "" : String(metric.average_price_usd);
    const minPrice = metric.min_price_usd === null ? "" : String(metric.min_price_usd);
    const maxPrice = metric.max_price_usd === null ? "" : String(metric.max_price_usd);
    const variance = metric.price_variance_percent === null ? "" : String(metric.price_variance_percent);
    return `| ${metric.provider_id} | ${metric.success_rate} | ${median} | ${p95} | ${avgPrice} | ${minPrice} | ${maxPrice} | ${variance} | ${metric.completed_runs} | ${metric.failed_runs} |`;
  });

  return [...header, ...rows, ...aggregateHeader, ...aggregateRows, "", `- notes: ${artifact.notes}`, ""].join("\n");
}

function parseRunsArg(argv: string[]): number {
  const runsIndex = argv.findIndex((arg) => arg === "--runs");
  if (runsIndex === -1) {
    return 1;
  }
  const raw = argv[runsIndex + 1];
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --runs value "${raw ?? ""}". Use a positive integer, for example: --runs 5`);
  }
  return parsed;
}

function toDatedLiveProofPath(now: Date): string {
  const datePart = now.toISOString().slice(0, 10);
  return path.resolve(
    process.cwd(),
    "live-proofs",
    `finance-data-sol-price-benchmark-runs-${datePart}.md`,
  );
}

async function run(): Promise<void> {
  const runsToExecute = parseRunsArg(process.argv.slice(2));
  const runs: SolPriceBenchmarkRun[] = [];

  for (let runNumber = 1; runNumber <= runsToExecute; runNumber += 1) {
    const runGeneratedAt = new Date().toISOString();
  const stableExecution = await executeLivePayShCall({
    providerId: "merit-systems-stablecrypto-market-data",
    intent: BENCHMARK_INTENT,
    endpointUrl: "https://stablecrypto.dev/api/coingecko/price",
    method: "POST",
    body: {
      ids: ["solana"],
      vs_currencies: ["usd"],
    },
  });

  const stableExtraction = extractStableCryptoPrice(stableExecution.parsedJson);
  const stableRoute = buildRouteResult({
    runNumber,
    generatedAt: runGeneratedAt,
    providerId: "merit-systems-stablecrypto-market-data",
    route: "POST https://stablecrypto.dev/api/coingecko/price",
    success: stableExecution.success,
    executionMode: stableExecution.mode,
    cliExitCode: stableExecution.exitCode,
    statusCode: stableExecution.statusCode,
    parsedJsonAvailable: stableExecution.parsedJsonAvailable,
    latencyMs: stableExecution.latencyMs,
    proofReference: "live-proofs/stablecrypto-harness-pay-cli-2026-05-12.md",
    extraction: stableExtraction,
    executionError: stableExecution.errorReason,
  });

  const payspongeExecution = await executeLivePayShCall({
    providerId: "paysponge-coingecko",
    intent: BENCHMARK_INTENT,
    endpointUrl: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
    method: "GET",
  });

  const payspongeExtraction = extractPaySpongePrice(payspongeExecution.parsedJson);
  const payspongeRoute = buildRouteResult({
    runNumber,
    generatedAt: runGeneratedAt,
    providerId: "paysponge-coingecko",
    route: "GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
    success: payspongeExecution.success,
    executionMode: payspongeExecution.mode,
    cliExitCode: payspongeExecution.exitCode,
    statusCode: payspongeExecution.statusCode,
    parsedJsonAvailable: payspongeExecution.parsedJsonAvailable,
    latencyMs: payspongeExecution.latencyMs,
    proofReference: "live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md",
    extraction: payspongeExtraction,
    executionError: payspongeExecution.errorReason,
  });

    runs.push({
      run_number: runNumber,
      generated_at: runGeneratedAt,
      routes: [stableRoute, payspongeRoute],
    });
  }

  const generatedAt = new Date().toISOString();
  const liveProofPath = toDatedLiveProofPath(new Date(generatedAt));
  const artifact: SolPriceBenchmarkArtifact = {
    benchmark_id: BENCHMARK_ID,
    intent: BENCHMARK_INTENT,
    generated_at: generatedAt,
    winner_claimed: false,
    runs,
    aggregate_metrics: buildAggregateMetrics(runs),
    notes: buildBenchmarkNotes(runs),
  };

  await mkdir(path.dirname(liveProofPath), { recursive: true });
  await writeFile(liveProofPath, renderSafeMarkdown(artifact), "utf8");

  console.log(`Wrote benchmark markdown: ${liveProofPath}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error("benchmark:sol-price failed", error);
    process.exitCode = 1;
  });
}
