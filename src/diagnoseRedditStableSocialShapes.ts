import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import {
  deriveSocialDataRedditPostSearchEvidenceHealth,
  normalizeSocialDataRedditPostSearch,
  type CaveatObject,
  type SocialDataRedditPostSearchNormalizedOutput,
} from "./benchmarks/socialDataRedditPostSearchNormalization";

const BENCHMARK_ID = "social-data-reddit-post-search";
const PROVIDER = "StableSocial";
const PROVIDER_ID = "merit-systems/stablesocial/social-data";
const ENDPOINT = "https://stablesocial.dev/api/reddit/search";
const METHOD = "POST";
const CANONICAL_INPUT = { query: "x402", limit: 5 } as const;

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

type RouteState = "verified/proven" | "candidate/unproven" | "rejected";

interface Variant {
  label: "A" | "B" | "C" | "D" | "E" | "F";
  body: Record<string, unknown>;
}

interface UnpaidProbeResult {
  label: Variant["label"];
  body: Record<string, unknown>;
  status_code: number | null;
  payment_challenge_detected: boolean;
  has_www_authenticate: boolean;
  content_type: string | null;
  status_evidence: string;
  response_preview: string;
}

interface PaidRetryResult {
  selected_variant: Variant["label"];
  request_body: Record<string, unknown>;
  paid_execution_status: "succeeded" | "failed";
  cli_exit_code: number | null;
  status_evidence: string;
  normalized_output: SocialDataRedditPostSearchNormalizedOutput;
  result_count: number | null;
  search_success: boolean;
  caveat_objects: CaveatObject[];
  evidence_health: SocialDataRedditPostSearchNormalizedOutput["evidence_health"];
  route_state: RouteState;
  blocker: string | null;
}

const VARIANTS: Variant[] = [
  { label: "A", body: { keywords: "x402", max_posts: 5 } },
  { label: "B", body: { keywords: ["x402"], max_posts: 5 } },
  { label: "C", body: { keywords: "x402", max_page_size: 5 } },
  { label: "D", body: { keywords: ["x402"], max_page_size: 5 } },
  { label: "E", body: { query: "x402", max_posts: 5 } },
  { label: "F", body: { keyword: "x402", max_posts: 5 } },
];

