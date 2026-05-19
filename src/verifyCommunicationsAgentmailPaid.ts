import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveCommunicationsEvidenceHealth,
  normalizeCommunicationsEmailDelivery,
  type CanonicalEmailInput,
  type NormalizeCommunicationsEmailDeliveryResult,
} from "./benchmarks/communicationsEmailDeliveryNormalization";

const PROVIDER_ID = "agentmail/email";
const METHOD = "POST";
const BENCHMARK_ID = "communications-email-delivery";
const TODAY = new Date().toISOString().slice(0, 10);
const PROOF_PATH = `live-proofs/communications-email-delivery-agentmail-paid-${TODAY}.md`;
const DETAIL_DIR = path.join(process.env.HOME ?? "", ".config/pay/skills/detail");
const DEFAULT_ROUTE = "https://x402.api.agentmail.to/v0/inboxes/{inbox_id}/messages/send";

const PREVIOUS_PROBE_NOTE = "dummy inbox returned 403 ownership_guard";
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
  | "AGENTMAIL_INBOX_ID_missing"
  | "BENCHMARK_EMAIL_TO_missing"
  | "BENCHMARK_EMAIL_TO_CONTROLLED_not_true"
  | "pay_cli_not_enabled";

export interface SafetyGateResult {
  ok: boolean;
  reason: SafetyGateReason;
}

interface CatalogDetailProvider {
  fqn?: string;
  service_url?: string;
  endpoints?: Array<{ method?: string; path?: string; url?: string }>;
}

function paidExecutionEnabled(): boolean {
  return process.env.LIVE_PAYSH_EXECUTION === "true" && process.env.PAYSH_EXECUTION_MODE === "pay_cli";
}

export function validateSafetyGate(env: NodeJS.ProcessEnv): SafetyGateResult {
  if (!env.AGENTMAIL_INBOX_ID?.trim()) {
    return { ok: false, reason: "AGENTMAIL_INBOX_ID_missing" };
  }
  if (!env.BENCHMARK_EMAIL_TO?.trim()) {
    return { ok: false, reason: "BENCHMARK_EMAIL_TO_missing" };
  }
  if (env.BENCHMARK_EMAIL_TO_CONTROLLED !== "true") {
    return { ok: false, reason: "BENCHMARK_EMAIL_TO_CONTROLLED_not_true" };
  }
  if (!(env.LIVE_PAYSH_EXECUTION === "true" && env.PAYSH_EXECUTION_MODE === "pay_cli")) {
    return { ok: false, reason: "pay_cli_not_enabled" };
  }
  return { ok: true, reason: "ok" };
}

export function maskEmail(email: string): string {
  const [local, domain = "redacted.invalid"] = email.split("@");
  const prefix = local.slice(0, 2);
  return `${prefix || "xx"}***@${domain}`;
}

export function maskInboxId(inboxId: string): string {
  if (inboxId.length <= 6) {
    return `${inboxId.slice(0, 1)}***`;
  }
  return `${inboxId.slice(0, 3)}***${inboxId.slice(-2)}`;
}

