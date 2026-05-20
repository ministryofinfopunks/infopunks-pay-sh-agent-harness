import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveMapsPlaceSearchResultsEvidenceHealth,
  normalizeMapsPlaceSearchResults,
  type CaveatObject,
  type MapsPlaceSearchResultsNormalizedOutput,
  type NormalizeMapsPlaceSearchResultsResult,
} from "./benchmarks/mapsPlaceSearchResultsNormalization";

const BENCHMARK_ID = "maps-place-search-results";
const METHOD = "POST" as const;

const RESEARCH_PROOF_PATH = "live-proofs/maps-place-search-results-candidate-research-2026-05-20.md";
const READINESS_NOTE_PATH = "live-proofs/maps-place-search-results-scaffold-readiness-2026-05-20.md";
const NORMALIZER_PATH = "src/benchmarks/mapsPlaceSearchResultsNormalization.ts";
const NORMALIZER_TEST_PATH = "src/benchmarks/mapsPlaceSearchResultsNormalization.test.ts";
const PAY_SKILLS_DETAIL_DIR = path.join(os.homedir(), ".config/pay/skills/detail");

const CANONICAL_INPUT = {
  query: "coffee near Union Square San Francisco",
  location: "Union Square, San Francisco, CA",
  limit: 5,
} as const;

const ROUTE_GOOGLE = {
  provider: "Google Places SearchText" as const,
  providerId: "solana-foundation/google/places",
  endpoint: "https://places.google.gateway-402.com/v1/places:searchText",
  method: METHOD,
};

const ROUTE_STABLEENRICH = {
  provider: "StableEnrich Google Maps Text Search" as const,
  providerId: "merit-systems/stableenrich/enrichment",
  endpoint: "https://stableenrich.dev/api/google-maps/text-search/partial",
  method: METHOD,
};

const BLOCKED_PROVIDER_ID = "paysponge/tripadvisor";

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

export type RouteState = "verified/proven" | "candidate/unproven" | "rejected";

export interface RouteConfig {
  provider: "Google Places SearchText" | "StableEnrich Google Maps Text Search";
  providerId: string;
  endpoint: string;
  method: "POST";
  buildBody: (input: typeof CANONICAL_INPUT) => Record<string, unknown>;
}

export interface PaidRouteProof {
  benchmark_id: string;
  provider: RouteConfig["provider"];
  endpoint: string;
  method: "POST";
  canonical_input_hash: string;
  canonical_input: typeof CANONICAL_INPUT;
  route_specific_body: Record<string, unknown>;
  paid_execution_status: "succeeded" | "failed";
  cli_exit_code: number | null;
  status_evidence: string;
  normalized_output: MapsPlaceSearchResultsNormalizedOutput;
  result_count: number | null;
  place_search_success: boolean;
  query_match: boolean | null;
  location_match: boolean | null;
  sample_normalized_place_fields: MapsPlaceSearchResultsNormalizedOutput["places"];
  caveat_objects: CaveatObject[];
  evidence_health: MapsPlaceSearchResultsNormalizedOutput["evidence_health"];
  route_state: RouteState;
}

export interface VerifyMapsPlaceSearchPaidResult {
  benchmark_id: string;
  proof_path: string;
  attempted_routes: PaidRouteProof[];
  winner_claimed: false;
}

type SafetyGateReason =
  | "ok"
  | "research_proof_missing"
  | "readiness_note_missing_or_not_scaffold_ready"
  | "normalizer_or_tests_missing"
  | "normalizer_tests_not_confirmed"
  | "LIVE_PAYSH_EXECUTION_not_true"
  | "PAYSH_EXECUTION_MODE_not_pay_cli"
  | "comparable_route_schema_evidence_missing";

export interface SafetyGateResult {
  ok: boolean;
  reason: SafetyGateReason;
}

