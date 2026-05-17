import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { payspongeCoinGeckoTokenSearchCandidate } from "./mappings/payspongeCoinGeckoTokenSearch";

const SENSITIVE_PATTERNS = [
  /authorization\s*[:=]\s*[^\n]+/gi,
  /x-payment\s*[:=]\s*[^\n]+/gi,
  /payment-signature\s*[:=]\s*[^\n]+/gi,
  /private[_ -]?key\s*[:=]\s*[^\s,;)]+/gi,
  /seed[_ -]?phrase\s*[:=]\s*[^\n]+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
];

type ProbeMode = "unpaid_safe_probe" | "paid_pay_cli";

export interface VerificationSemantics {
  endpointPathConfirmed: boolean;
  methodConfirmed: boolean;
  requestShapeConfirmed: boolean;
  responseShapeClassified: boolean;
  benchmarkIntentConfirmed: boolean;
  unpaid402ChallengeConfirmed: boolean;
  paidExecutionAttempted: false;
  responseShapeClassification: string;
}

export interface TokenSearchProbeResult {
  endpointUrl: string;
  method: string;
  mode: ProbeMode;
  statusCode?: number;
  paymentRequiredChallengeAppears: boolean;
  paidExecutionAttempted: boolean;
  responseBodyShapeAppearsTokenSearchLike: boolean;
  routeCandidateEvidence: boolean;
  executionEvidenceStatus: "unproven" | "paid_execution_observed";
  safeSummary: string;
  verificationSemantics: VerificationSemantics;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lowerIncludesAny(value: string, needles: string[]): boolean {
  const lowered = value.toLowerCase();
  return needles.some((needle) => lowered.includes(needle));
}

function inspectTokenSearchLikeJson(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(inspectTokenSearchLikeJson);
  }

  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value).map((key) => key.toLowerCase());
  const hasSearchContainer = keys.some((key) =>
    ["data", "pools", "tokens", "included", "attributes", "relationships"].includes(key),
  );
  const hasTokenOrPoolField = keys.some((key) =>
    ["pool", "pools", "token", "tokens", "base_token", "quote_token", "base_token_price_usd"].includes(key),
  );
  const text = JSON.stringify(value).slice(0, 20000);
  const mentionsSolLikePair = lowerIncludesAny(text, ["sol", "wrapped sol", "wsol", "usdc"]);

  if ((hasSearchContainer || hasTokenOrPoolField) && mentionsSolLikePair) {
    return true;
  }

  return Object.values(value).some(inspectTokenSearchLikeJson);
}

export function responseBodyShapeAppearsTokenSearchLike(bodyText: string): boolean {
  if (!bodyText.trim()) {
    return false;
  }

  try {
    return inspectTokenSearchLikeJson(JSON.parse(bodyText) as unknown);
  } catch {
    return lowerIncludesAny(bodyText, ["pool", "token", "sol", "usdc"]);
  }
}

export function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export function classifyRouteCandidateEvidence(input: {
  statusCode?: number;
  paymentRequiredChallengeAppears: boolean;
  responseBodyShapeAppearsTokenSearchLike: boolean;
}): boolean {
  return (
    input.responseBodyShapeAppearsTokenSearchLike ||
    input.statusCode === 402 ||
    input.paymentRequiredChallengeAppears
  );
}

export function paidExecutionEnabled(): boolean {
  return process.env.LIVE_PAYSH_EXECUTION === "true" && process.env.PAYSH_EXECUTION_MODE === "pay_cli";
}

export function classifyVerificationSemantics(input: {
  endpointUrl: string;
  method: string;
  benchmarkIntent: string;
  statusCode?: number;
  paymentRequiredChallengeAppears: boolean;
  routeCandidateEvidence: boolean;
  paidExecutionAttempted: boolean;
}): VerificationSemantics {
  const endpointPathConfirmed = input.endpointUrl.includes("/x402/onchain/search/pools") && input.endpointUrl.includes("query=SOL");
  const methodConfirmed = input.method.toUpperCase() === "GET";
  const requestShapeConfirmed = endpointPathConfirmed && methodConfirmed;
  const responseShapeClassified = input.routeCandidateEvidence || input.statusCode === 402 || input.paymentRequiredChallengeAppears;
  const benchmarkIntentConfirmed = input.benchmarkIntent === "token search";
  const unpaid402ChallengeConfirmed = input.statusCode === 402 || input.paymentRequiredChallengeAppears;

  return {
    endpointPathConfirmed,
    methodConfirmed,
    requestShapeConfirmed,
    responseShapeClassified,
    benchmarkIntentConfirmed,
    unpaid402ChallengeConfirmed,
    paidExecutionAttempted: false,
    responseShapeClassification:
      "Expected response shape classified. Paid response body not fetched in this verification pass.",
  };
}

