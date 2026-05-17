import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { payspongeCoinGeckoTokenLookupCandidate } from "./mappings/payspongeCoinGeckoTokenLookupCandidate";

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

const SAFE_PROOF_REFERENCE = "live-proofs/paysponge-coingecko-token-search-candidate-or-paid-2026-05-17.md";
const RAW_PROOF_REFERENCE = "proofs/paysponge-coingecko-token-lookup-candidate-or-paid-2026-05-17.json";

type ProbeMode = "unpaid_safe_probe" | "paid_pay_cli";

export interface LookupProbeResult {
  endpointUrl: string;
  method: string;
  mode: ProbeMode;
  mappingStatusTarget: "candidate" | "verified";
  executionEvidenceStatus: "unproven" | "proven";
  success: boolean;
  statusCode: number | null;
  cliExitCode: number | null;
  paidExecutionAttempted: boolean;
  paymentRequiredChallengeAppears: boolean;
  endpointPathConfirmed: boolean;
  methodConfirmed: boolean;
  requestShapeConfirmed: boolean;
  responseShapeClassified: boolean;
  benchmarkIntentConfirmed: boolean;
  tokenLookupLikeShapeDetected: boolean;
  statusEvidence: string;
  responseShapeSummary: string;
  safeSummary: string;
}

function lowerIncludesAny(value: string, needles: string[]): boolean {
  const lowered = value.toLowerCase();
  return needles.some((needle) => lowered.includes(needle));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenLookupLikeJson(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(isTokenLookupLikeJson);
  }
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value).map((key) => key.toLowerCase());
  const hasTokenishKey = keys.some((key) =>
    ["token", "tokens", "address", "symbol", "name", "attributes", "data"].includes(key),
  );
  const text = JSON.stringify(value).slice(0, 20000).toLowerCase();
  const hasWsolLikeText = text.includes("so11111111111111111111111111111111111111112") || text.includes("wsol");
  return hasTokenishKey && hasWsolLikeText;
}

function classifyStatusEvidence(input: {
  statusCode: number | null;
  cliExitCode: number | null;
  responsePreview: string;
  errorReason?: string;
}): string {
  if (input.statusCode !== null) {
    return `status_code_observed_${input.statusCode}`;
  }
  if (input.cliExitCode !== null) {
    return input.errorReason
      ? `pay_cli_exit_${input.cliExitCode}_${input.errorReason}`
      : `pay_cli_exit_${input.cliExitCode}_status_unavailable`;
  }
  if (lowerIncludesAny(input.responsePreview, ["payment required", "x402"])) {
    return "status_unavailable_payment_challenge_text_detected";
  }
  return input.errorReason ? `status_unavailable_${input.errorReason}` : "status_unavailable";
}

function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export function paidExecutionEnabled(): boolean {
  return process.env.LIVE_PAYSH_EXECUTION === "true" && process.env.PAYSH_EXECUTION_MODE === "pay_cli";
}

function classifyPathAndShape(endpointUrl: string, method: string): {
  endpointPathConfirmed: boolean;
  methodConfirmed: boolean;
  requestShapeConfirmed: boolean;
} {
  const endpointPathConfirmed =
    endpointUrl.includes("/x402/onchain/networks/solana/tokens/") &&
    endpointUrl.includes("So11111111111111111111111111111111111111112");
  const methodConfirmed = method.toUpperCase() === "GET";
  return {
    endpointPathConfirmed,
    methodConfirmed,
    requestShapeConfirmed: endpointPathConfirmed && methodConfirmed,
  };
}