function paidExecutionEnabled(): boolean {
  return process.env.LIVE_PAYSH_EXECUTION === "true" && process.env.PAYSH_EXECUTION_MODE === "pay_cli";
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

async function unpaidProbe(variant: Variant): Promise<UnpaidProbeResult> {
  try {
    const response = await fetch(ENDPOINT, {
      method: METHOD,
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
      body: JSON.stringify(variant.body),
    });

    const bodyText = await response.text();
    const paymentRequiredHeader = response.headers.get("payment-required");
    const wwwAuth = response.headers.get("www-authenticate");

    return {
      label: variant.label,
      body: variant.body,
      status_code: response.status,
      payment_challenge_detected: Boolean(paymentRequiredHeader || response.status === 402),
      has_www_authenticate: Boolean(wwwAuth),
      content_type: response.headers.get("content-type"),
      status_evidence: `status_code_observed_${response.status}`,
      response_preview: bodyText.slice(0, 300),
    };
  } catch (error) {
    return {
      label: variant.label,
      body: variant.body,
      status_code: null,
      payment_challenge_detected: false,
      has_www_authenticate: false,
      content_type: null,
      status_evidence: `probe_error_${error instanceof Error ? error.message : String(error)}`,
      response_preview: "",
    };
  }
}

async function runSinglePaidRetry(variant: Variant): Promise<PaidRetryResult> {
  const paid = await executeLivePayShCall({
    providerId: PROVIDER_ID,
    intent: BENCHMARK_ID,
    endpointUrl: ENDPOINT,
    method: METHOD,
    bodyJson: variant.body,
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

  const blocker = routeState === "verified/proven" ? null : "paid_execution_succeeded_but_no_posts_returned";

  return {
    selected_variant: variant.label,
    request_body: variant.body,
    paid_execution_status: paidSucceeded ? "succeeded" : "failed",
    cli_exit_code: paid.exitCode ?? null,
    status_evidence: evidence,
    normalized_output: mergedNormalized,
    result_count: mergedNormalized.result_count,
    search_success: mergedNormalized.search_success,
    caveat_objects: normalizedResult.caveat_objects,
    evidence_health: evidenceHealth,
    route_state: routeState,
    blocker,
  };
}

function selectMostLikelyPaidVariant(unpaid: UnpaidProbeResult[]): Variant {
  const preferred = unpaid.find((p) => p.label === "A");
  if (preferred) {
    return VARIANTS.find((v) => v.label === preferred.label) ?? VARIANTS[0]!;
  }
  return VARIANTS[0]!;
}

function renderProofMarkdown(input: {
  now: Date;
  unpaid: UnpaidProbeResult[];
  paidRetry: PaidRetryResult | null;
  paidRetryAttempted: boolean;
}): string {
  const all402 = input.unpaid.every((item) => item.status_code === 402 && item.payment_challenge_detected);

  const lines: string[] = [
    "# StableSocial Reddit Search Shape Diagnostic",
    "",
    `- generated_at: ${input.now.toISOString()}`,
    `- benchmark_id: ${BENCHMARK_ID}`,
    `- provider: ${PROVIDER}`,
    `- provider_id: ${PROVIDER_ID}`,
    `- endpoint: ${ENDPOINT}`,
    `- method: ${METHOD}`,
    `- canonical_input: ${JSON.stringify(CANONICAL_INPUT)}`,
    "",
    "## Candidate Body Variants Tested",
  ];

  for (const variant of VARIANTS) {
    lines.push(`- ${variant.label}: ${JSON.stringify(variant.body)}`);
  }

  lines.push("", "## Unpaid Status Evidence");
  for (const row of input.unpaid) {
    lines.push(
      `- ${row.label}: status_code=${row.status_code === null ? "null" : String(row.status_code)} payment_challenge_detected=${String(row.payment_challenge_detected)} has_www_authenticate=${String(row.has_www_authenticate)} content_type=${row.content_type ?? "null"} status_evidence=${row.status_evidence}`,
    );
  }

  if (all402) {
    lines.push("- unpaid_compatibility_conclusion: all variants returned 402 with payment challenge; request-shape compatibility remains payment-gated and semantically unproven.");
  }

  lines.push("", "## Paid Retry");
  lines.push(`- paid_retry_attempted: ${String(input.paidRetryAttempted)}`);

  if (input.paidRetry) {
    lines.push(`- selected_paid_body_variant: ${input.paidRetry.selected_variant}`);
    lines.push(`- selected_paid_body: ${JSON.stringify(input.paidRetry.request_body)}`);
    lines.push(`- paid_execution_status: ${input.paidRetry.paid_execution_status}`);
    lines.push(`- cli_exit_code: ${input.paidRetry.cli_exit_code === null ? "null" : String(input.paidRetry.cli_exit_code)}`);
    lines.push(`- status_evidence: ${input.paidRetry.status_evidence}`);
    lines.push(`- normalized_output: ${JSON.stringify(input.paidRetry.normalized_output)}`);
    lines.push(`- result_count: ${input.paidRetry.result_count === null ? "null" : String(input.paidRetry.result_count)}`);
    lines.push(`- search_success: ${String(input.paidRetry.search_success)}`);
    lines.push(`- caveat_objects: ${JSON.stringify(input.paidRetry.caveat_objects)}`);
    lines.push(`- evidence_health: ${input.paidRetry.evidence_health}`);
    lines.push(`- route_state: ${input.paidRetry.route_state}`);
    if (input.paidRetry.blocker) {
      lines.push(`- blocker: ${input.paidRetry.blocker}`);
      lines.push("- recommendation: keep StableSocial as candidate/unproven and use alternate second Reddit/search route or keep scaffold.");
    }
  } else {
    lines.push("- paid_retry_skipped_reason: LIVE_PAYSH_EXECUTION=true and PAYSH_EXECUTION_MODE=pay_cli were not both set.");
    lines.push("- route_state: candidate/unproven");
  }

  lines.push("", "No 5-run benchmark artifact generated.");
  lines.push("No benchmark recorded claim.");
  lines.push("No winner claim.");

  return sanitizeProofMarkdown(lines.join("\n"));
}

async function main(): Promise<void> {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const proofPath = `live-proofs/social-data-reddit-post-search-stablesocial-shape-diagnostic-${datePart}.md`;

  const unpaid = await Promise.all(VARIANTS.map((variant) => unpaidProbe(variant)));

  const canRunPaid = paidExecutionEnabled();
  const selected = selectMostLikelyPaidVariant(unpaid);
  const paidRetry = canRunPaid ? await runSinglePaidRetry(selected) : null;

  const markdown = renderProofMarkdown({
    now,
    unpaid,
    paidRetry,
    paidRetryAttempted: canRunPaid,
  });

  const out = path.resolve(process.cwd(), proofPath);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${markdown}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        benchmark_id: BENCHMARK_ID,
        provider: PROVIDER,
        proof_path: proofPath,
        paid_retry_attempted: canRunPaid,
        paid_retry_variant: canRunPaid ? selected.label : null,
        paid_execution_status: paidRetry?.paid_execution_status ?? null,
        route_state: paidRetry?.route_state ?? "candidate/unproven",
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