function hasPaymentChallenge(statusCode: number | undefined, headers: Headers, bodyText: string): boolean {
  if (statusCode === 402) {
    return true;
  }

  const headerKeys = Array.from(headers.keys()).map((key) => key.toLowerCase());
  return (
    headerKeys.some((key) => key.includes("x402") || key.includes("payment")) ||
    lowerIncludesAny(bodyText, ["payment required", "x402"])
  );
}

export async function probePaySpongeCoinGeckoTokenSearch(): Promise<TokenSearchProbeResult> {
  const endpointUrl = payspongeCoinGeckoTokenSearchCandidate.endpoint_url;
  const method = payspongeCoinGeckoTokenSearchCandidate.method;

  if (paidExecutionEnabled()) {
    const paidResult = await executeLivePayShCall({
      providerId: payspongeCoinGeckoTokenSearchCandidate.provider_id,
      intent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
      endpointUrl,
      method,
    });
    const tokenSearchLike = responseBodyShapeAppearsTokenSearchLike(paidResult.responsePreview);
    const routeCandidateEvidence = classifyRouteCandidateEvidence({
      statusCode: paidResult.statusCode,
      paymentRequiredChallengeAppears: Boolean(
        paidResult.paymentRequired || paidResult.paymentRequiredHeaderPresent,
      ),
      responseBodyShapeAppearsTokenSearchLike: tokenSearchLike,
    });
    return {
      endpointUrl,
      method,
      mode: "paid_pay_cli",
      statusCode: paidResult.statusCode,
      paymentRequiredChallengeAppears: Boolean(
        paidResult.paymentRequired || paidResult.paymentRequiredHeaderPresent,
      ),
      paidExecutionAttempted: true,
      responseBodyShapeAppearsTokenSearchLike: tokenSearchLike,
      routeCandidateEvidence,
      executionEvidenceStatus:
        paidResult.success && tokenSearchLike ? "paid_execution_observed" : "unproven",
      safeSummary: paidResult.success
        ? "Paid pay CLI execution returned a successful response preview with no raw payment material recorded."
        : `Paid pay CLI execution did not prove token search: ${paidResult.errorReason ?? "unknown result"}.`,
      verificationSemantics: classifyVerificationSemantics({
        endpointUrl,
        method,
        benchmarkIntent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
        statusCode: paidResult.statusCode,
        paymentRequiredChallengeAppears: Boolean(
          paidResult.paymentRequired || paidResult.paymentRequiredHeaderPresent,
        ),
        routeCandidateEvidence,
        paidExecutionAttempted: true,
      }),
      error: paidResult.success ? undefined : paidResult.errorReason,
    };
  }

  try {
    const response = await fetch(endpointUrl, {
      method,
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
    });
    const bodyText = await response.text();
    const paymentChallenge = hasPaymentChallenge(response.status, response.headers, bodyText);
    const tokenSearchLike = responseBodyShapeAppearsTokenSearchLike(bodyText);
    const routeCandidateEvidence = classifyRouteCandidateEvidence({
      statusCode: response.status,
      paymentRequiredChallengeAppears: paymentChallenge,
      responseBodyShapeAppearsTokenSearchLike: tokenSearchLike,
    });

    return {
      endpointUrl,
      method,
      mode: "unpaid_safe_probe",
      statusCode: response.status,
      paymentRequiredChallengeAppears: paymentChallenge,
      paidExecutionAttempted: false,
      responseBodyShapeAppearsTokenSearchLike: tokenSearchLike,
      routeCandidateEvidence,
      executionEvidenceStatus: "unproven",
      safeSummary: paymentChallenge
        ? "Unpaid probe reached a payment-required challenge for the route."
        : "Unpaid probe completed without paid execution; response body was inspected only for coarse token-search shape.",
      verificationSemantics: classifyVerificationSemantics({
        endpointUrl,
        method,
        benchmarkIntent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
        statusCode: response.status,
        paymentRequiredChallengeAppears: paymentChallenge,
        routeCandidateEvidence,
        paidExecutionAttempted: false,
      }),
    };
  } catch (error) {
    const routeCandidateEvidence = false;
    return {
      endpointUrl,
      method,
      mode: "unpaid_safe_probe",
      paidExecutionAttempted: false,
      paymentRequiredChallengeAppears: false,
      responseBodyShapeAppearsTokenSearchLike: false,
      routeCandidateEvidence,
      executionEvidenceStatus: "unproven",
      safeSummary: "Unpaid probe failed before route evidence could be established.",
      verificationSemantics: classifyVerificationSemantics({
        endpointUrl,
        method,
        benchmarkIntent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
        paymentRequiredChallengeAppears: false,
        routeCandidateEvidence,
        paidExecutionAttempted: false,
      }),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function renderProofMarkdown(result: TokenSearchProbeResult, generatedAt = new Date()): string {
  const date = generatedAt.toISOString();
  const markdown = [
    "# PaySponge CoinGecko Token Search Verified/Unproven Evidence",
    "",
    `- generated_at: ${date}`,
    `- provider_id: ${payspongeCoinGeckoTokenSearchCandidate.provider_id}`,
    `- provider_name: ${payspongeCoinGeckoTokenSearchCandidate.provider_name}`,
    `- category: ${payspongeCoinGeckoTokenSearchCandidate.category}`,
    `- benchmark_intent: ${payspongeCoinGeckoTokenSearchCandidate.benchmark_intent}`,
    `- endpoint: ${result.endpointUrl}`,
    `- method: ${result.method}`,
    "- request_shape_example: { \"query\": \"SOL\" }",
    `- mapping_status: ${payspongeCoinGeckoTokenSearchCandidate.mapping_status}`,
    `- execution_evidence_status: ${result.executionEvidenceStatus}`,
    `- status_code: ${result.statusCode ?? "unavailable"}`,
    `- unpaid_402_challenge_confirmed: ${result.verificationSemantics.unpaid402ChallengeConfirmed}`,
    `- paid_execution_attempted: ${result.verificationSemantics.paidExecutionAttempted}`,
    `- endpoint_path_confirmed: ${result.verificationSemantics.endpointPathConfirmed}`,
    `- method_confirmed: ${result.verificationSemantics.methodConfirmed}`,
    `- request_shape_confirmed: ${result.verificationSemantics.requestShapeConfirmed}`,
    `- response_shape_classified: ${result.verificationSemantics.responseShapeClassified}`,
    `- benchmark_intent_confirmed: ${result.verificationSemantics.benchmarkIntentConfirmed}`,
    `- response_shape_classification: ${result.verificationSemantics.responseShapeClassification}`,
    `- unpaid_probe_status: ${result.safeSummary}`,
    `- error: ${result.error ?? "none"}`,
    "",
    "## Expected Response Semantics",
    "",
    "- search/pools endpoint.",
    "- token/pool search result.",
    "- SOL/USDC-like pool result expected when paid execution succeeds.",
    "",
    "## Scope",
    "",
    "No benchmark readiness claim.",
    "No winner claim.",
    "",
  ].join("\n");

  return sanitizeProofMarkdown(markdown);
}

async function main(): Promise<void> {
  const result = await probePaySpongeCoinGeckoTokenSearch();
  const now = new Date();
  const dateSlug = now.toISOString().slice(0, 10);
  const outputDir = path.resolve(process.cwd(), "live-proofs");
  const outputPath = path.join(outputDir, `paysponge-coingecko-token-search-probe-${dateSlug}.md`);
  const markdown = renderProofMarkdown(result, now);

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  console.log(`Wrote ${outputPath}`);
  console.log(
    JSON.stringify(
      {
        endpoint_url: result.endpointUrl,
        method: result.method,
        status_code: result.statusCode ?? null,
        payment_required_challenge_appears: result.paymentRequiredChallengeAppears,
        paid_execution_attempted: result.paidExecutionAttempted,
        route_candidate_evidence: result.routeCandidateEvidence,
        execution_evidence_status: result.executionEvidenceStatus,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
