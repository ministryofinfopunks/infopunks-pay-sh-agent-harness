import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveRouteState,
  renderProofMarkdown,
  runSolanaBalanceQuicknodePaid,
  shortenAddress,
  validateSafetyGate,
} from "./verifySolanaBalanceQuicknodePaid";
import type { LivePayShExecutionResult } from "./types";

function fakeLiveResult(overrides: Partial<LivePayShExecutionResult> = {}): LivePayShExecutionResult {
  return {
    providerId: "quicknode/solana-mainnet",
    intent: "solana-infra-account-balance",
    endpointUrl: "https://x402.quicknode.com/solana-mainnet/",
    startedAt: new Date("2026-05-19T00:00:00.000Z").toISOString(),
    completedAt: new Date("2026-05-19T00:00:01.000Z").toISOString(),
    latencyMs: 1000,
    success: true,
    statusCode: 200,
    exitCode: 0,
    costUsd: null,
    settlementReference: null,
    responsePreview: '{"jsonrpc":"2.0","result":{"value":123456789},"id":1}',
    parsedJsonAvailable: true,
    parsedJson: {
      jsonrpc: "2.0",
      result: { value: 123456789 },
      id: 1,
    },
    mode: "live_pay_sh_cli",
    ...overrides,
  };
}

test("safety gate fails when SOLANA_BALANCE_BENCHMARK_ADDRESS is missing", () => {
  const gate = validateSafetyGate({
    LIVE_PAYSH_EXECUTION: "true",
    PAYSH_EXECUTION_MODE: "pay_cli",
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "SOLANA_BALANCE_BENCHMARK_ADDRESS_missing");
});

test("safety gate fails when LIVE_PAYSH_EXECUTION is missing", () => {
  const gate = validateSafetyGate({
    SOLANA_BALANCE_BENCHMARK_ADDRESS: "So11111111111111111111111111111111111111112",
    PAYSH_EXECUTION_MODE: "pay_cli",
  });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "LIVE_PAYSH_EXECUTION_not_true");
});

test("successful paid getBalance normalization", async () => {
  const originalAddress = process.env.SOLANA_BALANCE_BENCHMARK_ADDRESS;
  const originalLive = process.env.LIVE_PAYSH_EXECUTION;
  const originalMode = process.env.PAYSH_EXECUTION_MODE;
  process.env.SOLANA_BALANCE_BENCHMARK_ADDRESS = "So11111111111111111111111111111111111111112";
  process.env.LIVE_PAYSH_EXECUTION = "true";
  process.env.PAYSH_EXECUTION_MODE = "pay_cli";

  try {
    const result = await runSolanaBalanceQuicknodePaid(async () => fakeLiveResult(), new Date("2026-05-19T00:00:00.000Z"));
    assert.equal(result.paid_execution_status, "succeeded");
    assert.equal(result.balance_lamports, 123456789);
    assert.equal(result.balance_sol, 0.123456789);
    assert.equal(result.route_state, "verified/proven");
  } finally {
    if (originalAddress === undefined) {
      delete process.env.SOLANA_BALANCE_BENCHMARK_ADDRESS;
    } else {
      process.env.SOLANA_BALANCE_BENCHMARK_ADDRESS = originalAddress;
    }
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

test("proof shortens address", () => {
  const short = shortenAddress("So11111111111111111111111111111111111111112");
  assert.equal(short, "So1111...111112");

  const markdown = renderProofMarkdown({
    benchmark_id: "solana-infra-account-balance",
    provider: "QuickNode",
    endpoint: "https://x402.quicknode.com/solana-mainnet/",
    method: "POST",
    canonical_input_hash: "abc",
    canonical_address_short: short,
    paid_execution_status: "succeeded",
    cli_exit_code: 0,
    status_evidence: "status_code_observed_200",
    normalized_output: {
      address: null,
      network: "solana",
      balance_lamports: 1,
      balance_sol: 0.000000001,
      address_match: null,
      network_match: true,
      balance_detected: true,
      status_evidence: "status_code_observed_200",
      raw_status_code: 200,
      caveat_objects: [],
      evidence_health: "caveated",
    },
    balance_lamports: 1,
    balance_sol: 0.000000001,
    address_match: null,
    network_match: true,
    caveat_objects: [],
    evidence_health: "caveated",
    route_state: "verified/proven",
    conclusion: "ok",
    proof_path: "live-proofs/example.md",
  });

  assert.match(markdown, /canonical_address_short: So1111\.\.\.111112/);
  assert.doesNotMatch(markdown, /So11111111111111111111111111111111111111112/);
});

test("route_state can be verified while evidence_health remains caveated", async () => {
  const originalAddress = process.env.SOLANA_BALANCE_BENCHMARK_ADDRESS;
  const originalLive = process.env.LIVE_PAYSH_EXECUTION;
  const originalMode = process.env.PAYSH_EXECUTION_MODE;
  process.env.SOLANA_BALANCE_BENCHMARK_ADDRESS = "So11111111111111111111111111111111111111112";
  process.env.LIVE_PAYSH_EXECUTION = "true";
  process.env.PAYSH_EXECUTION_MODE = "pay_cli";

  try {
    const result = await runSolanaBalanceQuicknodePaid(
      async () =>
        fakeLiveResult({
          statusCode: undefined,
          responsePreview: '{"jsonrpc":"2.0","result":{"value":1000000000},"id":1}',
          parsedJson: { jsonrpc: "2.0", result: { value: 1000000000 }, id: 1 },
        }),
      new Date("2026-05-19T00:00:00.000Z"),
    );

    assert.equal(result.route_state, "verified/proven");
    assert.equal(result.evidence_health, "caveated");
  } finally {
    if (originalAddress === undefined) {
      delete process.env.SOLANA_BALANCE_BENCHMARK_ADDRESS;
    } else {
      process.env.SOLANA_BALANCE_BENCHMARK_ADDRESS = originalAddress;
    }
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

test("deriveRouteState returns rejected on hard blocking caveats", () => {
  const state = deriveRouteState({
    paidCallSuccess: false,
    normalized: {
      normalized: {
        address: null,
        network: "solana",
        balance_lamports: null,
        balance_sol: null,
        address_match: null,
        network_match: false,
        balance_detected: false,
        status_evidence: "status_code_observed_404",
        raw_status_code: 404,
        caveat_objects: [],
        evidence_health: "degraded",
      },
      caveat_objects: [
        {
          code: "route_not_found",
          severity: "error",
          affects_core_semantics: true,
          detail: "Provider route was not found (HTTP 404).",
        },
      ],
    },
  });
  assert.equal(state, "rejected");
});