export function redactEndpoint(endpoint: string): string {
  return endpoint.replace(/\/inboxes\/([^/]+)\//, (_m, id: string) => `/inboxes/${maskInboxId(id)}/`);
}

export function hashCanonicalInput(input: CanonicalEmailInput): string {
  return createHash("sha256")
    .update(JSON.stringify({ to: input.to, subject: input.subject, body: input.body }), "utf8")
    .digest("hex");
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
  const scrubbed = SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
  return scrubbed.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
}

export async function discoverAgentmailSendRoute(): Promise<string> {
  try {
    const files = (await readdir(DETAIL_DIR)).filter((name) => name.endsWith(".json"));
    for (const file of files) {
      const raw = await readFile(path.join(DETAIL_DIR, file), "utf8");
      const provider = JSON.parse(raw) as CatalogDetailProvider;
      if (provider.fqn !== PROVIDER_ID) {
        continue;
      }
      const match = (provider.endpoints ?? []).find(
        (endpoint) =>
          endpoint.method?.toUpperCase() === "POST" &&
          (endpoint.path === "v0/inboxes/{inbox_id}/messages/send" ||
            endpoint.url?.includes("/v0/inboxes/{inbox_id}/messages/send")),
      );
      if (!match) {
        continue;
      }
      if (match.url) {
        return match.url;
      }
      if (provider.service_url && match.path) {
        return `${provider.service_url.replace(/\/$/, "")}/${match.path.replace(/^\//, "")}`;
      }
    }
  } catch {
    return DEFAULT_ROUTE;
  }
  return DEFAULT_ROUTE;
}

function buildCanonicalInput(env: NodeJS.ProcessEnv): CanonicalEmailInput {
  return {
    to: env.BENCHMARK_EMAIL_TO!.trim(),
    subject: "Infopunks Radar benchmark",
    body: "Radar benchmark delivery test.",
  };
}

function buildSendEndpoint(routeTemplate: string, inboxId: string): string {
  if (routeTemplate.includes("{inbox_id}")) {
    return routeTemplate.replace("{inbox_id}", inboxId);
  }
  return routeTemplate;
}

export function deriveConclusion(input: {
  paidCallSuccess: boolean;
  normalized: NormalizeCommunicationsEmailDeliveryResult;
}): "verified/proven" | "caveated" | "candidate/unproven" | "rejected" {
  const delivery = input.normalized.normalized.delivery_status;
  const accepted = input.normalized.normalized.accepted;
  const sendDetected = delivery === "accepted" || delivery === "queued" || delivery === "sent";
  if (!input.paidCallSuccess || accepted !== true || !sendDetected) {
    return "candidate/unproven";
  }
  const partial = input.normalized.caveat_objects.some((c) =>
    c.code === "provider_message_id_missing" ||
    c.code === "recipient_unconfirmed" ||
    c.code === "subject_unconfirmed" ||
    c.code === "email_delivery_semantics_partial" ||
    c.code === "inbox_delivery_unverified",
  );
  return partial ? "caveated" : "verified/proven";
}

async function main(): Promise<void> {
  const gate = validateSafetyGate(process.env);
  const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim() ?? "";
  const routeTemplate = await discoverAgentmailSendRoute();
  const endpointUsed = inboxId ? buildSendEndpoint(routeTemplate, inboxId) : routeTemplate;
  const endpointRedacted = inboxId ? redactEndpoint(endpointUsed) : routeTemplate.replace("{inbox_id}", "[MISSING]");
  const configuredInboxUsed = Boolean(inboxId);

  let normalized = normalizeCommunicationsEmailDelivery({
    parsedJson: {},
    statusCode: null,
    statusEvidence: "status_unavailable",
    paidExecutionObserved: false,
  });
  let cliExitCode: number | null = null;
  let paidStatus = "failed";
  let status = "status_unavailable";
  let paidCallSuccess = false;

  if (gate.ok) {
    const canonical = buildCanonicalInput(process.env);
    const body = { to: [canonical.to], subject: canonical.subject, text: canonical.body };
    const paid = await executeLivePayShCall({
      providerId: PROVIDER_ID,
      intent: BENCHMARK_ID,
      endpointUrl: endpointUsed,
      method: METHOD,
      bodyJson: body,
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
    });
    cliExitCode = paid.exitCode ?? null;
    status = statusEvidence(paid.statusCode ?? null, paid.exitCode ?? null, paid.errorReason);
    paidCallSuccess = paid.success;
    paidStatus = paid.success ? "succeeded" : "failed";
    normalized = normalizeCommunicationsEmailDelivery({
      parsedJson: paid.parsedJsonAvailable ? paid.parsedJson ?? {} : paid.responsePreview,
      responsePreview: paid.responsePreview,
      statusCode: paid.statusCode ?? null,
      statusEvidence: status,
      paidExecutionObserved: true,
      canonicalInput: canonical,
    });
  } else {
    paidStatus = "failed";
    status = gate.reason;
  }

  const derivedConclusion = gate.ok ? deriveConclusion({ paidCallSuccess, normalized }) : "candidate/unproven";
  const routeState = derivedConclusion === "verified/proven" || derivedConclusion === "caveated"
    ? "verified/proven"
    : "candidate/unproven";
  const conclusion = routeState === "verified/proven"
    ? derivedConclusion
    : "candidate/unproven";
  const evidenceHealth = gate.ok
    ? deriveCommunicationsEvidenceHealth({
        paidAttempts: 1,
        paidSuccesses: paidCallSuccess ? 1 : 0,
        paidFailures: paidCallSuccess ? 0 : 1,
        successfulNormalizedStatuses: paidCallSuccess ? [normalized.normalized.delivery_status] : [],
        latest: normalized,
      })
    : "unverified";
  const canonicalHash = gate.ok ? hashCanonicalInput(buildCanonicalInput(process.env)) : "unavailable_missing_safety_gate";

  const proof = [
    "# Communications Email Delivery AgentMail Paid Verification",
    "",
    `- benchmark_id: ${BENCHMARK_ID}`,
    "- provider: AgentMail",
    `- prior_probe_note: ${PREVIOUS_PROBE_NOTE}`,
    `- configured_inbox_used: ${configuredInboxUsed}`,
    `- configured_inbox_route_redacted: ${endpointRedacted}`,
    `- endpoint: ${endpointRedacted}`,
    `- method: ${METHOD}`,
    `- canonical_input_hash: ${canonicalHash}`,
    `- paid_execution_status: ${paidStatus}`,
    `- cli_exit_code: ${cliExitCode ?? "null"}`,
    `- status_evidence: ${status}`,
    `- normalized_output: ${JSON.stringify(normalized.normalized)}`,
    `- caveat_objects: ${JSON.stringify(normalized.caveat_objects)}`,
    `- route_state: ${routeState}`,
    `- evidence_health: ${evidenceHealth}`,
    `- conclusion: ${conclusion}`,
  ].join("\n");

  const out = path.resolve(process.cwd(), PROOF_PATH);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${sanitizeProofMarkdown(proof)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        benchmark_id: BENCHMARK_ID,
        provider: "AgentMail",
        endpoint: endpointRedacted,
        paid_execution_status: paidStatus,
        conclusion,
        proof_path: PROOF_PATH,
      },
      null,
      2,
    ),
  );
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