const ROUTE_CONFIGS: { google: RouteConfig; stableenrich: RouteConfig } = {
  google: {
    ...ROUTE_GOOGLE,
    buildBody: (input) => ({
      textQuery: `${input.query} in ${input.location}`,
      maxResultCount: input.limit,
    }),
  },
  stableenrich: {
    ...ROUTE_STABLEENRICH,
    buildBody: (input) => ({
      textQuery: `${input.query} in ${input.location}`,
      maxResultCount: input.limit,
    }),
  },
};

export function getRouteConfigs(): { google: RouteConfig; stableenrich: RouteConfig } {
  return ROUTE_CONFIGS;
}

export function hashCanonicalInput(input: typeof CANONICAL_INPUT): string {
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(path.resolve(process.cwd(), filePath), "utf8");
  } catch {
    return null;
  }
}

export async function confirmResearchProof(): Promise<boolean> {
  const text = await readTextIfExists(RESEARCH_PROOF_PATH);
  if (!text) {
    return false;
  }

  return (
    text.includes("solana-foundation/google/places") &&
    text.includes("https://places.google.gateway-402.com/v1/places:searchText") &&
    text.includes("textQuery") &&
    text.includes("maxResultCount") &&
    text.includes("merit-systems/stableenrich/enrichment") &&
    text.includes("https://stableenrich.dev/api/google-maps/text-search/partial") &&
    text.includes("paid execution: **not performed**")
  );
}

export async function confirmReadinessNoteScaffoldReady(): Promise<boolean> {
  const text = await readTextIfExists(READINESS_NOTE_PATH);
  if (!text) {
    return false;
  }

  return (
    text.includes("benchmark_id: `maps-place-search-results`") &&
    text.includes("recommended_state: `scaffold_ready`") &&
    text.includes("comparable_candidate_count: `2`")
  );
}

export async function confirmNormalizerAndTests(): Promise<boolean> {
  const normalizer = await readTextIfExists(NORMALIZER_PATH);
  const tests = await readTextIfExists(NORMALIZER_TEST_PATH);
  if (!normalizer || !tests) {
    return false;
  }

  return (
    normalizer.includes("normalizeMapsPlaceSearchResults") &&
    normalizer.includes("deriveMapsPlaceSearchResultsEvidenceHealth") &&
    tests.includes("Google Places-like response normalizes") &&
    tests.includes("StableEnrich Google Maps-like response normalizes")
  );
}

