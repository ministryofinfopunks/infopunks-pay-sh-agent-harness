import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "../livePayShExecutor";

export type ResponseShapeClassified =
  | "pool_search_results"
  | "token_search_results"
  | "non_json_text"
  | "unknown"
  | "failed";

export type NormalizationConfidence = "high" | "medium" | "low" | "failed";

export interface TokenSearchNormalization {
  tokenSearchResultDetected: boolean;
  matchedQuery: "SOL" | null;
  responseShapeClassified: ResponseShapeClassified;
  normalizationConfidence: NormalizationConfidence;
  extractionPath?: string;
  semanticDetectionPath?: string;
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
  canonical_query: "SOL";
  token_search_result_detected: boolean;
  response_shape_classified: ResponseShapeClassified;
  normalization_confidence: NormalizationConfidence;
  extraction_path: string;
  semantic_detection_path: string;
  proof_reference: string;
  error_summary?: string;
}

export interface TokenSearchBenchmarkRun {
  run_number: number;
  generated_at: string;
  routes: BenchmarkRouteResult[];
}

export interface RouteAggregateMetrics {
  provider_id: string;
  success_rate: number;
  completed_runs: number;
  failed_runs: number;
  median_latency_ms: number | null;
  p95_latency_ms: number | null;
  token_search_detection_rate: number;
  dominant_response_shape: ResponseShapeClassified;
  normalization_confidence_summary: string;
  paid_execution_success_count: number;
  status_evidence_summary: string;
}

export interface TokenSearchBenchmarkArtifact {
  benchmark_id: "finance-data-token-search";
  intent: "token search";
  canonical_query: "SOL";
  generated_at: string;
  total_runs: number;
  winner_claimed: false;
  winner_status: "insufficient_runs" | "no_clear_winner";
  runs: TokenSearchBenchmarkRun[];
  aggregate_metrics: RouteAggregateMetrics[];
  proof_references: string[];
  notes: string;
}

const BENCHMARK_ID = "finance-data-token-search" as const;
const BENCHMARK_INTENT = "token search" as const;
const CANONICAL_QUERY = "SOL" as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textContainsSol(value: string): boolean {
  return /\bSOL\b/i.test(value);
}

