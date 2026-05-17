import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { payspongeCoinGeckoTokenSearchCandidate } from "./mappings/payspongeCoinGeckoTokenSearch";
import {
  classifyRouteCandidateEvidence,
  classifyVerificationSemantics,
  paidExecutionEnabled,
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
    safeSummary: "Unpaid probe reached a payment-required challenge for the route.",
    verificationSemantics: classifyVerificationSemantics({
      endpointUrl: payspongeCoinGeckoTokenSearchCandidate.endpoint_url,
      method: payspongeCoinGeckoTokenSearchCandidate.method,
      benchmarkIntent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
      statusCode: 402,
      paymentRequiredChallengeAppears: true,
      routeCandidateEvidence: true,
      paidExecutionAttempted: false,
    }),
    ...overrides,
  };
}

test("token-search mapping is verified and unproven", () => {
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.benchmark_intent, "token search");
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.mapping_status, "verified");
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.execution_evidence_status, "unproven");
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.method, "GET");
  assert.deepEqual(payspongeCoinGeckoTokenSearchCandidate.request_shape_example, { query: "SOL" });
});

test("paid_execution_attempted remains false in verified/unproven proof output", () => {
  const markdown = renderProofMarkdown(baseProbeResult(), new Date("2026-05-17T00:00:00.000Z"));
  assert.match(markdown, /paid_execution_attempted: false/);
  assert.match(markdown, /execution_evidence_status: unproven/);
});

test("verifier does not attempt paid execution by default", () => {
  const originalLive = process.env.LIVE_PAYSH_EXECUTION;
  const originalMode = process.env.PAYSH_EXECUTION_MODE;
  delete process.env.LIVE_PAYSH_EXECUTION;
  delete process.env.PAYSH_EXECUTION_MODE;

  try {
    assert.equal(paidExecutionEnabled(), false);
  } finally {
    if (originalLive === undefined) {
      delete process.env.LIVE_PAYSH_EXECUTION;
    } else {
      process.env.LIVE_PAYSH_EXECUTION = originalLive;
    }

    if (originalMode === undefined) {
      delete process.env.PAYSH_EXECUTION_MODE;
    } else {
      process.env.PAYSH_EXECUTION_MODE = originalMode;
    }
  }
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

test("proof markdown file contains no benchmark-ready or winner claim", () => {
  const proofPath = path.resolve(
    process.cwd(),
    "live-proofs/paysponge-coingecko-token-search-verified-unproven-2026-05-17.md",
  );
  const proof = readFileSync(proofPath, "utf8");

  assert.match(proof, /No benchmark readiness claim\./);
  assert.match(proof, /No winner claim\./);
  assert.doesNotMatch(proof, /benchmark[-_ ]ready:\s*true/i);
  assert.doesNotMatch(proof, /winner_claimed:\s*true/i);
});

test("unpaid 402 challenge is required for verified/unproven semantics", () => {
  const verified = classifyVerificationSemantics({
    endpointUrl: payspongeCoinGeckoTokenSearchCandidate.endpoint_url,
    method: payspongeCoinGeckoTokenSearchCandidate.method,
    benchmarkIntent: "token search",
    statusCode: 402,
    paymentRequiredChallengeAppears: true,
    routeCandidateEvidence: true,
    paidExecutionAttempted: false,
  });
  const notVerified = classifyVerificationSemantics({
    endpointUrl: payspongeCoinGeckoTokenSearchCandidate.endpoint_url,
    method: payspongeCoinGeckoTokenSearchCandidate.method,
    benchmarkIntent: "token search",
    statusCode: 200,
    paymentRequiredChallengeAppears: false,
    routeCandidateEvidence: false,
    paidExecutionAttempted: false,
  });

  assert.equal(verified.unpaid402ChallengeConfirmed, true);
  assert.equal(notVerified.unpaid402ChallengeConfirmed, false);
  assert.equal(notVerified.responseShapeClassified, false);
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