async function readPaySkillDetailTexts(): Promise<string[]> {
  try {
    const entries = await readdir(PAY_SKILLS_DETAIL_DIR, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const texts = await Promise.all(files.map((file) => readFile(path.join(PAY_SKILLS_DETAIL_DIR, file.name), "utf8")));
    return texts;
  } catch {
    return [];
  }
}

function routeEvidenceFromDetail(detailText: string, route: RouteConfig): boolean {
  if (!detailText.includes(route.providerId) || !detailText.includes(route.endpoint)) {
    return false;
  }

  if (route.providerId === ROUTE_GOOGLE.providerId) {
    return detailText.includes("textQuery") && detailText.includes("maxResultCount") && detailText.includes("/v1/places:searchText");
  }

  return (
    detailText.includes("textQuery") &&
    detailText.includes("maxResultCount") &&
    detailText.includes("/api/google-maps/text-search/partial")
  );
}

function routeEvidenceFromResearch(researchText: string, route: RouteConfig): boolean {
  if (!researchText.includes(route.providerId) || !researchText.includes(route.endpoint)) {
    return false;
  }
  return researchText.includes("textQuery") && researchText.includes("maxResultCount");
}

export async function confirmComparableRouteSchemaEvidence(): Promise<boolean> {
  const detailTexts = await readPaySkillDetailTexts();
  const researchText = (await readTextIfExists(RESEARCH_PROOF_PATH)) ?? "";

  const routes = [ROUTE_CONFIGS.google, ROUTE_CONFIGS.stableenrich];
  return routes.every((route) => {
    const byDetail = detailTexts.some((text) => routeEvidenceFromDetail(text, route));
    const byResearch = routeEvidenceFromResearch(researchText, route);
    return byDetail || byResearch;
  });
}

export function validateSafetyGate(env: NodeJS.ProcessEnv, checks: {
  researchConfirmed: boolean;
  readinessConfirmed: boolean;
  normalizerConfirmed: boolean;
  schemaEvidenceConfirmed: boolean;
}): SafetyGateResult {
  if (!checks.researchConfirmed) {
    return { ok: false, reason: "research_proof_missing" };
  }
  if (!checks.readinessConfirmed) {
    return { ok: false, reason: "readiness_note_missing_or_not_scaffold_ready" };
  }
  if (!checks.normalizerConfirmed) {
    return { ok: false, reason: "normalizer_or_tests_missing" };
  }
  if (env.LIVE_PAYSH_EXECUTION !== "true") {
    return { ok: false, reason: "LIVE_PAYSH_EXECUTION_not_true" };
  }
  if (env.PAYSH_EXECUTION_MODE !== "pay_cli") {
    return { ok: false, reason: "PAYSH_EXECUTION_MODE_not_pay_cli" };
  }
  if (!checks.schemaEvidenceConfirmed) {
    return { ok: false, reason: "comparable_route_schema_evidence_missing" };
  }
  return { ok: true, reason: "ok" };
}

export function deriveRouteState(input: {
  paidCallSuccess: boolean;
  normalized: NormalizeMapsPlaceSearchResultsResult;
}): RouteState {
  const hardReject = input.normalized.caveat_objects.some((c) =>
    c.code === "route_not_found" || c.code === "method_not_allowed" || c.code === "auth_required",
  );
  if (hardReject) {
    return "rejected";
  }

  if (input.paidCallSuccess && input.normalized.normalized.place_search_success) {
    return "verified/proven";
  }

  return "candidate/unproven";
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

  const normalized = normalizeMapsPlaceSearchResults({
    parsedJson: paid.parsedJsonAvailable ? paid.parsedJson ?? {} : paid.responsePreview,
    responsePreview: paid.responsePreview,
    statusCode: paid.statusCode ?? null,
    statusEvidence: evidence,
    paidExecutionObserved: paidSucceeded,
    canonicalInput: CANONICAL_INPUT,
  });

  const evidenceHealth = deriveMapsPlaceSearchResultsEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: paidSucceeded ? 1 : 0,
    paidFailures: paidSucceeded ? 0 : 1,
    successfulResultCounts: paidSucceeded ? [normalized.normalized.places.length] : [],
    latest: normalized,
  });

  const mergedNormalized: MapsPlaceSearchResultsNormalizedOutput = {
    ...normalized.normalized,
    evidence_health: evidenceHealth,
    caveat_objects: normalized.caveat_objects,
  };

  const routeState = deriveRouteState({
    paidCallSuccess: paidSucceeded,
    normalized: { normalized: mergedNormalized, caveat_objects: normalized.caveat_objects },
  });

  return {
    benchmark_id: BENCHMARK_ID,
    provider: route.provider,
    endpoint: route.endpoint,
    method: route.method,
    canonical_input_hash: canonicalInputHash,
    canonical_input: CANONICAL_INPUT,
    route_specific_body: body,
    paid_execution_status: paidSucceeded ? "succeeded" : "failed",
    cli_exit_code: paid.exitCode ?? null,
    status_evidence: evidence,
    normalized_output: mergedNormalized,
    result_count: mergedNormalized.result_count,
    place_search_success: mergedNormalized.place_search_success,
    query_match: mergedNormalized.query_match,
    location_match: mergedNormalized.location_match,
    sample_normalized_place_fields: mergedNormalized.places.slice(0, 3),
    caveat_objects: normalized.caveat_objects,
    evidence_health: evidenceHealth,
    route_state: routeState,
  };
}

