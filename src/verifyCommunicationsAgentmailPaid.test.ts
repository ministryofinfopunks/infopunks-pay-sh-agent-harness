import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCommunicationsEmailDelivery } from "./benchmarks/communicationsEmailDeliveryNormalization";
import {
  redactEndpoint,
  sanitizeProofMarkdown,
  validateSafetyGate,
} from "./verifyCommunicationsAgentmailPaid";

test("safety gate fails when AGENTMAIL_INBOX_ID is missing", () => {
  const result = validateSafetyGate({
    BENCHMARK_EMAIL_TO: "bench@example.com",
    BENCHMARK_EMAIL_TO_CONTROLLED: "true",
    LIVE_PAYSH_EXECUTION: "true",
    PAYSH_EXECUTION_MODE: "pay_cli",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "AGENTMAIL_INBOX_ID_missing");
});

test("safety gate fails when BENCHMARK_EMAIL_TO is missing", () => {
  const result = validateSafetyGate({
    AGENTMAIL_INBOX_ID: "inb_123",
    BENCHMARK_EMAIL_TO_CONTROLLED: "true",
    LIVE_PAYSH_EXECUTION: "true",
    PAYSH_EXECUTION_MODE: "pay_cli",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "BENCHMARK_EMAIL_TO_missing");
});

test("safety gate fails when BENCHMARK_EMAIL_TO_CONTROLLED is not true", () => {
  const result = validateSafetyGate({
    AGENTMAIL_INBOX_ID: "inb_123",
    BENCHMARK_EMAIL_TO: "bench@example.com",
    BENCHMARK_EMAIL_TO_CONTROLLED: "false",
    LIVE_PAYSH_EXECUTION: "true",
    PAYSH_EXECUTION_MODE: "pay_cli",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "BENCHMARK_EMAIL_TO_CONTROLLED_not_true");
});

test("ownership guard classification from 403 response", () => {
  const result = normalizeCommunicationsEmailDelivery({
    parsedJson: { error: "ownership required" },
    statusCode: 403,
    statusEvidence: "status_code_observed_403",
    paidExecutionObserved: false,
    canonicalInput: {
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
      body: "Radar benchmark delivery test.",
    },
  });
  assert.ok(result.caveat_objects.some((c) => c.code === "ownership_guard"));
});

test("successful queued/sent response normalization", () => {
  const queued = normalizeCommunicationsEmailDelivery({
    parsedJson: {
      accepted: true,
      status: "queued",
      provider_message_id: "msg_1",
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
      text: "Radar benchmark delivery test.",
    },
    statusCode: 202,
    statusEvidence: "status_code_observed_202",
    paidExecutionObserved: true,
    canonicalInput: {
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
      body: "Radar benchmark delivery test.",
    },
  });
  assert.equal(queued.normalized.delivery_status, "queued");

  const sent = normalizeCommunicationsEmailDelivery({
    parsedJson: {
      accepted: true,
      status: "sent",
      provider_message_id: "msg_2",
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
      text: "Radar benchmark delivery test.",
    },
    statusCode: 200,
    statusEvidence: "status_code_observed_200",
    paidExecutionObserved: true,
    canonicalInput: {
      to: "bench@example.com",
      subject: "Infopunks Radar benchmark",
      body: "Radar benchmark delivery test.",
    },
  });
  assert.equal(sent.normalized.delivery_status, "sent");
});

test("redacts inbox id and recipient in proof artifacts", () => {
  const endpoint = "https://x402.api.agentmail.to/v0/inboxes/inbox_secret_123/messages/send";
  const redactedEndpoint = redactEndpoint(endpoint);
  assert.ok(!redactedEndpoint.includes("inbox_secret_123"));
  assert.ok(redactedEndpoint.includes("/inboxes/inb***23/"));

  const markdown = [
    `endpoint: ${redactedEndpoint}`,
    "to: bench@example.com",
    "Authorization: Bearer abc123",
  ].join("\n");
  const sanitized = sanitizeProofMarkdown(markdown);
  assert.ok(!sanitized.includes("bench@example.com"));
  assert.ok(!sanitized.includes("Bearer abc123"));
});
