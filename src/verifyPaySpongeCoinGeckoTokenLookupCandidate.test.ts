import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { payspongeCoinGeckoTokenLookupCandidate } from "./mappings/payspongeCoinGeckoTokenLookupCandidate";
import {
  paidExecutionEnabled,
  renderProofMarkdown,
  sanitizeProofMarkdown,
} from "./verifyPaySpongeCoinGeckoTokenLookupCandidate";

test("candidate mapping keeps token-search intent without benchmark/winner claims", () => {
  assert.equal(payspongeCoinGeckoTokenLookupCandidate.benchmark_intent, "token search");
  assert.equal(payspongeCoinGeckoTokenLookupCandidate.mapping_status, "candidate");
  assert.equal(payspongeCoinGeckoTokenLookupCandidate.execution_evidence_status, "unproven");
  assert.match(payspongeCoinGeckoTokenLookupCandidate.notes, /not benchmark-ready/i);
  assert.match(payspongeCoinGeckoTokenLookupCandidate.notes, /no winner claim/i);
});

test("paid execution is disabled by default", () => {
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

test("safe proof markdown redacts secrets and avoids readiness/winner claims", () => {
  const markdown = renderProofMarkdown(
    {
      endpointUrl: payspongeCoinGeckoTokenLookupCandidate.endpoint_url,
      method: "GET",
      mode: "unpaid_safe_probe",
      mappingStatusTarget: "candidate",
      executionEvidenceStatus: "unproven",
      success: false,
      statusCode: 402,
      cliExitCode: null,
      paidExecutionAttempted: false,
      paymentRequiredChallengeAppears: true,
      endpointPathConfirmed: true,
      methodConfirmed: true,
      requestShapeConfirmed: true,
      responseShapeClassified: true,
      benchmarkIntentConfirmed: true,
      tokenLookupLikeShapeDetected: false,
      statusEvidence: "status_code_observed_402",
      responseShapeSummary: "Payment challenge observed.",
      safeSummary: "Authorization: Bearer secret-token wallet=abc",
    },
    new Date("2026-05-17T00:00:00.000Z"),
  );

  assert.doesNotMatch(markdown, /secret-token/);
  assert.doesNotMatch(markdown, /wallet=abc/);
  assert.match(markdown, /\[REDACTED\]/);
  assert.match(markdown, /No benchmark readiness claim\./);
  assert.match(markdown, /No winner claim\./);
  assert.doesNotMatch(markdown, /benchmark[-_ ]ready:\s*true/i);
  assert.doesNotMatch(markdown, /winner_claimed:\s*true/i);
});

test("failed path must not promote to proven", () => {
  const markdown = renderProofMarkdown(
    {
      endpointUrl: payspongeCoinGeckoTokenLookupCandidate.endpoint_url,
      method: "GET",
      mode: "paid_pay_cli",
      mappingStatusTarget: "candidate",
      executionEvidenceStatus: "unproven",
      success: false,
      statusCode: null,
      cliExitCode: 1,
      paidExecutionAttempted: true,
      paymentRequiredChallengeAppears: false,
      endpointPathConfirmed: true,
      methodConfirmed: true,
      requestShapeConfirmed: true,
      responseShapeClassified: false,
      benchmarkIntentConfirmed: true,
      tokenLookupLikeShapeDetected: false,
      statusEvidence: "pay_cli_exit_1_status_unavailable",
      responseShapeSummary: "No strong semantics.",
      safeSummary: "Paid execution failed.",
    },
    new Date("2026-05-17T00:00:00.000Z"),
  );

  assert.match(markdown, /execution_evidence_status: unproven/);
  assert.match(markdown, /mapping_status_target: candidate/);
  assert.doesNotMatch(markdown, /execution_evidence_status:\s*proven/);
});

test("proof file remains conservative", () => {
  const proofPath = path.resolve(
    process.cwd(),
    "live-proofs/paysponge-coingecko-token-search-candidate-or-paid-2026-05-17.md",
  );
  const proof = readFileSync(proofPath, "utf8");

  assert.match(proof, /No benchmark readiness claim\./);
  assert.match(proof, /No winner claim\./);
  assert.doesNotMatch(proof, /winner_claimed:\s*true/i);
});

test("sanitizer catches bearer and signature forms", () => {
  const markdown = sanitizeProofMarkdown("Authorization: Bearer abc\nsignature: xyz");
  assert.doesNotMatch(markdown, /abc/);
  assert.doesNotMatch(markdown, /xyz/);
});
