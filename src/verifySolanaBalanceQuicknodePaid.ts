import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveSolanaInfraEvidenceHealth,
  normalizeSolanaInfraAccountBalance,
  type NormalizeSolanaInfraAccountBalanceResult,
  type SolanaInfraAccountBalanceNormalizedOutput,
} from "./benchmarks/solanaInfraAccountBalanceNormalization";

const BENCHMARK_ID = "solana-infra-account-balance";
const PROVIDER = "QuickNode";
const PROVIDER_ID = "quicknode/solana-mainnet";
const ENDPOINT = "https://x402.quicknode.com/solana-mainnet/";
const METHOD = "POST";

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

type SafetyGateReason =
  | "ok"
  | "SOLANA_BALANCE_BENCHMARK_ADDRESS_missing"
  | "LIVE_PAYSH_EXECUTION_not_true"
  | "PAYSH_EXECUTION_MODE_not_pay_cli";

export interface SafetyGateResult {
  ok: boolean;
  reason: SafetyGateReason;
}

export interface SolanaBalanceQuicknodeVerificationResult {
  benchmark_id: string;
  provider: string;
  endpoint: string;
  method: string;
  canonical_input_hash: string;
  canonical_address_short: string;
  paid_execution_status: "succeeded" | "failed";
  cli_exit_code: number | null;
  status_evidence: string;
  normalized_output: SolanaInfraAccountBalanceNormalizedOutput;
  balance_lamports: number | null;
  balance_sol: number | null;
  address_match: boolean | null;
  network_match: boolean | null;
  caveat_objects: NormalizeSolanaInfraAccountBalanceResult["caveat_objects"];
  evidence_health: SolanaInfraAccountBalanceNormalizedOutput["evidence_health"];
  route_state: "verified/proven" | "candidate/unproven" | "rejected";
  conclusion: string;
  proof_path: string;
}

