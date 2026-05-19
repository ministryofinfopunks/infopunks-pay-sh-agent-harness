import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveSolanaInfraEvidenceHealth,
  normalizeSolanaInfraAccountBalance,
  type NormalizeSolanaInfraAccountBalanceResult,
} from "./solanaInfraAccountBalanceNormalization";

const canonicalInput = {
  network: "solana",
  address: "So11111111111111111111111111111111111111112",
};

test("JSON-RPC getBalance response normalizes lamports and SOL", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: {
      jsonrpc: "2.0",
      result: {
        context: { slot: 123 },
        value: 123456789,
      },
      id: 1,
    },
    statusCode: 200,
    statusEvidence: "http response status 200",
    paidExecutionObserved: true,
    canonicalInput,
    routeContext: "https://x402.quicknode.com/solana-mainnet/",
  });

  assert.equal(result.normalized.balance_lamports, 123456789);
  assert.equal(result.normalized.balance_sol, 0.123456789);
  assert.equal(result.normalized.balance_detected, true);
});

test("JSON-RPC getAccountInfo response normalizes lamports and SOL", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: {
      jsonrpc: "2.0",
      result: {
        value: {
          lamports: 2000000000,
        },
      },
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
    routeContext: "https://x402.quicknode.com/solana-mainnet/",
  });

  assert.equal(result.normalized.balance_lamports, 2000000000);
  assert.equal(result.normalized.balance_sol, 2);
});

test("direct lamports response normalizes", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: {
      lamports: 500000000,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
    routeContext: "solana",
  });

  assert.equal(result.normalized.balance_lamports, 500000000);
  assert.equal(result.normalized.balance_sol, 0.5);
});

test("direct SOL balance response normalizes and lamports missing caveat appears", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: {
      balance_sol: 1.25,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
    routeContext: "solana",
  });

  assert.equal(result.normalized.balance_lamports, null);
  assert.equal(result.normalized.balance_sol, 1.25);
  assert.ok(result.caveat_objects.some((entry) => entry.code === "lamports_missing"));
});

test("402 payment-required only response adds caveats", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: { error: "Payment Required" },
    statusCode: 402,
    paidExecutionObserved: false,
    canonicalInput,
  });

  const codes = result.caveat_objects.map((entry) => entry.code);
  assert.ok(codes.includes("payment_required_confirmed_only"));
  assert.ok(codes.includes("paid_payload_unobserved"));
});

test("404 route not found response adds route_not_found", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: { error: "not found" },
    statusCode: 404,
    paidExecutionObserved: false,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "route_not_found"));
});

test("non-JSON response adds non_json_text_response", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: "payment challenge",
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
    routeContext: "solana",
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "non_json_text_response"));
});

test("pay_cli hidden status uses status evidence and status_code_unavailable", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: {
      lamports: 1000,
    },
    statusCode: null,
    statusEvidence: "pay_cli exit code 0 and parsed response body",
    paidExecutionObserved: true,
    canonicalInput,
    routeContext: "solana",
  });

  assert.equal(result.normalized.raw_status_code, null);
  assert.equal(result.normalized.status_evidence, "pay_cli exit code 0 and parsed response body");
  assert.ok(result.caveat_objects.some((entry) => entry.code === "status_code_unavailable"));
});

test("network inferred from route context and address not echoed add caveats", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: {
      result: {
        value: 1000000000,
      },
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
    routeContext: "https://x402.quicknode.com/solana-mainnet/",
  });

  assert.equal(result.normalized.network, "solana");
  assert.equal(result.normalized.network_match, true);
  assert.equal(result.normalized.address_match, null);
  assert.ok(result.caveat_objects.some((entry) => entry.code === "network_unconfirmed"));
  assert.ok(result.caveat_objects.some((entry) => entry.code === "address_unconfirmed"));
});

test("account not found adds account_not_found caveat", () => {
  const result = normalizeSolanaInfraAccountBalance({
    parsedJson: {
      jsonrpc: "2.0",
      result: {
        value: null,
      },
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
    routeContext: "solana",
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "account_not_found"));
});

function withLatest(result: NormalizeSolanaInfraAccountBalanceResult): NormalizeSolanaInfraAccountBalanceResult {
  return {
    normalized: result.normalized,
    caveat_objects: result.caveat_objects,
  };
}

test("evidence_health derivation", () => {
  const recordedLatest = normalizeSolanaInfraAccountBalance({
    parsedJson: {
      network: "solana",
      address: canonicalInput.address,
      lamports: 1000000000,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  const recorded = deriveSolanaInfraEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 1,
    paidFailures: 0,
    latest: withLatest(recordedLatest),
  });
  assert.equal(recorded, "recorded");

  const caveatedLatest = normalizeSolanaInfraAccountBalance({
    parsedJson: {
      lamports: 1000000000,
    },
    statusCode: null,
    paidExecutionObserved: true,
    canonicalInput,
    routeContext: "solana",
  });
  const caveated = deriveSolanaInfraEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 1,
    paidFailures: 0,
    latest: withLatest(caveatedLatest),
  });
  assert.equal(caveated, "caveated");

  const degraded = deriveSolanaInfraEvidenceHealth({
    paidAttempts: 3,
    paidSuccesses: 1,
    paidFailures: 2,
    latest: withLatest(caveatedLatest),
  });
  assert.equal(degraded, "degraded");

  const unverified = deriveSolanaInfraEvidenceHealth({
    paidAttempts: 0,
    paidSuccesses: 0,
    paidFailures: 0,
  });
  assert.equal(unverified, "unverified");

  const scaffold = deriveSolanaInfraEvidenceHealth({
    researchOnly: true,
    paidAttempts: 0,
    paidSuccesses: 0,
    paidFailures: 0,
  });
  assert.equal(scaffold, "scaffold");
});
