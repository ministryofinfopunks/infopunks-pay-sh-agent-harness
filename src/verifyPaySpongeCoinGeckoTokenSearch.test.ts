import test from "node:test";
import assert from "node:assert/strict";
import { payspongeCoinGeckoTokenSearchCandidate } from "./mappings/payspongeCoinGeckoTokenSearch";
import {
  classifyRouteCandidateEvidence,
  renderProofMarkdown,
  sanitizeProofMarkdown,
  TokenSearchProbeResult,
} from "./verifyPaySpongeCoinGeckoTokenSearch";

function baseProbeResult(overrides: Partial<TokenSearchProbeResult> = {}): TokenSearchProbeResult {
  return {
    endpointUrl: payspongeCoinGeckoTokenSearchCandidate.endpoint_url,
    method: payspongeCoinGeckoTokenSearchCandidate.method,
    mode: "unpaid_safe_probe",
    statusCode: 402,
    paymentRequiredChallengeAppears: true,
    paidExecutionAttempted: false,
    responseBodyShapeAppearsTokenSearchLike: false,
    routeCandidateEvidence: true,
    executionEvidenceStatus: "unproven",
    safeSummary: "Unpaid probe reached a payment-required challenge for the candidate route.",
    ...overrides,
  };
}

test("candidate mapping has benchmark_intent token search", () => {
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.benchmark_intent, "token search");
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.category, "finance/data");
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.provider_id, "paysponge-coingecko");
});

test("candidate mapping is candidate and unproven by default", () => {
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.mapping_status, "candidate");
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.execution_evidence_status, "unproven");
});

test("proof markdown does not include sensitive headers or secrets", () => {
  const markdown = renderProofMarkdown(
    baseProbeResult({
      safeSummary:
        "Authorization: Bearer secret-token x-payment: raw-signature private_key=abc seed phrase: twelve words",
    }),
    new Date("2026-05-17T00:00:00.000Z"),
  );

  assert.doesNotMatch(markdown, /secret-token/);
  assert.doesNotMatch(markdown, /raw-signature/);
  assert.doesNotMatch(markdown, /private_key=abc/);
  assert.doesNotMatch(markdown, /twelve words/);
  assert.match(markdown, /\[REDACTED\]/);
});

test("sanitizer redacts authorization-like values", () => {
  const markdown = sanitizeProofMarkdown("Authorization: Bearer abc.def\npayment-signature: sig");
  assert.doesNotMatch(markdown, /abc\.def/);
  assert.doesNotMatch(markdown, /sig/);
});

test("verifier can classify unpaid 402 payment-required as route candidate evidence", () => {
  assert.equal(
    classifyRouteCandidateEvidence({
      statusCode: 402,
      paymentRequiredChallengeAppears: true,
      responseBodyShapeAppearsTokenSearchLike: false,
    }),
    true,
  );
});

test("proof markdown keeps token search unproven and makes no winner or benchmark-ready claim", () => {
  const markdown = renderProofMarkdown(baseProbeResult(), new Date("2026-05-17T00:00:00.000Z"));

  assert.match(markdown, /benchmark_intent: token search/);
  assert.match(markdown, /execution_evidence_status: unproven/);
  assert.match(markdown, /paid_execution_attempted: false/);
  assert.doesNotMatch(markdown, /winner_claimed:\s*true/i);
  assert.doesNotMatch(markdown, /benchmark[-_ ]ready:\s*true/i);
  assert.doesNotMatch(markdown, /route superiority is proven/i);
});