function classifyAndNormalizeTokenSearch(parsedJson: unknown, responsePreview: string): TokenSearchNormalization {
  if (typeof parsedJson === "string") {
    const detected = textContainsSol(parsedJson);
    return {
      tokenSearchResultDetected: detected,
      matchedQuery: detected ? CANONICAL_QUERY : null,
      responseShapeClassified: "non_json_text",
      normalizationConfidence: detected ? "medium" : "low",
      semanticDetectionPath: "raw_text_scan",
      errorSummary: detected ? undefined : "sol_not_detected_in_text",
    };
  }

  if (!isObject(parsedJson)) {
    const detectedFromPreview = textContainsSol(responsePreview);
    return {
      tokenSearchResultDetected: detectedFromPreview,
      matchedQuery: detectedFromPreview ? CANONICAL_QUERY : null,
      responseShapeClassified: responsePreview ? "non_json_text" : "unknown",
      normalizationConfidence: detectedFromPreview ? "medium" : "failed",
      semanticDetectionPath: detectedFromPreview ? "response_preview_scan" : "none",
      errorSummary: detectedFromPreview ? undefined : "response_not_object",
    };
  }

  const data = parsedJson.data;
  if (Array.isArray(data)) {
    const poolLike = data.some((entry) => isObject(entry) && isObject(entry.attributes));
    const serialized = JSON.stringify(data);
    const detected = textContainsSol(serialized);
    return {
      tokenSearchResultDetected: detected,
      matchedQuery: detected ? CANONICAL_QUERY : null,
      responseShapeClassified: poolLike ? "pool_search_results" : "token_search_results",
      normalizationConfidence: detected ? "high" : "low",
      extractionPath: poolLike ? "data[].attributes" : "data[]",
      semanticDetectionPath: detected ? "json_string_scan:data" : "json_structure_without_sol",
      errorSummary: detected ? undefined : "sol_not_detected_in_data_array",
    };
  }

  const tokens = parsedJson.tokens;
  if (Array.isArray(tokens)) {
    const serialized = JSON.stringify(tokens);
    const detected = textContainsSol(serialized);
    return {
      tokenSearchResultDetected: detected,
      matchedQuery: detected ? CANONICAL_QUERY : null,
      responseShapeClassified: "token_search_results",
      normalizationConfidence: detected ? "high" : "low",
      extractionPath: "tokens[]",
      semanticDetectionPath: detected ? "json_string_scan:tokens" : "json_structure_without_sol",
      errorSummary: detected ? undefined : "sol_not_detected_in_tokens_array",
    };
  }

  const serialized = JSON.stringify(parsedJson);
  const detected = textContainsSol(serialized);
  return {
    tokenSearchResultDetected: detected,
    matchedQuery: detected ? CANONICAL_QUERY : null,
    responseShapeClassified: "unknown",
    normalizationConfidence: detected ? "low" : "failed",
    semanticDetectionPath: detected ? "json_string_scan:root" : "unknown_shape",
    errorSummary: detected ? undefined : "unknown_json_shape",
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
  parsedJson: unknown;
  parsedJsonAvailable?: boolean;
  responsePreview?: string;
  latencyMs?: number;
  proofReference: string;
  executionError?: string;
}): BenchmarkRouteResult {
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

  const normalized = classifyAndNormalizeTokenSearch(input.parsedJson, input.responsePreview ?? "");
  const effectiveSuccess = input.success && normalized.tokenSearchResultDetected;

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
    canonical_query: CANONICAL_QUERY,
    token_search_result_detected: normalized.tokenSearchResultDetected,
    response_shape_classified: effectiveSuccess ? normalized.responseShapeClassified : "failed",
    normalization_confidence: effectiveSuccess ? normalized.normalizationConfidence : "failed",
    extraction_path: normalized.extractionPath ?? "",
    semantic_detection_path: normalized.semanticDetectionPath ?? "",
    proof_reference: input.proofReference,
    error_summary: input.executionError ?? normalized.errorSummary,
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

function dominantShape(entries: BenchmarkRouteResult[]): ResponseShapeClassified {
  const counts = new Map<ResponseShapeClassified, number>();
  for (const entry of entries) {
    const current = counts.get(entry.response_shape_classified) ?? 0;
    counts.set(entry.response_shape_classified, current + 1);
  }
  let selected: ResponseShapeClassified = "unknown";
  let max = -1;
  for (const [shape, count] of counts.entries()) {
    if (count > max) {
      selected = shape;
      max = count;
    }
  }
  return selected;
}

function summarizeNormalization(entries: BenchmarkRouteResult[]): string {
  const counts = new Map<NormalizationConfidence, number>();
  for (const entry of entries) {
    const current = counts.get(entry.normalization_confidence) ?? 0;
    counts.set(entry.normalization_confidence, current + 1);
  }
  return ["high", "medium", "low", "failed"]
    .map((key) => `${key}:${counts.get(key as NormalizationConfidence) ?? 0}`)
    .join(", ");
}

function summarizeStatusEvidence(entries: BenchmarkRouteResult[]): string {
  return Array.from(new Set(entries.map((entry) => entry.status_evidence))).join(" | ");
}

export function buildAggregateMetrics(runs: TokenSearchBenchmarkRun[]): RouteAggregateMetrics[] {
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
    const detections = routeRuns.filter((entry) => entry.token_search_result_detected).length;
    return {
      provider_id: providerId,
      success_rate: calculateSuccessRate(successCount, routeRuns.length),
      completed_runs: successCount,
      failed_runs: failedRuns,
      median_latency_ms: calculateMedianLatencyMs(latencies),
      p95_latency_ms: calculateP95LatencyMs(latencies),
      token_search_detection_rate: calculateSuccessRate(detections, routeRuns.length),
      dominant_response_shape: dominantShape(routeRuns),
      normalization_confidence_summary: summarizeNormalization(routeRuns),
      paid_execution_success_count: routeRuns.filter((entry) => entry.execution_transport !== "skipped").length,
      status_evidence_summary: summarizeStatusEvidence(routeRuns),
    };
  });
}

export function resolveWinnerStatus(totalRuns: number): "insufficient_runs" | "no_clear_winner" {
  return totalRuns < 5 ? "insufficient_runs" : "no_clear_winner";
}

export function parseRunsArg(argv: string[]): number {
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
    `finance-data-token-search-benchmark-runs-${datePart}.md`,
  );
}

