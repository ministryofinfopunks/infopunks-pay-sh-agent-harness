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
  provider_id: string;
  route: string;
  success: boolean;
  status_code: number | null;
  latency_ms: number | null;
  paid_execution_proven: boolean;
  extracted_price_usd: number | null;
  extraction_path: string;
  normalization_confidence: NormalizationConfidence;
  proof_reference: string;
  error_summary?: string;
}

export interface SolPriceBenchmarkArtifact {
  benchmark_id: "finance-data-sol-price";
  intent: "get SOL price";
  generated_at: string;
  winner_claimed: false;
  routes: BenchmarkRouteResult[];
  notes: string;
}

const BENCHMARK_ID = "finance-data-sol-price" as const;
const BENCHMARK_INTENT = "get SOL price" as const;
const LIVE_PROOF_PATH = path.resolve(
  process.cwd(),
  "live-proofs",
  "finance-data-sol-price-benchmark-2026-05-15.md",
);
const RAW_JSON_PATH = path.resolve(
  process.cwd(),
  "proofs",
  "finance-data-sol-price-benchmark-2026-05-15.json",
);

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
  providerId: string;
  route: string;
  success: boolean;
  statusCode?: number;
  latencyMs?: number;
  proofReference: string;
  extraction: PriceExtractionResult;
  executionError?: string;
}): BenchmarkRouteResult {
  const effectiveSuccess = input.success && input.extraction.extractedPriceUsd !== null;
  return {
    provider_id: input.providerId,
    route: input.route,
    success: effectiveSuccess,
    status_code: typeof input.statusCode === "number" ? input.statusCode : null,
    latency_ms: typeof input.latencyMs === "number" ? input.latencyMs : null,
    paid_execution_proven: true,
    extracted_price_usd: input.extraction.extractedPriceUsd,
    extraction_path: input.extraction.extractionPath,
    normalization_confidence: input.extraction.normalizationConfidence,
    proof_reference: input.proofReference,
    error_summary: input.executionError ?? input.extraction.errorSummary,
  };
}

export function buildBenchmarkNotes(routes: BenchmarkRouteResult[]): string {
  const hasBothSuccess = routes.filter((route) => route.success).length === 2;
  const bothPrices = routes.map((route) => route.extracted_price_usd).filter((value): value is number => value !== null);
  if (hasBothSuccess && bothPrices.length === 2 && bothPrices[0] !== bothPrices[1]) {
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
    "",
    "| provider_id | route | success | status_code | latency_ms | extracted_price_usd | extraction_path | normalization_confidence | proof_reference |",
    "|---|---|---:|---:|---:|---:|---|---|---|",
  ];

  const rows = artifact.routes.map((route) => {
    const statusCode = route.status_code === null ? "" : String(route.status_code);
    const latency = route.latency_ms === null ? "" : String(route.latency_ms);
    const price = route.extracted_price_usd === null ? "" : String(route.extracted_price_usd);
    return `| ${route.provider_id} | ${route.route} | ${route.success} | ${statusCode} | ${latency} | ${price} | ${route.extraction_path} | ${route.normalization_confidence} | ${route.proof_reference} |`;
  });

  return [...header, ...rows, "", `- notes: ${artifact.notes}`, ""].join("\n");
}

async function run(): Promise<void> {
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
    providerId: "merit-systems-stablecrypto-market-data",
    route: "POST https://stablecrypto.dev/api/coingecko/price",
    success: stableExecution.success,
    statusCode: stableExecution.statusCode,
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
    providerId: "paysponge-coingecko",
    route: "GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
    success: payspongeExecution.success,
    statusCode: payspongeExecution.statusCode,
    latencyMs: payspongeExecution.latencyMs,
    proofReference: "live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md",
    extraction: payspongeExtraction,
    executionError: payspongeExecution.errorReason,
  });

  const routes = [stableRoute, payspongeRoute];
  const artifact: SolPriceBenchmarkArtifact = {
    benchmark_id: BENCHMARK_ID,
    intent: BENCHMARK_INTENT,
    generated_at: new Date().toISOString(),
    winner_claimed: false,
    routes,
    notes: buildBenchmarkNotes(routes),
  };

  await mkdir(path.dirname(LIVE_PROOF_PATH), { recursive: true });
  await mkdir(path.dirname(RAW_JSON_PATH), { recursive: true });
  await writeFile(LIVE_PROOF_PATH, renderSafeMarkdown(artifact), "utf8");
  await writeFile(RAW_JSON_PATH, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(`Wrote benchmark markdown: ${LIVE_PROOF_PATH}`);
  console.log(`Wrote local raw json: ${RAW_JSON_PATH}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error("benchmark:sol-price failed", error);
    process.exitCode = 1;
  });
}