export async function probePaySpongeCoinGeckoTokenLookupCandidate(): Promise<LookupProbeResult> {
  const endpointUrl = payspongeCoinGeckoTokenLookupCandidate.endpoint_url;
  const method = payspongeCoinGeckoTokenLookupCandidate.method;
  const pathShape = classifyPathAndShape(endpointUrl, method);

  if (paidExecutionEnabled()) {
    const paid = await executeLivePayShCall({
      providerId: payspongeCoinGeckoTokenLookupCandidate.provider_id,
      intent: payspongeCoinGeckoTokenLookupCandidate.benchmark_intent,
      endpointUrl,
      method,
    });

    const statusCode = paid.statusCode ?? null;
    const cliExitCode = paid.exitCode ?? null;
    const lookupLike = isTokenLookupLikeJson(paid.parsedJson) || lowerIncludesAny(paid.responsePreview, ["token", "wsol"]);
    const paymentRequiredChallengeAppears = Boolean(paid.paymentRequired || paid.paymentRequiredHeaderPresent);
    const success = paid.success && lookupLike;

    return {
      endpointUrl,
      method,
      mode: "paid_pay_cli",
      mappingStatusTarget: success ? "verified" : "candidate",
      executionEvidenceStatus: success ? "proven" : "unproven",
      success,
      statusCode,
      cliExitCode,
      paidExecutionAttempted: true,
      paymentRequiredChallengeAppears,
      endpointPathConfirmed: pathShape.endpointPathConfirmed,
      methodConfirmed: pathShape.methodConfirmed,
      requestShapeConfirmed: pathShape.requestShapeConfirmed,
      responseShapeClassified: lookupLike || paymentRequiredChallengeAppears || statusCode === 402,
      benchmarkIntentConfirmed: payspongeCoinGeckoTokenLookupCandidate.benchmark_intent === "token search",
      tokenLookupLikeShapeDetected: lookupLike,
      statusEvidence: classifyStatusEvidence({
        statusCode,
        cliExitCode,
        responsePreview: paid.responsePreview,
        errorReason: paid.errorReason,
      }),
      responseShapeSummary: lookupLike
        ? "Token-lookup-like response shape detected."
        : paymentRequiredChallengeAppears || statusCode === 402
          ? "Payment challenge detected; semantics remain unproven without successful paid payload."
          : "Response shape not confidently classified as token lookup.",
      safeSummary: success
        ? "Paid execution succeeded for token-lookup candidate semantics."
        : "Paid execution did not prove token-lookup semantics; candidate remains unproven.",
    };
  }

  let statusCode: number | null = null;
  let responseText = "";
  let paymentRequiredChallengeAppears = false;

  try {
    const response = await fetch(endpointUrl, {
      method,
      headers: { Accept: "application/json" },
    });
    statusCode = response.status;
    responseText = await response.text();
    const headerKeys = Array.from(response.headers.keys()).map((key) => key.toLowerCase());
    paymentRequiredChallengeAppears =
      statusCode === 402 ||
      headerKeys.some((key) => key.includes("x402") || key.includes("payment")) ||
      lowerIncludesAny(responseText, ["payment required", "x402"]);
  } catch (error) {
    responseText = error instanceof Error ? error.message : String(error);
  }

  const parsedJson = (() => {
    try {
      return JSON.parse(responseText) as unknown;
    } catch {
      return null;
    }
  })();
  const lookupLike = isTokenLookupLikeJson(parsedJson) || lowerIncludesAny(responseText, ["token", "wsol"]);

  return {
    endpointUrl,
    method,
    mode: "unpaid_safe_probe",
    mappingStatusTarget: "candidate",
    executionEvidenceStatus: "unproven",
    success: false,
    statusCode,
    cliExitCode: null,
    paidExecutionAttempted: false,
    paymentRequiredChallengeAppears,
    endpointPathConfirmed: pathShape.endpointPathConfirmed,
    methodConfirmed: pathShape.methodConfirmed,
    requestShapeConfirmed: pathShape.requestShapeConfirmed,
    responseShapeClassified: lookupLike || paymentRequiredChallengeAppears || statusCode === 402,
    benchmarkIntentConfirmed: payspongeCoinGeckoTokenLookupCandidate.benchmark_intent === "token search",
    tokenLookupLikeShapeDetected: lookupLike,
    statusEvidence: classifyStatusEvidence({
      statusCode,
      cliExitCode: null,
      responsePreview: responseText.slice(0, 1000),
    }),
    responseShapeSummary: paymentRequiredChallengeAppears
      ? "Unpaid payment challenge observed on token-lookup endpoint."
      : lookupLike
        ? "Unpaid response appears token-lookup-like (no paid proof)."
        : "Unpaid probe did not provide strong token-lookup semantics.",
    safeSummary: paymentRequiredChallengeAppears
      ? "Unpaid probe reached payment-required challenge on token-lookup candidate route."
      : "Unpaid probe completed without strong token-lookup semantics.",
  };
}

