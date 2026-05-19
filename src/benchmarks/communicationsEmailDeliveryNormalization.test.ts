import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveCommunicationsEvidenceHealth,
  normalizeCommunicationsEmailDelivery,
  type NormalizeCommunicationsEmailDeliveryResult,
} from "./communicationsEmailDeliveryNormalization";

const canonicalInput = {
  to: "bench@example.com",
  subject: "Infopunks Radar benchmark",
  body: "Radar benchmark delivery test.",
};

test("StableEmail-like accepted response normalizes accepted/message_id and canonical matches", () => {
  const result = normalizeCommunicationsEmailDelivery({
    parsedJson: {
      accepted: true,
      message_id: "stb_123",
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
      text: "Radar benchmark delivery test.",
    },
    statusCode: 200,
    statusEvidence: "http response status 200",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.accepted, true);
  assert.equal(result.normalized.provider_message_id, "stb_123");
  assert.equal(result.normalized.delivery_status, "accepted");
  assert.equal(result.normalized.recipient_match, true);
  assert.equal(result.normalized.subject_match, true);
  assert.equal(result.normalized.body_match, true);
});

test("AgentMail-like queued/sent response normalizes delivery status", () => {
  const queued = normalizeCommunicationsEmailDelivery({
    parsedJson: {
      status: "queued",
      accepted: true,
      provider_message_id: "ag_queued_1",
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
    },
    statusCode: 202,
    statusEvidence: "http response status 202",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(queued.normalized.delivery_status, "queued");

  const sent = normalizeCommunicationsEmailDelivery({
    parsedJson: {
      status: "sent",
      accepted: true,
      provider_message_id: "ag_sent_1",
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
    },
    statusCode: 200,
    statusEvidence: "http response status 200",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(sent.normalized.delivery_status, "sent");
});

test("402 payment-required only response adds payment caveats", () => {
  const result = normalizeCommunicationsEmailDelivery({
    parsedJson: { error: "Payment Required" },
    statusCode: 402,
    statusEvidence: "http response status 402",
    paidExecutionObserved: false,
    canonicalInput,
  });

  const codes = result.caveat_objects.map((entry) => entry.code);
  assert.ok(codes.includes("payment_required_confirmed_only"));
  assert.ok(codes.includes("paid_payload_unobserved"));
});

test("403 ownership guard response adds ownership_guard", () => {
  const result = normalizeCommunicationsEmailDelivery({
    parsedJson: { error: "inbox ownership required" },
    statusCode: 403,
    statusEvidence: "http response status 403",
    paidExecutionObserved: false,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "ownership_guard"));
});

test("missing message id adds provider_message_id_missing", () => {
  const result = normalizeCommunicationsEmailDelivery({
    parsedJson: {
      accepted: true,
      status: "accepted",
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
      text: "Radar benchmark delivery test.",
    },
    statusCode: 200,
    statusEvidence: "http response status 200",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.provider_message_id, null);
  assert.ok(result.caveat_objects.some((entry) => entry.code === "provider_message_id_missing"));
});

test("non-JSON response adds non_json_text_response caveat", () => {
  const result = normalizeCommunicationsEmailDelivery({
    parsedJson: "queued by provider",
    responsePreview: "queued by provider",
    statusCode: 200,
    statusEvidence: "http response status 200",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "non_json_text_response"));
});

test("pay_cli status hidden uses status evidence and status_code_unavailable caveat", () => {
  const result = normalizeCommunicationsEmailDelivery({
    parsedJson: {
      accepted: true,
      provider_message_id: "stb_cli_1",
    },
    statusCode: null,
    statusEvidence: "pay_cli exit code 0 and parsed response body",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.raw_status_code, null);
  assert.equal(result.normalized.status_evidence, "pay_cli exit code 0 and parsed response body");
  assert.ok(result.caveat_objects.some((entry) => entry.code === "status_code_unavailable"));
});

function makeLatest(
  overrides: Partial<NormalizeCommunicationsEmailDeliveryResult>,
): NormalizeCommunicationsEmailDeliveryResult {
  const base = normalizeCommunicationsEmailDelivery({
    parsedJson: {
      accepted: true,
      status: "accepted",
      provider_message_id: "msg_1",
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
      text: "Radar benchmark delivery test.",
    },
    statusCode: 200,
    statusEvidence: "http response status 200",
    paidExecutionObserved: true,
    canonicalInput,
  });

  return {
    normalized: {
      ...base.normalized,
      ...(overrides.normalized ?? {}),
    },
    caveat_objects: overrides.caveat_objects ?? base.caveat_objects,
  };
}

test("evidence_health derivation", () => {
  const recorded = deriveCommunicationsEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 1,
    paidFailures: 0,
    successfulNormalizedStatuses: ["accepted"],
    latest: makeLatest({ caveat_objects: [] }),
  });
  assert.equal(recorded, "recorded");

  const caveated = deriveCommunicationsEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 1,
    paidFailures: 0,
    successfulNormalizedStatuses: ["accepted"],
    latest: makeLatest({}),
  });
  assert.equal(caveated, "caveated");

  const degraded = deriveCommunicationsEvidenceHealth({
    paidAttempts: 3,
    paidSuccesses: 1,
    paidFailures: 2,
    successfulNormalizedStatuses: ["accepted"],
    latest: makeLatest({}),
  });
  assert.equal(degraded, "degraded");

  const unverified = deriveCommunicationsEvidenceHealth({
    paidAttempts: 0,
    paidSuccesses: 0,
    paidFailures: 0,
  });
  assert.equal(unverified, "unverified");

  const scaffold = deriveCommunicationsEvidenceHealth({
    researchOnly: true,
    paidAttempts: 0,
    paidSuccesses: 0,
    paidFailures: 0,
  });
  assert.equal(scaffold, "scaffold");
});
