import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveDataWebSearchResultsEvidenceHealth,
  normalizeDataWebSearchResults,
  type DataWebSearchResultsNormalizedOutput,
  type CaveatObject,
  type NormalizeDataWebSearchResultsResult,
} from "./benchmarks/dataWebSearchResultsNormalization";

const BENCHMARK_ID = "data-web-search-results";
const CANONICAL_INPUT = { query: "x402 agent payments", limit: 5 } as const;
const METHOD = "POST" as const;

const PROVIDER_ID_STABLEENRICH = "merit-systems/stableenrich/enrichment";
const PROVIDER_ID_PERPLEXITY = "paysponge/perplexity";

const RESEARCH_PROOF_PATH = "live-proofs/data-web-search-results-candidate-research-2026-05-19.md";

const SENSITIVE_PATTERNS = [
  /authorization\s*[:=]\s*[^\n]+/gi,
  /x-payment\s*[:=]\s*[^\n]+/gi,
  /payment-signature\s*[:=]\s*[^\n]+/gi,
  /private[_ -]?key\s*[:=]\s*[^\s,;)]+/gi,
  /seed[_ -]?phrase\s*[:=]\s*[^\n]+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s,;)]+/gi,
  /apikey\s*[:=]\s*[^\s,;)]+/gi,
  /wallet\s*[:=]\s*[^\n]+/gi,
  /mnemonic\s*[:=]\s*[^\n]+/gi,
  /signature\s*[:=]\s*[^\n]+/gi,
];

export type WebSearchProvider = "StableEnrich Exa Search" | "Perplexity Search" | "StableEnrich Firecrawl Search";

export type RouteState = "verified/proven" | "candidate/unproven" | "rejected";

export interface RouteConfig {
  provider: WebSearchProvider;
  providerId: string;
  endpoint: string;
  method: "POST";
  buildBody: (input: typeof CANONICAL_INPUT) => Record<string, unknown>;
}

export interface PaidRouteProof {
  benchmark_id: string;
  provider: WebSearchProvider;
  endpoint: string;
  method: "POST";
  canonical_input_hash: string;
  route_specific_body: Record<string, unknown>;
  paid_execution_status: "succeeded" | "failed";
  cli_exit_code: number | null;
  status_evidence: string;
  normalized_output: DataWebSearchResultsNormalizedOutput;
  result_count: number | null;
  search_success: boolean;
  sample_normalized_results: DataWebSearchResultsNormalizedOutput["results"];
  caveat_objects: CaveatObject[];
  evidence_health: DataWebSearchResultsNormalizedOutput["evidence_health"];
  route_state: RouteState;
}

export interface VerifyWebSearchPaidResult {
  benchmark_id: string;
  proof_path: string;
  attempted_routes: PaidRouteProof[];
}

const ROUTE_EXA: RouteConfig = {
  provider: "StableEnrich Exa Search",
  providerId: PROVIDER_ID_STABLEENRICH,
  endpoint: "https://stableenrich.dev/api/exa/search",
  method: METHOD,
  buildBody: (input) => ({ query: input.query, numResults: input.limit }),
};

const ROUTE_PERPLEXITY: RouteConfig = {
  provider: "Perplexity Search",
  providerId: PROVIDER_ID_PERPLEXITY,
  endpoint: "https://pplx.x402.paysponge.com/search",
  method: METHOD,
  buildBody: (input) => ({ query: input.query, max_results: input.limit }),
};

const ROUTE_FIRECRAWL: RouteConfig = {
  provider: "StableEnrich Firecrawl Search",
  providerId: PROVIDER_ID_STABLEENRICH,
  endpoint: "https://stableenrich.dev/api/firecrawl/search",
  method: METHOD,
  buildBody: (input) => ({ query: input.query, limit: input.limit }),
};

export function getRouteConfigs(): { exa: RouteConfig; perplexity: RouteConfig; firecrawl: RouteConfig } {
  return {
    exa: ROUTE_EXA,
    perplexity: ROUTE_PERPLEXITY,
    firecrawl: ROUTE_FIRECRAWL,
  };
}

export function hashCanonicalInput(input: { query: string; limit: number }): string {
  return createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
}

function statusEvidence(statusCode: number | null, exitCode: number | null, errorReason?: string): string {
  if (statusCode !== null) {
    return `status_code_observed_${statusCode}`;
  }
  if (exitCode !== null) {
    return errorReason ? `pay_cli_exit_${exitCode}_${errorReason}` : `pay_cli_exit_${exitCode}_status_unavailable`;
  }
  return errorReason ? `status_unavailable_${errorReason}` : "status_unavailable";
}

