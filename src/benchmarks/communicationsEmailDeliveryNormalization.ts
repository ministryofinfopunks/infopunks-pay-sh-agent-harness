export type EmailDeliveryStatus = "accepted" | "queued" | "sent" | "unknown" | null;

export interface CommunicationsEmailDeliveryNormalizedOutput {
  accepted: boolean | null;
  provider_message_id: string | null;
  delivery_status: EmailDeliveryStatus;
  recipient_match: boolean | null;
  subject_match: boolean | null;
  body_match: boolean | null;
  status_evidence: string;
  raw_status_code: number | null;
}

export type CommunicationsCaveatCode =
  | "email_delivery_semantics_partial"
  | "inbox_delivery_unverified"
  | "ownership_guard"
  | "auth_required"
  | "payment_required_confirmed_only"
  | "paid_payload_unobserved"
  | "provider_message_id_missing"
  | "recipient_unconfirmed"
  | "subject_unconfirmed"
  | "non_json_text_response"
  | "status_code_unavailable"
  | "route_not_found";

export type CaveatSeverity = "info" | "warning" | "error";

export interface CaveatObject {
  code: CommunicationsCaveatCode;
  severity: CaveatSeverity;
  affects_core_semantics: boolean;
  detail: string;
}

export interface CanonicalEmailInput {
  to: string;
  subject: string;
  body: string;
}

export interface NormalizeCommunicationsEmailDeliveryInput {
  parsedJson: unknown;
  responsePreview?: string;
  statusCode?: number | null;
  statusEvidence?: string;
  paidExecutionObserved?: boolean;
  canonicalInput?: CanonicalEmailInput;
}

export interface NormalizeCommunicationsEmailDeliveryResult {
  normalized: CommunicationsEmailDeliveryNormalizedOutput;
  caveat_objects: CaveatObject[];
}

export type EvidenceHealth = "recorded" | "caveated" | "degraded" | "unverified" | "scaffold";

export interface EvidenceHealthInput {
  researchOnly?: boolean;
  paidAttempts?: number;
  paidSuccesses?: number;
  paidFailures?: number;
  successfulNormalizedStatuses?: Array<"accepted" | "queued" | "sent" | "unknown" | null>;
  latest?: NormalizeCommunicationsEmailDeliveryResult;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deepFindFirstString(obj: unknown, keys: string[]): string | null {
  if (!isObject(obj)) {
    return null;
  }

  const lowered = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [obj];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current)) {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (lowered.has(key.toLowerCase())) {
        const found = asNonEmptyString(value);
        if (found) {
          return found;
        }
      }

      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return null;
}

function deepFindFirstBoolean(obj: unknown, keys: string[]): boolean | null {
  if (!isObject(obj)) {
    return null;
  }

  const lowered = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [obj];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current)) {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (lowered.has(key.toLowerCase()) && typeof value === "boolean") {
        return value;
      }

      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return null;
}

function addCaveat(list: CaveatObject[], code: CommunicationsCaveatCode, detail: string): void {
  if (list.some((entry) => entry.code === code)) {
    return;
  }

  const severityByCode: Record<CommunicationsCaveatCode, CaveatSeverity> = {
    email_delivery_semantics_partial: "warning",
    inbox_delivery_unverified: "warning",
    ownership_guard: "error",
    auth_required: "error",
    payment_required_confirmed_only: "info",
    paid_payload_unobserved: "warning",
    provider_message_id_missing: "warning",
    recipient_unconfirmed: "warning",
    subject_unconfirmed: "warning",
    non_json_text_response: "warning",
    status_code_unavailable: "warning",
    route_not_found: "error",
  };

  const affectsCoreSemanticsByCode: Record<CommunicationsCaveatCode, boolean> = {
    email_delivery_semantics_partial: true,
    inbox_delivery_unverified: false,
    ownership_guard: true,
    auth_required: true,
    payment_required_confirmed_only: false,
    paid_payload_unobserved: true,
    provider_message_id_missing: false,
    recipient_unconfirmed: true,
    subject_unconfirmed: true,
    non_json_text_response: true,
    status_code_unavailable: false,
    route_not_found: true,
  };

  list.push({
    code,
    severity: severityByCode[code],
    affects_core_semantics: affectsCoreSemanticsByCode[code],
    detail,
  });
}

function normalizeDeliveryStatus(parsedJson: unknown, accepted: boolean | null): EmailDeliveryStatus {
  const explicitStatus = deepFindFirstString(parsedJson, ["delivery_status", "status", "state"]);
  if (explicitStatus) {
    const lower = explicitStatus.toLowerCase();
    if (lower.includes("accept")) {
      return "accepted";
    }
    if (lower.includes("queue")) {
      return "queued";
    }
    if (lower.includes("sent") || lower.includes("delivered")) {
      return "sent";
    }
    return "unknown";
  }

  if (accepted === true) {
    return "accepted";
  }

  return null;
}

function findMessageId(parsedJson: unknown): string | null {
  return deepFindFirstString(parsedJson, ["provider_message_id", "message_id", "id"]);
}

function findEcho(parsedJson: unknown): { recipient: string | null; subject: string | null; body: string | null } {
  const recipient =
    deepFindFirstString(parsedJson, ["to", "recipient", "email", "recipient_email"]) ??
    deepFindFirstString(parsedJson, ["to_email", "toAddress", "recipientAddress"]);
  const subject = deepFindFirstString(parsedJson, ["subject"]);
  const body = deepFindFirstString(parsedJson, ["body", "text", "message"]);
  return { recipient, subject, body };
}

