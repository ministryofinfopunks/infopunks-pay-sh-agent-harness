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
    mode: "paid_pay_cli",
    success: false,
    executionTransport: "pay_cli",
    cliExitCode: 1,
    statusCode: null,
    statusEvidence: "pay_cli_exit_1_status_unavailable",
    latencyMs: 100,
    responseShapeClassified: "unknown",
    tokenSearchResultDetected: false,
    paymentRequiredChallengeAppears: false,
    paidExecutionAttempted: true,
    responseBodyShapeAppearsTokenSearchLike: false,
    routeCandidateEvidence: false,
    executionEvidenceStatus: "unproven",
    proofReference: "live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md",
    safeSummary: "Paid execution did not prove token search.",
    verificationSemantics: classifyVerificationSemantics({
      endpointUrl: payspongeCoinGeckoTokenSearchCandidate.endpoint_url,
      method: payspongeCoinGeckoTokenSearchCandidate.method,
      benchmarkIntent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
      statusCode: null,
      paymentRequiredChallengeAppears: false,
      routeCandidateEvidence: false,
      paidExecutionAttempted: true,
      responseShapeClassified: "unknown",
    }),
    ...overrides,
  };
}

test("token-search mapping remains verified after probe outcomes", () => {
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.benchmark_intent, "token search");
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.mapping_status, "verified");
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.execution_evidence_status, "proven");
  assert.equal(
    payspongeCoinGeckoTokenSearchCandidate.proof_reference,
    "live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md",
  );
  assert.equal(payspongeCoinGeckoTokenSearchCandidate.method, "GET");
  assert.deepEqual(payspongeCoinGeckoTokenSearchCandidate.request_shape_example, { query: "SOL" });
});

test("successful paid fixture is proven", () => {
  const markdown = renderProofMarkdown(
    baseProbeResult({
      success: true,
      cliExitCode: 0,
      statusCode: 200,
      statusEvidence: "status_code_observed_200",
      responseShapeClassified: "token_search_like_json",
      tokenSearchResultDetected: true,
      executionEvidenceStatus: "proven",
      safeSummary: "Paid execution succeeded for token-search semantics.",
      verificationSemantics: classifyVerificationSemantics({
        endpointUrl: payspongeCoinGeckoTokenSearchCandidate.endpoint_url,
        method: payspongeCoinGeckoTokenSearchCandidate.method,
        benchmarkIntent: payspongeCoinGeckoTokenSearchCandidate.benchmark_intent,
        statusCode: 200,
        paymentRequiredChallengeAppears: false,
        routeCandidateEvidence: true,
        paidExecutionAttempted: true,
        responseShapeClassified: "token_search_like_json",
      }),
    }),
    new Date("2026-05-17T00:00:00.000Z"),
  );

  assert.match(markdown, /success: true/);
  assert.match(markdown, /execution_evidence_status_target: proven/);
});

test("failed paid fixture remains unproven", () => {
  const markdown = renderProofMarkdown(baseProbeResult(), new Date("2026-05-17T00:00:00.000Z"));
  assert.match(markdown, /success: false/);
  assert.match(markdown, /execution_evidence_status_target: unproven/);
});

test("pay_cli null status uses status_evidence instead of fake 200", () => {
  const markdown = renderProofMarkdown(
    baseProbeResult({
      cliExitCode: 0,
      statusCode: null,
      statusEvidence: "pay_cli_exit_0_without_parseable_status",
    }),
    new Date("2026-05-17T00:00:00.000Z"),
  );

  assert.match(markdown, /status_code: null/);
  assert.match(markdown, /status_evidence: pay_cli_exit_0_without_parseable_status/);
  assert.doesNotMatch(markdown, /status_code: 200/);
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
    "live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md",
  );
  const proof = readFileSync(proofPath, "utf8");

  assert.match(proof, /No benchmark readiness claim\./);
  assert.match(proof, /No winner claim\./);
  assert.doesNotMatch(proof, /benchmark[-_ ]ready:\s*true/i);
  assert.doesNotMatch(proof, /winner_claimed:\s*true/i);
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