export function renderProofMarkdown(result: LookupProbeResult, now = new Date()): string {
  const lines = [
    "# PaySponge CoinGecko Token Search Candidate Or Paid Evidence",
    "",
    `- generated_at: ${now.toISOString()}`,
    `- provider_id: ${payspongeCoinGeckoTokenLookupCandidate.provider_id}`,
    `- endpoint: ${result.endpointUrl}`,
    `- method: ${result.method}`,
    `- request_shape: network=solana token_address=So11111111111111111111111111111111111111112`,
    `- status_code: ${result.statusCode === null ? "null" : String(result.statusCode)}`,
    `- status_evidence: ${result.statusEvidence}`,
    `- paid_execution_attempted: ${result.paidExecutionAttempted}`,
    `- success: ${result.success}`,
    `- mapping_status_target: ${result.mappingStatusTarget}`,
    `- execution_evidence_status: ${result.executionEvidenceStatus}`,
    `- response_shape_summary: ${result.responseShapeSummary}`,
    `- endpoint_path_confirmed: ${result.endpointPathConfirmed}`,
    `- method_confirmed: ${result.methodConfirmed}`,
    `- request_shape_confirmed: ${result.requestShapeConfirmed}`,
    `- response_shape_classified: ${result.responseShapeClassified}`,
    `- benchmark_intent_confirmed: ${result.benchmarkIntentConfirmed}`,
    `- payment_required_challenge_appears: ${result.paymentRequiredChallengeAppears}`,
    `- token_lookup_like_shape_detected: ${result.tokenLookupLikeShapeDetected}`,
    `- proof_reference: ${SAFE_PROOF_REFERENCE}`,
    "",
    `- notes: ${result.safeSummary}`,
    "No benchmark readiness claim.",
    "No winner claim.",
  ];

  return sanitizeProofMarkdown(lines.join("\n"));
}

function renderMappingFile(result: LookupProbeResult): string {
  return [
    "export const payspongeCoinGeckoTokenLookupCandidate = {",
    `  provider_id: \"${payspongeCoinGeckoTokenLookupCandidate.provider_id}\",`,
    `  provider_name: \"${payspongeCoinGeckoTokenLookupCandidate.provider_name}\",`,
    `  category: \"${payspongeCoinGeckoTokenLookupCandidate.category}\",`,
    `  benchmark_intent: \"${payspongeCoinGeckoTokenLookupCandidate.benchmark_intent}\",`,
    `  mapping_status: \"${result.mappingStatusTarget}\",`,
    `  execution_evidence_status: \"${result.executionEvidenceStatus}\",`,
    `  verified_at: \"2026-05-17\",`,
    `  proof_source: \"discovery/probe\",`,
    `  proof_reference: \"${SAFE_PROOF_REFERENCE}\",`,
    `  endpoint_url: \"${payspongeCoinGeckoTokenLookupCandidate.endpoint_url}\",`,
    `  method: \"${payspongeCoinGeckoTokenLookupCandidate.method}\",`,
    "  request_shape_example: {",
    "    network: \"solana\",",
    "    token_address: \"So11111111111111111111111111111111111111112\",",
    "  },",
    "  response_shape_expected:",
    '    "token lookup payload for a specific token address, or unpaid payment-required challenge",',
    `  notes: \"Candidate only. Comparable as token lookup semantics (search-adjacent), not benchmark-ready, no winner claim.\",`,
    "} as const;",
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const result = await probePaySpongeCoinGeckoTokenLookupCandidate();
  const markdown = renderProofMarkdown(result);

  const liveProofPath = path.resolve(process.cwd(), SAFE_PROOF_REFERENCE);
  await mkdir(path.dirname(liveProofPath), { recursive: true });
  await writeFile(liveProofPath, `${markdown}\n`, "utf8");

  const rawProofPath = path.resolve(process.cwd(), RAW_PROOF_REFERENCE);
  await mkdir(path.dirname(rawProofPath), { recursive: true });
  await writeFile(
    rawProofPath,
    `${JSON.stringify({
      generated_at: new Date().toISOString(),
      provider_id: payspongeCoinGeckoTokenLookupCandidate.provider_id,
      endpoint: result.endpointUrl,
      method: result.method,
      result,
    }, null, 2)}\n`,
    "utf8",
  );

  const mappingPath = path.resolve(process.cwd(), "src/mappings/payspongeCoinGeckoTokenLookupCandidate.ts");
  await writeFile(mappingPath, renderMappingFile(result), "utf8");

  console.log(
    JSON.stringify(
      {
        provider_id: payspongeCoinGeckoTokenLookupCandidate.provider_id,
        benchmark_intent: payspongeCoinGeckoTokenLookupCandidate.benchmark_intent,
        mapping_status: result.mappingStatusTarget,
        execution_evidence_status: result.executionEvidenceStatus,
        paid_execution_attempted: result.paidExecutionAttempted,
        success: result.success,
        status_code: result.statusCode,
        proof_reference: SAFE_PROOF_REFERENCE,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

export { sanitizeProofMarkdown };
