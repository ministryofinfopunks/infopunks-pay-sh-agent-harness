import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { executeLivePayShCall } from "./livePayShExecutor";
import {
  deriveSocialDataRedditPostSearchEvidenceHealth,
  normalizeSocialDataRedditPostSearch,
  type CaveatObject,
  type SocialDataRedditPostSearchNormalizedOutput,
} from "./benchmarks/socialDataRedditPostSearchNormalization";

const BENCHMARK_ID = "social-data-reddit-post-search";
const PROVIDER_ID_STABLEENRICH = "merit-systems/stableenrich/enrichment";
const PROVIDER_ID_STABLESOCIAL = "merit-systems/stablesocial/social-data";
const ROUTES = [
  {
    provider: "StableEnrich",
    providerId: PROVIDER_ID_STABLEENRICH,
    endpoint: "https://stableenrich.dev/api/reddit/search",
    method: "POST" as const,
    buildBody: (input: CanonicalInput) => ({ query: input.query, maxResults: input.limit }),
  },
  {
    provider: "StableSocial",
    providerId: PROVIDER_ID_STABLESOCIAL,
    endpoint: "https://stablesocial.dev/api/reddit/search",
    method: "POST" as const,
    buildBody: (input: CanonicalInput) => ({ keywords: input.query, max_posts: input.limit, max_page_size: input.limit }),
  },
] as const;

const CANONICAL_INPUT = {
  query: "x402",
  limit: 5,
} as const;

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

type CanonicalInput = {
  query: string;
  limit: number;
};

type RouteState = "verified/proven" | "candidate/unproven" | "rejected";

type PaidExecutionStatus = "succeeded" | "failed";

interface RouteProof {
  provider: string;
  endpoint: string;
  method: "POST";
  canonical_input_hash: string;
  paid_execution_status: PaidExecutionStatus;
  cli_exit_code: number | null;
  status_evidence: string;
  normalized_output: SocialDataRedditPostSearchNormalizedOutput;
  result_count: number | null;
  search_success: boolean;
  sample_normalized_post_fields: SocialDataRedditPostSearchNormalizedOutput["posts"][number] | null;
  caveat_objects: CaveatObject[];
  evidence_health: SocialDataRedditPostSearchNormalizedOutput["evidence_health"];
  route_state: RouteState;
}