export function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export function deriveRouteState(input: {
  paidCallSuccess: boolean;
  normalized: NormalizeDataWebSearchResultsResult;
}): RouteState {
  const caveats = input.normalized.caveat_objects;
  const hardReject = caveats.some((c) =>
    c.code === "route_not_found" || c.code === "method_not_allowed" || c.code === "auth_required"
  );
  if (hardReject) {
    return "rejected";
  }

  const hasTitleAndUrl = input.normalized.normalized.results.some((entry) => Boolean(entry.title && entry.url));
  if (input.paidCallSuccess && input.normalized.normalized.search_success && hasTitleAndUrl) {
    return "verified/proven";
  }

  return "candidate/unproven";
}

export function shouldExecuteFirecrawlBackup(primary: PaidRouteProof[]): boolean {
  if (primary.length < 2) {
    return true;
  }
  return primary.some((route) => route.route_state !== "verified/proven");
}

export async function confirmResearchProof(): Promise<boolean> {
  const proofPath = path.resolve(process.cwd(), RESEARCH_PROOF_PATH);
  let text: string;
  try {
    text = await readFile(proofPath, "utf8");
  } catch {
    return false;
  }

  const hasExa =
    text.includes("https://stableenrich.dev/api/exa/search") &&
    text.includes("numResults") &&
    text.includes("query");

  const hasPerplexity =
    text.includes("https://pplx.x402.paysponge.com/search") &&
    text.includes("max_results") &&
    text.includes("query");

  const hasFirecrawl =
    text.includes("https://stableenrich.dev/api/firecrawl/search") &&
    text.includes("limit") &&
    text.includes("query");

  return hasExa && hasPerplexity && hasFirecrawl;
}

export function validateSafetyGate(env: NodeJS.ProcessEnv, researchConfirmed: boolean): { ok: boolean; reason: string } {
  if (!researchConfirmed) {
    return { ok: false, reason: "research_proof_missing_or_incomplete" };
  }
  if (env.LIVE_PAYSH_EXECUTION !== "true") {
    return { ok: false, reason: "LIVE_PAYSH_EXECUTION_not_true" };
  }
  if (env.PAYSH_EXECUTION_MODE !== "pay_cli") {
    return { ok: false, reason: "PAYSH_EXECUTION_MODE_not_pay_cli" };
  }
  return { ok: true, reason: "ok" };
}

type LiveExecutor = (input: ExecuteLivePayShCallInput) => ReturnType<typeof executeLivePayShCall>;

export async function runPaidRoute(
  route: RouteConfig,
  canonicalInputHash: string,
  executor: LiveExecutor,
): Promise<PaidRouteProof> {
  const body = route.buildBody(CANONICAL_INPUT);
  const paid = await executor({
    providerId: route.providerId,
    intent: BENCHMARK_ID,
    endpointUrl: route.endpoint,
    method: route.method,
    bodyJson: body,
    headers: {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    },
  });

  const paidSucceeded = paid.success;
  const evidence = statusEvidence(paid.statusCode ?? null, paid.exitCode ?? null, paid.errorReason);
  const normalized = normalizeDataWebSearchResults({
    parsedJson: paid.parsedJsonAvailable ? paid.parsedJson ?? {} : paid.responsePreview,
    responsePreview: paid.responsePreview,
    statusCode: paid.statusCode ?? null,
    statusEvidence: evidence,
    paidExecutionObserved: paidSucceeded,
    canonicalInput: CANONICAL_INPUT,
  });

  const evidenceHealth = deriveDataWebSearchResultsEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: paidSucceeded ? 1 : 0,
    paidFailures: paidSucceeded ? 0 : 1,
    successfulResultCounts: paidSucceeded ? [normalized.normalized.results.length] : [],
    latest: normalized,
  });

  const mergedNormalized: DataWebSearchResultsNormalizedOutput = {
    ...normalized.normalized,
    evidence_health: evidenceHealth,
    caveat_objects: normalized.caveat_objects,
  };

  const normalizedWithHealth: NormalizeDataWebSearchResultsResult = {
    normalized: mergedNormalized,
    caveat_objects: normalized.caveat_objects,
  };

  const routeState = deriveRouteState({ paidCallSuccess: paidSucceeded, normalized: normalizedWithHealth });

  return {
    benchmark_id: BENCHMARK_ID,
    provider: route.provider,
    endpoint: route.endpoint,
    method: route.method,
    canonical_input_hash: canonicalInputHash,
    route_specific_body: body,
    paid_execution_status: paidSucceeded ? "succeeded" : "failed",
    cli_exit_code: paid.exitCode ?? null,
    status_evidence: evidence,
    normalized_output: mergedNormalized,
    result_count: mergedNormalized.result_count,
    search_success: mergedNormalized.search_success,
    sample_normalized_results: mergedNormalized.results.slice(0, 3),
    caveat_objects: normalized.caveat_objects,
    evidence_health: evidenceHealth,
    route_state: routeState,
  };
}

