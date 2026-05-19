import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { executeLivePayShCall } from "./livePayShExecutor";
import {
  deriveCommunicationsEvidenceHealth,
  normalizeCommunicationsEmailDelivery,
  type CanonicalEmailInput,
} from "./benchmarks/communicationsEmailDeliveryNormalization";

type StableEmailRoute = {
  endpoint: "https://stableemail.dev/api/send" | "https://stableemail.dev/api/inbox/send";
  method: "POST";
  buildBody: (input: CanonicalEmailInput) => Record<string, unknown> | null;
};

const PROVIDER_ID = "merit-systems/stableemail/email";
const BENCHMARK_INTENT = "communications-email-delivery";
const TODAY = new Date().toISOString().slice(0, 10);
const PROOF_PATH = `live-proofs/communications-email-delivery-stableemail-paid-${TODAY}.md`;
const CONTROLLED_INBOX_FLAG = "BENCHMARK_EMAIL_TO_CONTROLLED";

const ROUTES: StableEmailRoute[] = [
  {
    endpoint: "https://stableemail.dev/api/send",
    method: "POST",
    buildBody: (input) => ({ to: [input.to], subject: input.subject, text: input.body }),
  },
  {
    endpoint: "https://stableemail.dev/api/inbox/send",
    method: "POST",
    buildBody: (input) => {
      const username = process.env.BENCHMARK_STABLEEMAIL_USERNAME?.trim();
      if (!username) {
        return null;
      }
      return { username, to: [input.to], subject: input.subject, text: input.body };
    },
  },
];

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

function paidExecutionEnabled(): boolean {
  return process.env.LIVE_PAYSH_EXECUTION === "true" && process.env.PAYSH_EXECUTION_MODE === "pay_cli";
}

function ensureSafetyGate(): CanonicalEmailInput {
  const to = process.env.BENCHMARK_EMAIL_TO?.trim();
  if (!to) {
    throw new Error("Safety gate failed: BENCHMARK_EMAIL_TO is not configured.");
  }

  if (process.env[CONTROLLED_INBOX_FLAG] !== "true") {
    throw new Error(
      `Safety gate failed: ${CONTROLLED_INBOX_FLAG}=true is required to confirm controlled test inbox ownership.`,
    );
  }

  return {
    to,
    subject: "Infopunks Radar benchmark",
    body: "Radar benchmark delivery test.",
  };
}

function maskEmail(email: string): string {
  const [local, domain = "redacted.invalid"] = email.split("@");
  const visible = local.slice(0, 2);
  return `${visible || "xx"}***@${domain}`;
}

function hashCanonicalInput(input: CanonicalEmailInput): string {
  const canonical = JSON.stringify({ to: input.to, subject: input.subject, body: input.body });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
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
  const scrubbed = SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
  return scrubbed.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
}