function hashCanonicalInput(input: CanonicalInput): string {
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

function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

function deriveRouteState(input: {
  paidExecutionSucceeded: boolean;
  normalized: SocialDataRedditPostSearchNormalizedOutput;
  caveats: CaveatObject[];
}): RouteState {
  const hardReject = input.caveats.some((c) => c.code === "route_not_found" || c.code === "auth_required");
  if (hardReject) {
    return "rejected";
  }
  if (input.paidExecutionSucceeded && input.normalized.posts.length > 0 && input.normalized.search_success) {
    return "verified/proven";
  }
  return "candidate/unproven";
}

async function confirmUnpaidResearch(): Promise<boolean> {
  const proofPath = path.resolve(process.cwd(), "live-proofs/social-data-reddit-post-search-candidate-research-2026-05-19.md");
  let text: string;
  try {
    text = await readFile(proofPath, "utf8");
  } catch {
    return false;
  }

  const hasStableEnrich =
    text.includes(PROVIDER_ID_STABLEENRICH) &&
    text.includes("https://stableenrich.dev/api/reddit/search") &&
    text.includes("query");
  const hasStableSocial =
    text.includes(PROVIDER_ID_STABLESOCIAL) &&
    text.includes("https://stablesocial.dev/api/reddit/search") &&
    (text.includes("keywords") || text.includes("query"));

  return hasStableEnrich && hasStableSocial;
}

function ensureSafetyGate(unpaidResearchConfirmed: boolean): void {
  if (!unpaidResearchConfirmed) {
    throw new Error("Safety gate failed: unpaid research evidence for both Reddit routes is missing or incomplete.");
  }
  if (process.env.LIVE_PAYSH_EXECUTION !== "true") {
    throw new Error("Safety gate failed: LIVE_PAYSH_EXECUTION must be true.");
  }
  if (process.env.PAYSH_EXECUTION_MODE !== "pay_cli") {
    throw new Error("Safety gate failed: PAYSH_EXECUTION_MODE must be pay_cli.");
  }
}

async function runRoute(route: (typeof ROUTES)[number], canonicalInputHash: string): Promise<RouteProof> {
  const paid = await executeLivePayShCall({
    providerId: route.providerId,
    intent: BENCHMARK_ID,
    endpointUrl: route.endpoint,
    method: route.method,
    bodyJson: route.buildBody(CANONICAL_INPUT),
    headers: {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    },
  });

  const paidSucceeded = paid.success;
  const evidence = statusEvidence(paid.statusCode ?? null, paid.exitCode ?? null, paid.errorReason);
  const normalizedResult = normalizeSocialDataRedditPostSearch({
    parsedJson: paid.parsedJsonAvailable ? paid.parsedJson ?? {} : paid.responsePreview,
    responsePreview: paid.responsePreview,
    statusCode: paid.statusCode ?? null,
    statusEvidence: evidence,
    paidExecutionObserved: paidSucceeded,
    canonicalInput: CANONICAL_INPUT,
  });

  const evidenceHealth = deriveSocialDataRedditPostSearchEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: paidSucceeded ? 1 : 0,
    paidFailures: paidSucceeded ? 0 : 1,
    successfulPostCounts: paidSucceeded ? [normalizedResult.normalized.posts.length] : [],
    latest: normalizedResult,
  });

  const mergedNormalized: SocialDataRedditPostSearchNormalizedOutput = {
    ...normalizedResult.normalized,
    evidence_health: evidenceHealth,
    caveat_objects: normalizedResult.caveat_objects,
  };

  const routeState = deriveRouteState({
    paidExecutionSucceeded: paidSucceeded,
    normalized: mergedNormalized,
    caveats: normalizedResult.caveat_objects,
  });

  return {
    provider: route.provider,
    endpoint: route.endpoint,
    method: route.method,
    canonical_input_hash: canonicalInputHash,
    paid_execution_status: paidSucceeded ? "succeeded" : "failed",
    cli_exit_code: paid.exitCode ?? null,
    status_evidence: evidence,
    normalized_output: mergedNormalized,
    result_count: mergedNormalized.result_count,
    search_success: mergedNormalized.search_success,
    sample_normalized_post_fields: mergedNormalized.posts[0] ?? null,
    caveat_objects: normalizedResult.caveat_objects,
    evidence_health: evidenceHealth,
    route_state: routeState,
  };
}

function renderProofMarkdown(results: RouteProof[], now = new Date()): string {
  const lines: string[] = [
    "# Social Data Reddit Post Search Paid Route Verification",
    "",
    `- generated_at: ${now.toISOString()}`,
    `- benchmark_id: ${BENCHMARK_ID}`,
    `- canonical_input: ${JSON.stringify(CANONICAL_INPUT)}`,
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.provider}`);
    lines.push(`- provider: ${result.provider}`);
    lines.push(`- endpoint: ${result.endpoint}`);
    lines.push(`- method: ${result.method}`);
    lines.push(`- canonical_input_hash: ${result.canonical_input_hash}`);
    lines.push(`- paid_execution_status: ${result.paid_execution_status}`);
    lines.push(`- cli_exit_code: ${result.cli_exit_code === null ? "null" : String(result.cli_exit_code)}`);
    lines.push(`- status_evidence: ${result.status_evidence}`);
    lines.push(`- normalized_output: ${JSON.stringify(result.normalized_output)}`);
    lines.push(`- result_count: ${result.result_count === null ? "null" : String(result.result_count)}`);
    lines.push(`- search_success: ${String(result.search_success)}`);
    lines.push(`- sample_normalized_post_fields: ${JSON.stringify(result.sample_normalized_post_fields)}`);
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

async function main(): Promise<void> {
  const unpaidResearchConfirmed = await confirmUnpaidResearch();
  ensureSafetyGate(unpaidResearchConfirmed);

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const proofPath = `live-proofs/social-data-reddit-post-search-paid-routes-${datePart}.md`;
  const canonicalInputHash = hashCanonicalInput(CANONICAL_INPUT);

  const results: RouteProof[] = [];
  for (const route of ROUTES) {
    results.push(await runRoute(route, canonicalInputHash));
  }

  const outputPath = path.resolve(process.cwd(), proofPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${renderProofMarkdown(results, now)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        benchmark_id: BENCHMARK_ID,
        proof_path: proofPath,
        routes: results.map((entry) => ({
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
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