export function renderProofMarkdown(results: PaidRouteProof[], now = new Date()): string {
  const lines: string[] = [
    "# Data Web Search Results Paid Route Verification",
    "",
    `- generated_at: ${now.toISOString()}`,
    `- benchmark_id: ${BENCHMARK_ID}`,
    `- canonical_input: ${JSON.stringify(CANONICAL_INPUT)}`,
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.provider}`);
    lines.push(`- benchmark_id: ${result.benchmark_id}`);
    lines.push(`- provider: ${result.provider}`);
    lines.push(`- endpoint: ${result.endpoint}`);
    lines.push(`- method: ${result.method}`);
    lines.push(`- canonical_input_hash: ${result.canonical_input_hash}`);
    lines.push(`- route_specific_body: ${JSON.stringify(result.route_specific_body)}`);
    lines.push(`- paid_execution_status: ${result.paid_execution_status}`);
    lines.push(`- cli_exit_code: ${result.cli_exit_code === null ? "null" : String(result.cli_exit_code)}`);
    lines.push(`- status_evidence: ${result.status_evidence}`);
    lines.push(`- normalized_output: ${JSON.stringify(result.normalized_output)}`);
    lines.push(`- result_count: ${result.result_count === null ? "null" : String(result.result_count)}`);
    lines.push(`- search_success: ${String(result.search_success)}`);
    lines.push(`- sample normalized results: ${JSON.stringify(result.sample_normalized_results)}`);
    lines.push(`- caveat_objects: ${JSON.stringify(result.caveat_objects)}`);
    lines.push(`- evidence_health: ${result.evidence_health}`);
    lines.push(`- route_state: ${result.route_state}`);
    lines.push("");
  }

  lines.push("No 5-run benchmark artifact generated.");
  lines.push("No benchmark recorded claim.");
  lines.push("No winner claim.");

  return sanitizeProofMarkdown(lines.join("\n"));
}

export async function runWebSearchPaidVerification(
  executor: LiveExecutor = executeLivePayShCall,
  now = new Date(),
): Promise<VerifyWebSearchPaidResult> {
  const researchConfirmed = await confirmResearchProof();
  const gate = validateSafetyGate(process.env, researchConfirmed);
  if (!gate.ok) {
    throw new Error(`Safety gate failed: ${gate.reason}`);
  }

  const canonicalInputHash = hashCanonicalInput(CANONICAL_INPUT);
  const results: PaidRouteProof[] = [];

  const exa = await runPaidRoute(ROUTE_EXA, canonicalInputHash, executor);
  results.push(exa);

  const perplexity = await runPaidRoute(ROUTE_PERPLEXITY, canonicalInputHash, executor);
  results.push(perplexity);

  if (shouldExecuteFirecrawlBackup(results)) {
    const firecrawl = await runPaidRoute(ROUTE_FIRECRAWL, canonicalInputHash, executor);
    results.push(firecrawl);
  }

  const datePart = now.toISOString().slice(0, 10);
  const proofPath = `live-proofs/data-web-search-results-paid-routes-${datePart}.md`;

  const outputPath = path.resolve(process.cwd(), proofPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${renderProofMarkdown(results, now)}\n`, "utf8");

  return {
    benchmark_id: BENCHMARK_ID,
    proof_path: proofPath,
    attempted_routes: results,
  };
}

if (require.main === module) {
  runWebSearchPaidVerification()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            benchmark_id: result.benchmark_id,
            proof_path: result.proof_path,
            routes: result.attempted_routes.map((entry) => ({
              provider: entry.provider,
              endpoint: entry.endpoint,
              paid_execution_status: entry.paid_execution_status,
              route_state: entry.route_state,
              evidence_health: entry.evidence_health,
            })),
          },
          null,
          2,
        ),
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