export function renderProofMarkdown(results: PaidRouteProof[], now = new Date()): string {
  const lines: string[] = [
    "# Maps Place Search Results Paid Route Verification",
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
    lines.push(`- canonical_input: ${JSON.stringify(result.canonical_input)}`);
    lines.push(`- route_specific_body: ${JSON.stringify(result.route_specific_body)}`);
    lines.push(`- paid_execution_status: ${result.paid_execution_status}`);
    lines.push(`- cli_exit_code: ${result.cli_exit_code === null ? "null" : String(result.cli_exit_code)}`);
    lines.push(`- status_evidence: ${result.status_evidence}`);
    lines.push(`- normalized_output: ${JSON.stringify(result.normalized_output)}`);
    lines.push(`- result_count: ${result.result_count === null ? "null" : String(result.result_count)}`);
    lines.push(`- place_search_success: ${String(result.place_search_success)}`);
    lines.push(`- query_match: ${result.query_match === null ? "null" : String(result.query_match)}`);
    lines.push(`- location_match: ${result.location_match === null ? "null" : String(result.location_match)}`);
    lines.push(`- sample_normalized_place_fields: ${JSON.stringify(result.sample_normalized_place_fields)}`);
    lines.push(`- caveat_objects: ${JSON.stringify(result.caveat_objects)}`);
    lines.push(`- evidence_health: ${result.evidence_health}`);
    lines.push(`- route_state: ${result.route_state}`);
    lines.push("");
  }

  lines.push("Excluded from paid proof: paysponge/tripadvisor.");
  lines.push("No 5-run benchmark artifact generated.");
  lines.push("No benchmark recorded claim.");

  return sanitizeProofMarkdown(lines.join("\n"));
}

export async function runMapsPlaceSearchPaidVerification(
  executor: LiveExecutor = executeLivePayShCall,
  now = new Date(),
): Promise<VerifyMapsPlaceSearchPaidResult> {
  const researchConfirmed = await confirmResearchProof();
  const readinessConfirmed = await confirmReadinessNoteScaffoldReady();
  const normalizerConfirmed = await confirmNormalizerAndTests();
  const schemaEvidenceConfirmed = await confirmComparableRouteSchemaEvidence();

  const gate = validateSafetyGate(process.env, {
    researchConfirmed,
    readinessConfirmed,
    normalizerConfirmed,
    schemaEvidenceConfirmed,
  });
  if (!gate.ok) {
    throw new Error(`Safety gate failed: ${gate.reason}`);
  }

  const routes = [ROUTE_CONFIGS.google, ROUTE_CONFIGS.stableenrich]
    .filter((route) => route.providerId !== BLOCKED_PROVIDER_ID);

  const canonicalInputHash = hashCanonicalInput(CANONICAL_INPUT);
  const results: PaidRouteProof[] = [];

  for (const route of routes) {
    results.push(await runPaidRoute(route, canonicalInputHash, executor));
  }

  const datePart = now.toISOString().slice(0, 10);
  const proofPath = `live-proofs/maps-place-search-results-paid-routes-${datePart}.md`;
  const outputPath = path.resolve(process.cwd(), proofPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${renderProofMarkdown(results, now)}\n`, "utf8");
  await access(outputPath);

  return {
    benchmark_id: BENCHMARK_ID,
    proof_path: proofPath,
    attempted_routes: results,
    winner_claimed: false,
  };
}

if (require.main === module) {
  runMapsPlaceSearchPaidVerification()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            benchmark_id: result.benchmark_id,
            proof_path: result.proof_path,
            winner_claimed: result.winner_claimed,
            routes: result.attempted_routes.map((route) => ({
              provider: route.provider,
              endpoint: route.endpoint,
              paid_execution_status: route.paid_execution_status,
              result_count: route.result_count,
              place_search_success: route.place_search_success,
              query_match: route.query_match,
              location_match: route.location_match,
              route_state: route.route_state,
              evidence_health: route.evidence_health,
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
