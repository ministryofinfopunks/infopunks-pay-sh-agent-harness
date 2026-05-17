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
  /api[_-]?key\s*[:=]\s*[^\s,;)]+/gi,
  /apikey\s*[:=]\s*[^\s,;)]+/gi,
  /wallet\s*[:=]\s*[^\n]+/gi,
  /mnemonic\s*[:=]\s*[^\n]+/gi,
  /signature\s*[:=]\s*[^\n]+/gi,
];

const PAID_PROOF_REFERENCE =
  "live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md";

type ProbeMode = "unpaid_safe_probe" | "paid_pay_cli";

type ResponseShapeClassification =
  | "token_search_like_json"
  | "payment_challenge"
  | "non_json_text"
  | "empty"
  | "unknown";

export interface VerificationSemantics {
  endpointPathConfirmed: boolean;
  methodConfirmed: boolean;
  requestShapeConfirmed: boolean;
  responseShapeClassified: boolean;
  benchmarkIntentConfirmed: boolean;
  unpaid402ChallengeConfirmed: boolean;
  paidExecutionAttempted: boolean;
  responseShapeClassification: string;
}

export interface TokenSearchProbeResult {
  endpointUrl: string;
  method: string;
  mode: ProbeMode;
  success: boolean;
  executionTransport: "pay_cli" | "unpaid_http_probe";
  cliExitCode: number | null;
  statusCode: number | null;
  statusEvidence: string;
  latencyMs: number | null;
  responseShapeClassified: ResponseShapeClassification;
  tokenSearchResultDetected: boolean;
  paymentRequiredChallengeAppears: boolean;
  paidExecutionAttempted: boolean;
  responseBodyShapeAppearsTokenSearchLike: boolean;
  routeCandidateEvidence: boolean;
  executionEvidenceStatus: "unproven" | "proven";
  proofReference: string;
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

function classifyResponseShape(bodyText: string, statusCode: number | null): ResponseShapeClassification {
  if (!bodyText.trim()) {
    return "empty";
  }

  if (statusCode === 402) {
    return "payment_challenge";
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (inspectTokenSearchLikeJson(parsed)) {
      return "token_search_like_json";
    }
    return "unknown";
  } catch {
    return "non_json_text";
  }
}

function classifyStatusEvidence(input: {
  statusCode: number | null;
  cliExitCode: number | null;
  errorReason?: string;
  responsePreview: string;
  stderrPreview?: string;
}): string {
  if (input.statusCode !== null) {
    return `status_code_observed_${input.statusCode}`;
  }

  if (input.cliExitCode !== null) {
    const stderrMentionedHttp = lowerIncludesAny(input.stderrPreview ?? "", ["http/", "status", "code"]);
    const stdoutMentionedHttp = lowerIncludesAny(input.responsePreview, ["http/", "status", "code"]);
    if (stderrMentionedHttp || stdoutMentionedHttp) {
      return `pay_cli_exit_${input.cliExitCode}_without_parseable_status`;
    }
    return input.errorReason
      ? `pay_cli_exit_${input.cliExitCode}_${input.errorReason}`
      : `pay_cli_exit_${input.cliExitCode}_status_unavailable`;
  }

  return input.errorReason ? `status_unavailable_${input.errorReason}` : "status_unavailable";
}

export function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export function classifyRouteCandidateEvidence(input: {
  statusCode: number | null;
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
  statusCode: number | null;
  paymentRequiredChallengeAppears: boolean;
  routeCandidateEvidence: boolean;
  paidExecutionAttempted: boolean;
  responseShapeClassified: ResponseShapeClassification;
}): VerificationSemantics {
  const endpointPathConfirmed = input.endpointUrl.includes("/x402/onchain/search/pools") && input.endpointUrl.includes("query=SOL");
  const methodConfirmed = input.method.toUpperCase() === "GET";
  const requestShapeConfirmed = endpointPathConfirmed && methodConfirmed;
  const responseShapeClassified = input.routeCandidateEvidence || input.responseShapeClassified !== "unknown";
  const benchmarkIntentConfirmed = input.benchmarkIntent === "token search";
  const unpaid402ChallengeConfirmed = input.statusCode === 402 || input.paymentRequiredChallengeAppears;

  return {
    endpointPathConfirmed,
    methodConfirmed,
    requestShapeConfirmed,
    responseShapeClassified,
    benchmarkIntentConfirmed,
    unpaid402ChallengeConfirmed,
    paidExecutionAttempted: input.paidExecutionAttempted,
    responseShapeClassification:
      input.responseShapeClassified === "token_search_like_json"
        ? "Token-search-like JSON detected."
        : input.responseShapeClassified === "payment_challenge"
          ? "Payment challenge response observed."
          : input.responseShapeClassified === "non_json_text"
            ? "Non-JSON response body observed."
            : input.responseShapeClassified === "empty"
              ? "Empty response body observed."
              : "Response shape could not be confidently classified.",
  };
}

function hasPaymentChallenge(statusCode: number | null, headers: Headers, bodyText: string): boolean {
  if (statusCode === 402) {
    return true;
  }

  const headerKeys = Array.from(headers.keys()).map((key) => key.toLowerCase());
  return (
    headerKeys.some((key) => key.includes("x402") || key.includes("payment")) ||
    lowerIncludesAny(bodyText, ["payment required", "x402"])
  );
}

function paidExecutionSucceeded(result: TokenSearchProbeResult): boolean {
  return result.success && result.tokenSearchResultDetected;
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
    const statusCode = paidResult.statusCode ?? null;
    const cliExitCode = paidResult.exitCode ?? null;
    const responseShapeClassified = classifyResponseShape(paidResult.responsePreview, statusCode);
    const tokenSearchLike = responseBodyShapeAppearsTokenSearchLike(paidResult.responsePreview);
    const paymentChallenge = Boolean(
      paidResult.paymentRequired || paidResult.paymentRequiredHeaderPresent,
    );
    const routeCandidateEvidence = classifyRouteCandidateEvidence({
      statusCode,
      paymentRequiredChallengeAppears: paymentChallenge,
      responseBodyShapeAppearsTokenSearchLike: tokenSearchLike,
    });
    const success = paidResult.success && tokenSearchLike;
    const statusEvidence = classifyStatusEvidence({
      statusCode,
      cliExitCode,
      errorReason: paidResult.errorReason,
      responsePreview: paidResult.responsePreview,
      stderrPreview: paidResult.stderrPreview,
    });

    const probeResult: TokenSearchProbeResult = {
      endpointUrl,
      method,
      mode: "paid_pay_cli",
      success,
      executionTransport: "pay_cli",
      cliExitCode,
      statusCode,
      statusEvidence,
      latencyMs: paidResult.latencyMs ?? null,
      responseShapeClassified,
      tokenSearchResultDetected: tokenSearchLike,
      paymentRequiredChallengeAppears: paymentChallenge,
      paidExecutionAttempted: true,
      responseBodyShapeAppearsTokenSearchLike: tokenSearchLike,
      routeCandidateEvidence,
      executionEvidenceStatus: success ? "proven" : "unproven",
      proofReference: PAID_PROOF_REFERENCE,
      safeSummary: success
        ? "Paid execution succeeded for token-search semantics without exposing payment material."
        : `Paid execution did not prove token search: ${paidResult.errorReason ?? "insufficient response semantics"}.`,
      verificationSemantics: classifyVerificationSemantics({
        endpointUrl,
        method,
        benchmarkIntent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
        statusCode,
        paymentRequiredChallengeAppears: paymentChallenge,
        routeCandidateEvidence,
        paidExecutionAttempted: true,
        responseShapeClassified,
      }),
      error: success ? undefined : paidResult.errorReason,
    };

    return probeResult;
  }