export function validateSafetyGate(env: NodeJS.ProcessEnv): SafetyGateResult {
  if (!env.SOLANA_BALANCE_BENCHMARK_ADDRESS?.trim()) {
    return { ok: false, reason: "SOLANA_BALANCE_BENCHMARK_ADDRESS_missing" };
  }
  if (env.LIVE_PAYSH_EXECUTION !== "true") {
    return { ok: false, reason: "LIVE_PAYSH_EXECUTION_not_true" };
  }
  if (env.PAYSH_EXECUTION_MODE !== "pay_cli") {
    return { ok: false, reason: "PAYSH_EXECUTION_MODE_not_pay_cli" };
  }
  return { ok: true, reason: "ok" };
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

export function shortenAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 12) {
    return `${trimmed.slice(0, 4)}...`;
  }
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-6)}`;
}

export function hashCanonicalInput(network: string, address: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ network, address }), "utf8")
    .digest("hex");
}

export function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export function deriveRouteState(input: {
  paidCallSuccess: boolean;
  normalized: NormalizeSolanaInfraAccountBalanceResult;
}): "verified/proven" | "candidate/unproven" | "rejected" {
  const caveats = input.normalized.caveat_objects;
  const hardReject = caveats.some((c) => c.code === "route_not_found" || c.code === "auth_required" || c.code === "network_mismatch");
  if (hardReject) {
    return "rejected";
  }
  if (input.paidCallSuccess && input.normalized.normalized.balance_detected) {
    return "verified/proven";
  }
  return "candidate/unproven";
}

type LiveExecutor = (input: ExecuteLivePayShCallInput) => ReturnType<typeof executeLivePayShCall>;

export async function runSolanaBalanceQuicknodePaid(
  executor: LiveExecutor = executeLivePayShCall,
  now = new Date(),
): Promise<SolanaBalanceQuicknodeVerificationResult> {
  const datePart = now.toISOString().slice(0, 10);
  const proofPath = `live-proofs/solana-infra-account-balance-quicknode-paid-${datePart}.md`;

  const gate = validateSafetyGate(process.env);
  const canonicalAddress = process.env.SOLANA_BALANCE_BENCHMARK_ADDRESS?.trim() ?? "";
  const canonicalAddressShort = canonicalAddress ? shortenAddress(canonicalAddress) : "missing";
  const canonicalHash = canonicalAddress
    ? hashCanonicalInput("solana", canonicalAddress)
    : "unavailable_missing_safety_gate";

  let normalized = normalizeSolanaInfraAccountBalance({
    parsedJson: {},
    statusCode: null,
    statusEvidence: "status_unavailable",
    paidExecutionObserved: false,
    canonicalInput: canonicalAddress ? { network: "solana", address: canonicalAddress } : undefined,
    routeContext: ENDPOINT,
  });

  let paidExecutionStatus: "succeeded" | "failed" = "failed";
  let cliExitCode: number | null = null;
  let evidence: string = gate.reason;
  let paidCallSuccess = false;

  if (gate.ok) {
    const paid = await executor({
      providerId: PROVIDER_ID,
      intent: BENCHMARK_ID,
      endpointUrl: ENDPOINT,
      method: METHOD,
      bodyJson: {
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [canonicalAddress],
      },
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
    });

    cliExitCode = paid.exitCode ?? null;
    evidence = statusEvidence(paid.statusCode ?? null, paid.exitCode ?? null, paid.errorReason);
    paidExecutionStatus = paid.success ? "succeeded" : "failed";
    paidCallSuccess = paid.success;

    normalized = normalizeSolanaInfraAccountBalance({
      parsedJson: paid.parsedJsonAvailable ? paid.parsedJson ?? {} : paid.responsePreview,
      responsePreview: paid.responsePreview,
      statusCode: paid.statusCode ?? null,
      statusEvidence: evidence,
      paidExecutionObserved: paid.success,
      canonicalInput: {
        network: "solana",
        address: canonicalAddress,
      },
      routeContext: ENDPOINT,
    });
  }

  const evidenceHealth = gate.ok
    ? deriveSolanaInfraEvidenceHealth({
        paidAttempts: 1,
        paidSuccesses: paidCallSuccess ? 1 : 0,
        paidFailures: paidCallSuccess ? 0 : 1,
        latest: normalized,
      })
    : "unverified";

  const mergedNormalized: SolanaInfraAccountBalanceNormalizedOutput = {
    ...normalized.normalized,
    evidence_health: evidenceHealth,
  };

  const normalizedWithHealth: NormalizeSolanaInfraAccountBalanceResult = {
    normalized: mergedNormalized,
    caveat_objects: normalized.caveat_objects,
  };

  const routeState = gate.ok
    ? deriveRouteState({ paidCallSuccess, normalized: normalizedWithHealth })
    : "candidate/unproven";

  const conclusion =
    routeState === "verified/proven"
      ? "Paid execution succeeded and native SOL balance was detected. Route 1 is verified/proven for this benchmark input."
      : routeState === "rejected"
        ? "Route rejected for benchmark semantics due to hard blocking caveats."
        : "Evidence remains candidate/unproven for benchmark semantics.";

  return {
    benchmark_id: BENCHMARK_ID,
    provider: PROVIDER,
    endpoint: ENDPOINT,
    method: METHOD,
    canonical_input_hash: canonicalHash,
    canonical_address_short: canonicalAddressShort,
    paid_execution_status: paidExecutionStatus,
    cli_exit_code: cliExitCode,
    status_evidence: evidence,
    normalized_output: mergedNormalized,
    balance_lamports: mergedNormalized.balance_lamports,
    balance_sol: mergedNormalized.balance_sol,
    address_match: mergedNormalized.address_match,
    network_match: mergedNormalized.network_match,
    caveat_objects: normalized.caveat_objects,
    evidence_health: evidenceHealth,
    route_state: routeState,
    conclusion,
    proof_path: proofPath,
  };
}

export function renderProofMarkdown(result: SolanaBalanceQuicknodeVerificationResult, now = new Date()): string {
  const lines = [
    "# Solana Infra Account Balance QuickNode Paid Verification",
    "",
    `- generated_at: ${now.toISOString()}`,
    `- benchmark_id: ${result.benchmark_id}`,
    `- provider: ${result.provider}`,
    `- endpoint: ${result.endpoint}`,
    `- method: ${result.method}`,
    `- canonical_input_hash: ${result.canonical_input_hash}`,
    `- canonical_address_short: ${result.canonical_address_short}`,
    `- paid_execution_status: ${result.paid_execution_status}`,
    `- cli_exit_code: ${result.cli_exit_code === null ? "null" : String(result.cli_exit_code)}`,
    `- status_evidence: ${result.status_evidence}`,
    `- normalized_output: ${JSON.stringify(result.normalized_output)}`,
    `- balance_lamports: ${result.balance_lamports === null ? "null" : String(result.balance_lamports)}`,
    `- balance_sol: ${result.balance_sol === null ? "null" : String(result.balance_sol)}`,
    `- address_match: ${result.address_match === null ? "null" : String(result.address_match)}`,
    `- network_match: ${result.network_match === null ? "null" : String(result.network_match)}`,
    `- caveat_objects: ${JSON.stringify(result.caveat_objects)}`,
    `- evidence_health: ${result.evidence_health}`,
    `- route_state: ${result.route_state}`,
    `- conclusion: ${result.conclusion}`,
    "No benchmark recorded claim.",
    "No winner claim.",
  ];

  return sanitizeProofMarkdown(lines.join("\n"));
}

export async function verifySolanaBalanceQuicknodePaid(now = new Date()): Promise<SolanaBalanceQuicknodeVerificationResult> {
  const result = await runSolanaBalanceQuicknodePaid(executeLivePayShCall, now);

  const out = path.resolve(process.cwd(), result.proof_path);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${renderProofMarkdown(result, now)}\n`, "utf8");

  return result;
}

if (require.main === module) {
  verifySolanaBalanceQuicknodePaid()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            benchmark_id: result.benchmark_id,
            provider: result.provider,
            endpoint: result.endpoint,
            paid_execution_status: result.paid_execution_status,
            evidence_health: result.evidence_health,
            route_state: result.route_state,
            proof_path: result.proof_path,
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