export function renderSafeMarkdown(artifact: TokenSearchBenchmarkArtifact): string {
  const lines: string[] = [
    "# Finance Data Token Search Benchmark Artifact",
    "",
    `- benchmark_id: ${artifact.benchmark_id}`,
    `- intent: ${artifact.intent}`,
    `- canonical_query: ${artifact.canonical_query}`,
    `- generated_at: ${artifact.generated_at}`,
    `- total_runs: ${artifact.total_runs}`,
    `- winner_claimed: ${artifact.winner_claimed}`,
    `- winner_status: ${artifact.winner_status}`,
    "",
    "## Per-Run Route Results",
    "",
    "| run_number | generated_at | provider_id | route | success | execution_transport | cli_exit_code | status_code | status_evidence | latency_ms | canonical_query | token_search_result_detected | response_shape_classified | normalization_confidence | extraction_path | semantic_detection_path | proof_reference | error_summary |",
    "|---:|---|---|---|---:|---|---:|---:|---|---:|---|---:|---|---|---|---|---|---|",
  ];

  for (const run of artifact.runs) {
    for (const route of run.routes) {
      lines.push(
        `| ${run.run_number} | ${run.generated_at} | ${route.provider_id} | ${route.route} | ${route.success} | ${route.execution_transport} | ${route.cli_exit_code ?? ""} | ${route.status_code ?? ""} | ${route.status_evidence} | ${route.latency_ms ?? ""} | ${route.canonical_query} | ${route.token_search_result_detected} | ${route.response_shape_classified} | ${route.normalization_confidence} | ${route.extraction_path} | ${route.semantic_detection_path} | ${route.proof_reference} | ${route.error_summary ?? ""} |`,
      );
    }
  }

  lines.push(
    "",
    "## Aggregate Metrics",
    "",
    "| provider_id | success_rate | completed_runs | failed_runs | median_latency_ms | p95_latency_ms | token_search_detection_rate | dominant_response_shape | normalization_confidence_summary | paid_execution_success_count | status_evidence_summary |",
    "|---|---:|---:|---:|---:|---:|---:|---|---|---:|---|",
  );

  for (const metric of artifact.aggregate_metrics) {
    lines.push(
      `| ${metric.provider_id} | ${metric.success_rate} | ${metric.completed_runs} | ${metric.failed_runs} | ${metric.median_latency_ms ?? ""} | ${metric.p95_latency_ms ?? ""} | ${metric.token_search_detection_rate} | ${metric.dominant_response_shape} | ${metric.normalization_confidence_summary} | ${metric.paid_execution_success_count} | ${metric.status_evidence_summary} |`,
    );
  }

  lines.push(
    "",
    "## Proof References",
    "",
    ...artifact.proof_references.map((ref) => `- ${ref}`),
    "",
    "## Notes",
    "",
    `- ${artifact.notes}`,
    "- Token-search benchmark recorded. No route winner is claimed. Scoring thresholds are not finalized.",
    "",
  );

  return lines.join("\n");
}

async function run(): Promise<void> {
  const runsToExecute = parseRunsArg(process.argv.slice(2));
  const runs: TokenSearchBenchmarkRun[] = [];

  for (let runNumber = 1; runNumber <= runsToExecute; runNumber += 1) {
    const runGeneratedAt = new Date().toISOString();

    const stableExecution = await executeLivePayShCall({
      providerId: "merit-systems-stablecrypto-market-data",
      intent: BENCHMARK_INTENT,
      endpointUrl: "https://stablecrypto.dev/api/coingecko/onchain/search",
      method: "POST",
      body: { query: CANONICAL_QUERY },
    });

    const stableRoute = buildRouteResult({
      runNumber,
      generatedAt: runGeneratedAt,
      providerId: "merit-systems-stablecrypto-market-data",
      route: "POST https://stablecrypto.dev/api/coingecko/onchain/search",
      success: stableExecution.success,
      executionMode: stableExecution.mode,
      cliExitCode: stableExecution.exitCode,
      statusCode: stableExecution.statusCode,
      parsedJson: stableExecution.parsedJson,
      parsedJsonAvailable: stableExecution.parsedJsonAvailable,
      responsePreview: stableExecution.responsePreview,
      latencyMs: stableExecution.latencyMs,
      proofReference: "live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md",
      executionError: stableExecution.errorReason,
    });

    const payspongeExecution = await executeLivePayShCall({
      providerId: "paysponge-coingecko",
      intent: BENCHMARK_INTENT,
      endpointUrl: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
      method: "GET",
    });

    const payspongeRoute = buildRouteResult({
      runNumber,
      generatedAt: runGeneratedAt,
      providerId: "paysponge-coingecko",
      route: "GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
      success: payspongeExecution.success,
      executionMode: payspongeExecution.mode,
      cliExitCode: payspongeExecution.exitCode,
      statusCode: payspongeExecution.statusCode,
      parsedJson: payspongeExecution.parsedJson,
      parsedJsonAvailable: payspongeExecution.parsedJsonAvailable,
      responsePreview: payspongeExecution.responsePreview,
      latencyMs: payspongeExecution.latencyMs,
      proofReference: "live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md",
      executionError: payspongeExecution.errorReason,
    });

    runs.push({
      run_number: runNumber,
      generated_at: runGeneratedAt,
      routes: [stableRoute, payspongeRoute],
    });
  }

  const generatedAt = new Date().toISOString();
  const artifact: TokenSearchBenchmarkArtifact = {
    benchmark_id: BENCHMARK_ID,
    intent: BENCHMARK_INTENT,
    canonical_query: CANONICAL_QUERY,
    generated_at: generatedAt,
    total_runs: runs.length,
    winner_claimed: false,
    winner_status: resolveWinnerStatus(runs.length),
    runs,
    aggregate_metrics: buildAggregateMetrics(runs),
    proof_references: [
      "live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md",
      "live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md",
    ],
    notes: "Token-search benchmark recorded. No route winner is claimed. Scoring thresholds are not finalized.",
  };

  const outputPath = toDatedLiveProofPath(new Date(generatedAt));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderSafeMarkdown(artifact), "utf8");
  console.log(`Wrote benchmark markdown: ${outputPath}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error("benchmark:token-search failed", error);
    process.exitCode = 1;
  });
}