  try {
    const response = await fetch(endpointUrl, {
      method,
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
    });
    const bodyText = await response.text();
    const statusCode = response.status;
    const paymentChallenge = hasPaymentChallenge(statusCode, response.headers, bodyText);
    const tokenSearchLike = responseBodyShapeAppearsTokenSearchLike(bodyText);
    const routeCandidateEvidence = classifyRouteCandidateEvidence({
      statusCode,
      paymentRequiredChallengeAppears: paymentChallenge,
      responseBodyShapeAppearsTokenSearchLike: tokenSearchLike,
    });
    const responseShapeClassified = classifyResponseShape(bodyText, statusCode);

    return {
      endpointUrl,
      method,
      mode: "unpaid_safe_probe",
      success: false,
      executionTransport: "unpaid_http_probe",
      cliExitCode: null,
      statusCode,
      statusEvidence: `http_status_${statusCode}`,
      latencyMs: null,
      responseShapeClassified,
      tokenSearchResultDetected: tokenSearchLike,
      paymentRequiredChallengeAppears: paymentChallenge,
      paidExecutionAttempted: false,
      responseBodyShapeAppearsTokenSearchLike: tokenSearchLike,
      routeCandidateEvidence,
      executionEvidenceStatus: "unproven",
      proofReference: PAID_PROOF_REFERENCE,
      safeSummary: paymentChallenge
        ? "Unpaid probe reached a payment-required challenge for the route."
        : "Unpaid probe completed without paid execution; response body inspected for coarse token-search shape.",
      verificationSemantics: classifyVerificationSemantics({
        endpointUrl,
        method,
        benchmarkIntent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
        statusCode,
        paymentRequiredChallengeAppears: paymentChallenge,
        routeCandidateEvidence,
        paidExecutionAttempted: false,
        responseShapeClassified,
      }),
    };
  } catch (error) {
    const routeCandidateEvidence = false;
    return {
      endpointUrl,
      method,
      mode: "unpaid_safe_probe",
      success: false,
      executionTransport: "unpaid_http_probe",
      cliExitCode: null,
      statusCode: null,
      statusEvidence: "status_unavailable_unpaid_probe_error",
      latencyMs: null,
      responseShapeClassified: "unknown",
      tokenSearchResultDetected: false,
      paymentRequiredChallengeAppears: false,
      paidExecutionAttempted: false,
      responseBodyShapeAppearsTokenSearchLike: false,
      routeCandidateEvidence,
      executionEvidenceStatus: "unproven",
      proofReference: PAID_PROOF_REFERENCE,
      safeSummary: "Unpaid probe failed before route evidence could be established.",
      verificationSemantics: classifyVerificationSemantics({
        endpointUrl,
        method,
        benchmarkIntent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
        statusCode: null,
        paymentRequiredChallengeAppears: false,
        routeCandidateEvidence,
        paidExecutionAttempted: false,
        responseShapeClassified: "unknown",
      }),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function renderProofMarkdown(result: TokenSearchProbeResult, generatedAt = new Date()): string {
  const date = generatedAt.toISOString();
  const markdown = [
    "# PaySponge CoinGecko Token Search Paid Execution Evidence",
    "",
    `- generated_at: ${date}`,
    `- provider_id: ${payspongeCoinGeckoTokenSearchCandidate.provider_id}`,
    `- endpoint: ${result.endpointUrl}`,
    `- method: ${result.method}`,
    `- paid_execution_attempted: ${result.paidExecutionAttempted}`,
    `- success: ${result.success}`,
    `- execution_transport: ${result.executionTransport}`,
    `- cli_exit_code: ${result.cliExitCode === null ? "null" : result.cliExitCode}`,
    `- status_code: ${result.statusCode === null ? "null" : result.statusCode}`,
    `- status_evidence: ${result.statusEvidence}`,
    `- latency_ms: ${result.latencyMs === null ? "null" : result.latencyMs}`,
    `- response_shape_classified: ${result.responseShapeClassified}`,
    `- token_search_result_detected: ${result.tokenSearchResultDetected}`,
    `- proof_reference: ${result.proofReference}`,
    "",
    "## Response Summary",
    "",
    `- response_shape_summary: ${result.verificationSemantics.responseShapeClassification}`,
    `- token_search_semantic_summary: ${result.safeSummary}`,
    `- mapping_status_target: verified`,
    `- execution_evidence_status_target: ${result.executionEvidenceStatus}`,
    "",
    "## Scope",
    "",
    "No benchmark readiness claim.",
    "No winner claim.",
    "",
  ].join("\n");

  return sanitizeProofMarkdown(markdown);
}

function renderMappingForResult(result: TokenSearchProbeResult): string {
  const proven = paidExecutionSucceeded(result);
  const status = proven ? "proven" : "unproven";
  const notes = proven
    ? "Paid execution succeeded for token-search route. This proves route execution, not benchmark readiness or superiority."
    : "Paid execution attempt did not succeed for token-search semantics. Mapping remains verified/unproven and this does not imply benchmark readiness or superiority.";

  return [
    "export const payspongeCoinGeckoTokenSearchCandidate = {",
    `  provider_id: \"${payspongeCoinGeckoTokenSearchCandidate.provider_id}\",`,
    `  provider_name: \"${payspongeCoinGeckoTokenSearchCandidate.provider_name}\",`,
    `  category: \"${payspongeCoinGeckoTokenSearchCandidate.category}\",`,
    `  benchmark_intent: \"${payspongeCoinGeckoTokenSearchCandidate.benchmark_intent}\",`,
    "  mapping_status: \"verified\",",
    `  execution_evidence_status: \"${status}\",`,
    "  verified_at: \"2026-05-17\",",
    proven ? "  proven_at: \"2026-05-17\"," : "  proven_at: null,",
    "  proof_source: \"infopunks-pay-sh-agent-harness\",",
    `  proof_reference: \"${PAID_PROOF_REFERENCE}\",`,
    `  endpoint_url: \"${payspongeCoinGeckoTokenSearchCandidate.endpoint_url}\",`,
    `  method: \"${payspongeCoinGeckoTokenSearchCandidate.method}\",`,
    '  request_shape_example: { query: "SOL" },',
    "  response_shape_expected:",
    '    "search/pools token/pool results with SOL/USDC-like pool expected when paid execution succeeds",',
    "  notes:",
    `    \"${notes}\",`,
    "} as const;",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const result = await probePaySpongeCoinGeckoTokenSearch();
  const now = new Date();
  const outputPath = path.resolve(process.cwd(), PAID_PROOF_REFERENCE);
  const markdown = renderProofMarkdown(result, now);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");

  const mappingPath = path.resolve(process.cwd(), "src/mappings/payspongeCoinGeckoTokenSearch.ts");
  await writeFile(mappingPath, renderMappingForResult(result), "utf8");

  console.log(`Wrote ${outputPath}`);
  console.log(`Updated ${mappingPath}`);
  console.log(
    JSON.stringify(
      {
        provider_id: payspongeCoinGeckoTokenSearchCandidate.provider_id,
        endpoint_url: result.endpointUrl,
        method: result.method,
        paid_execution_attempted: result.paidExecutionAttempted,
        success: result.success,
        execution_transport: result.executionTransport,
        cli_exit_code: result.cliExitCode,
        status_code: result.statusCode,
        status_evidence: result.statusEvidence,
        latency_ms: result.latencyMs,
        response_shape_classified: result.responseShapeClassified,
        token_search_result_detected: result.tokenSearchResultDetected,
        execution_evidence_status: result.executionEvidenceStatus,
        proof_reference: result.proofReference,
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