export function normalizeCommunicationsEmailDelivery(
  input: NormalizeCommunicationsEmailDeliveryInput,
): NormalizeCommunicationsEmailDeliveryResult {
  const caveatObjects: CaveatObject[] = [];
  const statusCode = typeof input.statusCode === "number" ? input.statusCode : null;
  const statusEvidence = input.statusEvidence ?? "status unavailable";
  const paidObserved = input.paidExecutionObserved === true;

  if (statusCode === null) {
    addCaveat(caveatObjects, "status_code_unavailable", "HTTP status code was not available in execution output.");
  }
  if (statusCode === 402) {
    addCaveat(caveatObjects, "payment_required_confirmed_only", "Unpaid payment challenge observed (HTTP 402). Delivery payload remains unobserved.");
    addCaveat(caveatObjects, "paid_payload_unobserved", "No paid payload was observed for this route execution evidence.");
  }
  if (statusCode === 403) {
    addCaveat(caveatObjects, "ownership_guard", "Provider returned ownership/authorization guard (HTTP 403). Route is gated by resource ownership.");
  }
  if (statusCode === 401) {
    addCaveat(caveatObjects, "auth_required", "Provider requires explicit authentication/authorization (HTTP 401).");
  }
  if (statusCode === 404) {
    addCaveat(caveatObjects, "route_not_found", "Provider route was not found (HTTP 404).");
  }

  if (typeof input.parsedJson === "string") {
    addCaveat(caveatObjects, "non_json_text_response", "Response payload was plain text and not structured JSON.");
  }

  const accepted = deepFindFirstBoolean(input.parsedJson, ["accepted", "success"]);
  const deliveryStatus = normalizeDeliveryStatus(input.parsedJson, accepted);
  const providerMessageId = findMessageId(input.parsedJson);

  if (!providerMessageId && paidObserved) {
    addCaveat(caveatObjects, "provider_message_id_missing", "Paid execution returned no provider message id.");
  }

  let recipientMatch: boolean | null = null;
  let subjectMatch: boolean | null = null;
  let bodyMatch: boolean | null = null;

  if (input.canonicalInput) {
    const echo = findEcho(input.parsedJson);
    const normalizedTo = input.canonicalInput.to.trim().toLowerCase();
    const normalizedSubject = input.canonicalInput.subject.trim();
    const normalizedBody = input.canonicalInput.body.trim();

    recipientMatch = echo.recipient ? echo.recipient.trim().toLowerCase() === normalizedTo : null;
    subjectMatch = echo.subject ? echo.subject.trim() === normalizedSubject : null;
    bodyMatch = echo.body ? echo.body.trim() === normalizedBody : null;

    if (recipientMatch !== true) {
      addCaveat(caveatObjects, "recipient_unconfirmed", "Response did not confirm canonical recipient.");
    }
    if (subjectMatch !== true) {
      addCaveat(caveatObjects, "subject_unconfirmed", "Response did not confirm canonical subject.");
    }
  }

  if (paidObserved) {
    addCaveat(caveatObjects, "inbox_delivery_unverified", "Provider accepted/queued send intent, but inbox receipt was not independently verified.");
  }

  const hasPartialSemantics =
    deliveryStatus === null ||
    deliveryStatus === "unknown" ||
    accepted !== true ||
    caveatObjects.some((c) => c.code === "recipient_unconfirmed" || c.code === "subject_unconfirmed");

  if (hasPartialSemantics) {
    addCaveat(
      caveatObjects,
      "email_delivery_semantics_partial",
      "Observed evidence only partially confirms send semantics for canonical delivery fields.",
    );
  }

  const normalized: CommunicationsEmailDeliveryNormalizedOutput = {
    accepted,
    provider_message_id: providerMessageId,
    delivery_status: deliveryStatus,
    recipient_match: recipientMatch,
    subject_match: subjectMatch,
    body_match: bodyMatch,
    status_evidence: statusEvidence,
    raw_status_code: statusCode,
  };

  return {
    normalized,
    caveat_objects: caveatObjects,
  };
}

export function deriveCommunicationsEvidenceHealth(input: EvidenceHealthInput): EvidenceHealth {
  const researchOnly = input.researchOnly === true;
  const paidAttempts = input.paidAttempts ?? 0;
  const paidSuccesses = input.paidSuccesses ?? 0;
  const paidFailures = input.paidFailures ?? Math.max(0, paidAttempts - paidSuccesses);
  const statuses = input.successfulNormalizedStatuses ?? [];
  const latest = input.latest;

  if (researchOnly && paidAttempts === 0) {
    return "scaffold";
  }

  if (paidAttempts === 0 || paidSuccesses === 0) {
    return "unverified";
  }

  const repeatedFailures = paidFailures >= 2;
  const inconsistentOutcomes = paidSuccesses > 0 && paidFailures > 0;
  const inconsistentStatuses = new Set(statuses.filter((status) => status !== null)).size > 1;
  if (repeatedFailures || inconsistentOutcomes || inconsistentStatuses) {
    return "degraded";
  }

  const latestStatus = latest?.normalized.delivery_status ?? null;
  const latestAccepted = latest?.normalized.accepted ?? null;
  const caveats = latest?.caveat_objects ?? [];
  const caveatedByPolicy = caveats.some((c) =>
    c.code === "inbox_delivery_unverified" ||
    c.code === "provider_message_id_missing" ||
    c.code === "status_code_unavailable" ||
    c.code === "email_delivery_semantics_partial" ||
    c.code === "paid_payload_unobserved",
  );
  const coreBlocking = caveats.some(
    (c) => c.affects_core_semantics && (c.severity === "warning" || c.severity === "error"),
  );

  const hasExpectedSendState = latestStatus === "accepted" || latestStatus === "queued" || latestStatus === "sent";

  if (hasExpectedSendState && latestAccepted === true && !coreBlocking && !caveatedByPolicy) {
    return "recorded";
  }

  return "caveated";
}
