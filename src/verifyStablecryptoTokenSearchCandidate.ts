import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall, ExecuteLivePayShCallInput } from "./livePayShExecutor";
import { stablecryptoTokenSearchCandidate } from "./mappings/stablecryptoTokenSearchCandidate";

const PAID_PROOF_REFERENCE = "live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md";
const VERIFIED_AT = "2026-05-17";
const PROVEN_AT = "2026-05-17";

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

type ResponseShapeClassified =
  | "token_search_like_json"
  | "payment_challenge"
  | "non_json_text"
  | "empty"
  | "unknown";

export interface StablecryptoPaidExecutionResult {
  provider_id: string;
  endpoint: string;
  method: "POST";
  request_shape: { query: "SOL" };
  paid_execution_attempted: boolean;
  success: boolean;
  execution_transport: "pay_cli";
  cli_exit_code: number | null;
  status_code: number | null;
  status_evidence: string;
  latency_ms: number | null;
  response_shape_classified: ResponseShapeClassified;
  token_search_result_detected: boolean;
  proof_reference: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lowerIncludesAny(value: string, needles: string[]): boolean {
  const lowered = value.toLowerCase();
  return needles.some((needle) => lowered.includes(needle));
}

function isTokenSearchLikeJson(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(isTokenSearchLikeJson);
  }

  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value).map((key) => key.toLowerCase());
  const hasSearchContainer = keys.some((key) =>
    ["data", "pools", "tokens", "included", "attributes", "relationships", "results"].includes(key),
  );
  const hasTokenOrPoolField = keys.some((key) =>
    ["pool", "pools", "token", "tokens", "base_token", "quote_token", "symbol", "name"].includes(key),
  );
  const text = JSON.stringify(value).slice(0, 20000);
  const mentionsSolLikePair = lowerIncludesAny(text, ["sol", "wrapped sol", "wsol", "usdc"]);

  if ((hasSearchContainer || hasTokenOrPoolField) && mentionsSolLikePair) {
    return true;
  }

  return Object.values(value).some(isTokenSearchLikeJson);
}

function detectTokenSearchResult(input: { parsedJson: unknown; responsePreview: string }): boolean {
  if (isTokenSearchLikeJson(input.parsedJson)) {
    return true;
  }

  return lowerIncludesAny(input.responsePreview, [
    "token",
    "tokens",
    "symbol",
    "coingecko",
    "pool",
    "pools",
    "sol",
  ]);
}

