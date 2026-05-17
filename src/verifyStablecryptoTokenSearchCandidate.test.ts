import test from "node:test";
import assert from "node:assert/strict";
import {
  paidExecutionEnabled,
  renderProofMarkdown,
  renderStablecryptoMappingFile,
  runStablecryptoPaidExecution,
  sanitizeProofMarkdown,
  StablecryptoPaidExecutionResult,
} from "./verifyStablecryptoTokenSearchCandidate";
import { LivePayShExecutionResult } from "./types";

function basePaidResult(overrides: Partial<StablecryptoPaidExecutionResult> = {}): StablecryptoPaidExecutionResult {
  return {
    provider_id: "merit-systems-stablecrypto-market-data",
    endpoint: "https://stablecrypto.dev/api/coingecko/onchain/search",
    method: "POST",
    request_shape: { query: "SOL" },
    paid_execution_attempted: true,
    success: true,
    execution_transport: "pay_cli",
    cli_exit_code: 0,
    status_code: 200,
    status_evidence: "status_code_observed_200",
    latency_ms: 123,
    response_shape_classified: "token_search_like_json",
    token_search_result_detected: true,
    proof_reference: "live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md",
    ...overrides,
  };
}

function fakeLiveResult(overrides: Partial<LivePayShExecutionResult> = {}): LivePayShExecutionResult {
  return {
    providerId: "merit-systems-stablecrypto-market-data",
    intent: "token search",
    endpointUrl: "https://stablecrypto.dev/api/coingecko/onchain/search",
    startedAt: new Date("2026-05-17T00:00:00.000Z").toISOString(),
    completedAt: new Date("2026-05-17T00:00:01.000Z").toISOString(),
    latencyMs: 1000,
    success: true,
    statusCode: 200,
    exitCode: 0,
    costUsd: null,
    settlementReference: null,
    responsePreview: '{"data":[{"type":"token","attributes":{"symbol":"SOL"}}]}',
    parsedJsonAvailable: true,
    parsedJson: { data: [{ type: "token", attributes: { symbol: "SOL" } }] },
    mode: "live_pay_sh_cli",
    ...overrides,
  };
}

test("successful paid fixture upgrades to verified/proven", () => {
  const mapping = renderStablecryptoMappingFile(basePaidResult({ success: true }));

  assert.match(mapping, /mapping_status: "verified"/);
  assert.match(mapping, /execution_evidence_status: "proven"/);
  assert.match(mapping, /proven_at: "2026-05-17"/);
  assert.match(mapping, /proof_reference: "live-proofs\/stablecrypto-token-search-paid-execution-2026-05-17.md"/);
});

test("failed paid fixture remains verified/unproven", () => {
  const mapping = renderStablecryptoMappingFile(
    basePaidResult({
      success: false,
      status_code: null,
      cli_exit_code: 1,
      status_evidence: "pay_cli_exit_1_status_unavailable",
      token_search_result_detected: false,
    }),
  );

  assert.match(mapping, /mapping_status: "verified"/);
  assert.match(mapping, /execution_evidence_status: "unproven"/);
  assert.doesNotMatch(mapping, /proven_at:/);
});

test("pay_cli null status uses status_evidence instead of fake 200", async () => {
  const originalLive = process.env.LIVE_PAYSH_EXECUTION;
  const originalMode = process.env.PAYSH_EXECUTION_MODE;
  process.env.LIVE_PAYSH_EXECUTION = "true";
  process.env.PAYSH_EXECUTION_MODE = "pay_cli";

  try {
    const result = await runStablecryptoPaidExecution(async () =>
      fakeLiveResult({
        success: false,
        statusCode: undefined,
        exitCode: 1,
        errorReason: "pay_cli_execution_failed",
        responsePreview: "status unavailable",
        parsedJsonAvailable: false,
        parsedJson: undefined,
      }),
    );

    assert.equal(result.status_code, null);
    assert.match(result.status_evidence, /pay_cli_exit_1_/);
    assert.notEqual(result.status_evidence, "status_code_observed_200");
    assert.equal(result.success, false);
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

test("proof markdown is safe from secrets", () => {
  const markdown = renderProofMarkdown(
    basePaidResult({
      status_evidence: "Authorization: Bearer token wallet=abc signature=xyz",
    }),
    new Date("2026-05-17T00:00:00.000Z"),
  );

  assert.doesNotMatch(markdown, /Bearer token/);
  assert.doesNotMatch(markdown, /wallet=abc/);
  assert.doesNotMatch(markdown, /signature=xyz/);
  assert.match(markdown, /\[REDACTED\]/);
});

test("proof markdown contains no benchmark-ready or winner wording", () => {
  const markdown = renderProofMarkdown(basePaidResult(), new Date("2026-05-17T00:00:00.000Z"));

  assert.match(markdown, /No benchmark-ready claim\./);
  assert.match(markdown, /No winner claim\./);
  assert.doesNotMatch(markdown, /benchmark-ready:\s*true/i);
  assert.doesNotMatch(markdown, /winner_claimed:\s*true/i);
  assert.doesNotMatch(markdown, /route superiority/i);
});

test("paid execution enabled gate", () => {
  const originalLive = process.env.LIVE_PAYSH_EXECUTION;
  const originalMode = process.env.PAYSH_EXECUTION_MODE;

  delete process.env.LIVE_PAYSH_EXECUTION;
  delete process.env.PAYSH_EXECUTION_MODE;
  assert.equal(paidExecutionEnabled(), false);

  process.env.LIVE_PAYSH_EXECUTION = "true";
  process.env.PAYSH_EXECUTION_MODE = "pay_cli";
  assert.equal(paidExecutionEnabled(), true);

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
});

test("sanitizeProofMarkdown redacts sensitive fields", () => {
  const sanitized = sanitizeProofMarkdown("authorization: Bearer a\napi_key: key\nwallet: 0xabc\nmnemonic: words");
  assert.doesNotMatch(sanitized, /Bearer a/);
  assert.doesNotMatch(sanitized, /api_key: key/);
  assert.doesNotMatch(sanitized, /wallet: 0xabc/);
  assert.doesNotMatch(sanitized, /mnemonic: words/);
  assert.match(sanitized, /\[REDACTED\]/);
});