async function main(): Promise<void> {
  const canonicalInput = ensureSafetyGate();
  const canonicalInputHash = hashCanonicalInput(canonicalInput);

  if (!paidExecutionEnabled()) {
    throw new Error("Paid verification requires LIVE_PAYSH_EXECUTION=true and PAYSH_EXECUTION_MODE=pay_cli.");
  }

  let selectedRoute = ROUTES[0];
  let selectedBody = selectedRoute.buildBody(canonicalInput);
  let skippedFallback = false;

  let paid = await executeLivePayShCall({
    providerId: PROVIDER_ID,
    intent: BENCHMARK_INTENT,
    endpointUrl: selectedRoute.endpoint,
    method: selectedRoute.method,
    bodyJson: selectedBody ?? undefined,
    headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
  });

  const firstStatus = paid.statusCode ?? null;
  const firstExit = paid.exitCode ?? null;
  const firstStatusEvidence = statusEvidence(firstStatus, firstExit, paid.errorReason);
  const likelyWrongSemantics = firstStatus === 404 || firstStatus === 405 || firstStatus === 422;

  if (!paid.success && likelyWrongSemantics) {
    const fallback = ROUTES[1];
    const fallbackBody = fallback.buildBody(canonicalInput);
    if (fallbackBody) {
      selectedRoute = fallback;
      selectedBody = fallbackBody;
      paid = await executeLivePayShCall({
        providerId: PROVIDER_ID,
        intent: BENCHMARK_INTENT,
        endpointUrl: selectedRoute.endpoint,
        method: selectedRoute.method,
        bodyJson: selectedBody,
        headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
      });
    } else {
      skippedFallback = true;
    }
  }

  const parsed = paid.parsedJsonAvailable ? paid.parsedJson ?? {} : paid.responsePreview;
  const normalizedResult = normalizeCommunicationsEmailDelivery({
    parsedJson: parsed,
    responsePreview: paid.responsePreview,
    statusCode: paid.statusCode ?? null,
    statusEvidence: statusEvidence(paid.statusCode ?? null, paid.exitCode ?? null, paid.errorReason),
    paidExecutionObserved: true,
    canonicalInput,
  });

  const sendDetected =
    normalizedResult.normalized.delivery_status === "accepted" ||
    normalizedResult.normalized.delivery_status === "queued" ||
    normalizedResult.normalized.delivery_status === "sent";

  const paidExecutionSucceeded = Boolean(paid.success && normalizedResult.normalized.accepted === true && sendDetected);
  const caveatCodes = normalizedResult.caveat_objects.map((c) => c.code);
  const routeState = paidExecutionSucceeded ? "verified/proven" : "candidate/unproven";
  const derivedEvidenceHealth = deriveCommunicationsEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: paidExecutionSucceeded ? 1 : 0,
    paidFailures: paidExecutionSucceeded ? 0 : 1,
    successfulNormalizedStatuses: paidExecutionSucceeded ? [normalizedResult.normalized.delivery_status] : [],
    latest: normalizedResult,
  });
  const evidenceHealth = paidExecutionSucceeded ? "caveated" : derivedEvidenceHealth;
  const conclusion = paidExecutionSucceeded
    ? "paid execution succeeded and accepted send semantics were detected, but canonical recipient/subject and inbox delivery were not independently confirmed."
    : "paid execution was not proven for this run; route remains candidate/unproven.";

  const proof = [
    "# Communications Email Delivery StableEmail Paid Verification",
    "",
    `- generated_at: ${new Date().toISOString()}`,
    `- benchmark: ${BENCHMARK_INTENT}`,
    `- provider: ${PROVIDER_ID}`,
    `- endpoint: ${selectedRoute.endpoint}`,
    `- method: ${selectedRoute.method}`,
    `- canonical_input_hash_sha256: ${canonicalInputHash}`,
    `- canonical_input_to_masked: ${maskEmail(canonicalInput.to)}`,
    `- paid_execution_status: ${paidExecutionSucceeded ? "succeeded" : "failed"}`,
    `- cli_exit_code: ${paid.exitCode ?? "null"}`,
    `- status_evidence: ${statusEvidence(paid.statusCode ?? null, paid.exitCode ?? null, paid.errorReason)}`,
    `- normalized_output: ${JSON.stringify(normalizedResult.normalized)}`,
    `- accepted_queued_sent_detection: ${sendDetected}`,
    `- provider_message_id: ${normalizedResult.normalized.provider_message_id ?? "null"}`,
    `- caveat_objects: ${JSON.stringify(normalizedResult.caveat_objects)}`,
    `- caveat_codes: ${JSON.stringify(caveatCodes)}`,
    `- route_state: ${routeState}`,
    `- evidence_health: ${evidenceHealth}`,
    `- first_route_status_evidence: ${firstStatusEvidence}`,
    `- fallback_skipped_due_to_missing_username: ${skippedFallback}`,
    `- conclusion: ${conclusion}`,
    "",
    "Notes:",
    "- Route promotion to verified/proven is allowed only when paid execution succeeds with clear send semantics.",
    "- This artifact does not mark the full communications lane recorded and does not run a 5-run benchmark.",
  ].join("\n");

  const liveProofPath = path.resolve(process.cwd(), PROOF_PATH);
  await mkdir(path.dirname(liveProofPath), { recursive: true });
  await writeFile(liveProofPath, `${sanitizeProofMarkdown(proof)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        provider: PROVIDER_ID,
        endpoint: selectedRoute.endpoint,
        method: selectedRoute.method,
        proof_path: PROOF_PATH,
        paid_execution_status: paidExecutionSucceeded ? "succeeded" : "failed",
        conclusion,
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