function classifyResponseShape(bodyText: string, statusCode: number | null): ResponseShapeClassified {
  if (!bodyText.trim()) {
    return "empty";
  }

  if (statusCode === 402) {
    return "payment_challenge";
  }

  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (isTokenSearchLikeJson(parsed)) {
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

export function paidExecutionEnabled(): boolean {
  return process.env.LIVE_PAYSH_EXECUTION === "true" && process.env.PAYSH_EXECUTION_MODE === "pay_cli";
}

type LiveExecutor = (input: ExecuteLivePayShCallInput) => ReturnType<typeof executeLivePayShCall>;

export async function runStablecryptoPaidExecution(
  executor: LiveExecutor = executeLivePayShCall,
): Promise<StablecryptoPaidExecutionResult> {
  const endpoint = stablecryptoTokenSearchCandidate.endpoint_url;

  if (!paidExecutionEnabled()) {
    return {
      provider_id: stablecryptoTokenSearchCandidate.provider_id,
      endpoint,
      method: "POST",
      request_shape: { query: "SOL" },
      paid_execution_attempted: false,
      success: false,
      execution_transport: "pay_cli",
      cli_exit_code: null,
      status_code: null,
      status_evidence: "pay_cli_execution_disabled",
      latency_ms: null,
      response_shape_classified: "unknown",
      token_search_result_detected: false,
      proof_reference: PAID_PROOF_REFERENCE,
    };
  }

  const paid = await executor({
    providerId: stablecryptoTokenSearchCandidate.provider_id,
    intent: stablecryptoTokenSearchCandidate.benchmark_intent,
    endpointUrl: endpoint,
    method: "POST",
    bodyJson: { query: "SOL" },
    headers: {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    },
  });

  const statusCode = paid.statusCode ?? null;
  const cliExitCode = paid.exitCode ?? null;
  const responseShape = classifyResponseShape(paid.responsePreview, statusCode);
  const tokenSearchLike = detectTokenSearchResult({
    parsedJson: paid.parsedJson,
    responsePreview: paid.responsePreview,
  });

  return {
    provider_id: stablecryptoTokenSearchCandidate.provider_id,
    endpoint,
    method: "POST",
    request_shape: { query: "SOL" },
    paid_execution_attempted: true,
    success: Boolean(paid.success && tokenSearchLike),
    execution_transport: "pay_cli",
    cli_exit_code: cliExitCode,
    status_code: statusCode,
    status_evidence: classifyStatusEvidence({
      statusCode,
      cliExitCode,
      errorReason: paid.errorReason,
      responsePreview: paid.responsePreview,
      stderrPreview: paid.stderrPreview,
    }),
    latency_ms: paid.latencyMs ?? null,
    response_shape_classified: responseShape,
    token_search_result_detected: tokenSearchLike,
    proof_reference: PAID_PROOF_REFERENCE,
  };
}

export function renderProofMarkdown(result: StablecryptoPaidExecutionResult, now = new Date()): string {
  const responseShapeSummary =
    result.response_shape_classified === "token_search_like_json"
      ? "Token-search-like JSON detected."
      : result.response_shape_classified === "payment_challenge"
        ? "Payment challenge observed."
        : result.response_shape_classified === "non_json_text"
          ? "Non-JSON response observed."
          : result.response_shape_classified === "empty"
            ? "Empty response observed."
            : "Response shape not confidently classified.";

  const semanticSummary = result.token_search_result_detected
    ? "Token-search semantics detected from paid response payload or preview."
    : "Token-search semantics not confirmed from paid response.";

  const lines = [
    "# StableCrypto Token Search Paid Execution Evidence",
    "",
    `- generated_at: ${now.toISOString()}`,
    `- provider_id: ${result.provider_id}`,
    `- endpoint: ${result.endpoint}`,
    `- method: ${result.method}`,
    `- request_shape: ${JSON.stringify(result.request_shape)}`,
    `- paid_execution_attempted: ${result.paid_execution_attempted}`,
    `- success: ${result.success}`,
    `- execution_transport: ${result.execution_transport}`,
    `- cli_exit_code: ${result.cli_exit_code === null ? "null" : String(result.cli_exit_code)}`,
    `- status_code: ${result.status_code === null ? "null" : String(result.status_code)}`,
    `- status_evidence: ${result.status_evidence}`,
    `- latency_ms: ${result.latency_ms === null ? "null" : String(result.latency_ms)}`,
    `- response_shape_classified: ${result.response_shape_classified}`,
    `- token_search_result_detected: ${result.token_search_result_detected}`,
    `- proof_reference: ${result.proof_reference}`,
    `- response shape summary: ${responseShapeSummary}`,
    `- token-search semantic summary: ${semanticSummary}`,
    "No benchmark-ready claim.",
    "No winner claim.",
  ];

  return sanitizeProofMarkdown(lines.join("\n"));
}

export function renderStablecryptoMappingFile(result: StablecryptoPaidExecutionResult): string {
  const provenLine = result.success ? `  proven_at: "${PROVEN_AT}",` : "";
  const notes = result.success
    ? "Paid execution succeeded for StableCrypto token-search route. This proves route execution, not benchmark readiness or superiority."
    : "Endpoint path, method, request shape, token-search intent, and unpaid route challenge/behavior verified. Paid execution did not produce proven evidence. Not benchmark-ready.";

  return [
    "export const stablecryptoTokenSearchCandidate = {",
    `  provider_id: "${stablecryptoTokenSearchCandidate.provider_id}",`,
    `  provider_name: "${stablecryptoTokenSearchCandidate.provider_name}",`,
    `  category: "${stablecryptoTokenSearchCandidate.category}",`,
    `  benchmark_intent: "${stablecryptoTokenSearchCandidate.benchmark_intent}",`,
    '  mapping_status: "verified",',
    `  execution_evidence_status: "${result.success ? "proven" : "unproven"}",`,
    `  verified_at: "${VERIFIED_AT}",`,
    ...(provenLine ? [provenLine] : []),
    `  proof_source: "${stablecryptoTokenSearchCandidate.proof_source}",`,
    `  proof_reference: "${PAID_PROOF_REFERENCE}",`,
    `  endpoint_url: "${stablecryptoTokenSearchCandidate.endpoint_url}",`,
    `  method: "${stablecryptoTokenSearchCandidate.method}",`,
    "  request_shape_example: { query: \"SOL\" },",
    `  notes: "${notes}",`,
    "} as const;",
    "",
  ].join("\n");
}

export async function verifyStablecryptoTokenSearchCandidate(now = new Date()): Promise<StablecryptoPaidExecutionResult> {
  const result = await runStablecryptoPaidExecution();

  const proofPath = path.resolve(process.cwd(), PAID_PROOF_REFERENCE);
  await mkdir(path.dirname(proofPath), { recursive: true });
  await writeFile(proofPath, `${renderProofMarkdown(result, now)}\n`, "utf8");

  const mappingPath = path.resolve(process.cwd(), "src/mappings/stablecryptoTokenSearchCandidate.ts");
  await writeFile(mappingPath, renderStablecryptoMappingFile(result), "utf8");

  return result;
}

if (require.main === module) {
  verifyStablecryptoTokenSearchCandidate()
    .then((result) => {
      console.log(`StableCrypto token-search paid verification complete: ${result.proof_reference}`);
      console.log(`paid_execution_attempted=${result.paid_execution_attempted} success=${result.success}`);
      console.log(`status_code=${result.status_code === null ? "null" : result.status_code} status_evidence=${result.status_evidence}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
