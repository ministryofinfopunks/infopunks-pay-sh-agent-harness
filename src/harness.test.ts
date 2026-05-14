import test from "node:test";
import assert from "node:assert/strict";
import { radarPreflightAndExecute } from "./harness";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function restoreGlobals(): void {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
}

test.afterEach(() => {
  restoreGlobals();
});

test("radarPreflightAndExecute does not execute when Radar blocks", async () => {
  process.env.RADAR_API_BASE_URL = "https://radar.test";
  process.env.LIVE_PAYSH_EXECUTION = "true";
  process.env.PAYSH_EXECUTION_URL = "https://pay.test/execute";

  let executionRequested = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://radar.test/v1/preflight") {
      return new Response(
        JSON.stringify({
          decision: "route_blocked",
          blockReason: "degradation",
          selectedProvider: null,
          rejectedProviders: ["pay-a"],
          candidateCount: 1,
          routingPolicy: ["reject degradationFlagActive"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    executionRequested = true;
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await radarPreflightAndExecute({
    intent: "get Solana trending pools",
    category: "finance",
    candidateProviders: ["pay-a"],
    execution: {
      endpointUrl: "https://pay.test/execute",
      method: "GET",
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.decision.approved, false);
  assert.equal(result.decision.decision, "route_blocked");
  assert.equal(result.skippedExecutionReason, "radar_route_blocked");
  assert.equal(result.executionResult, undefined);
  assert.equal(executionRequested, false);
});

test("radarPreflightAndExecute returns skipped execution when live execution is disabled", async () => {
  process.env.RADAR_API_BASE_URL = "https://radar.test";
  delete process.env.LIVE_PAYSH_EXECUTION;

  let fetchCount = 0;
  globalThis.fetch = async (input) => {
    fetchCount += 1;
    const url = String(input);
    assert.equal(url, "https://radar.test/v1/preflight");
    return new Response(
      JSON.stringify({
        decision: "route_approved",
        selectedProvider: "pay-a",
        selectedProviderDetails: {
          providerId: "pay-a",
          name: "Pay A",
          category: "finance",
          trustScore: 90,
          signalScore: 80,
          latencyMs: 100,
          degradationFlag: false,
        },
        rejectedProviders: [],
        candidateCount: 1,
        routingPolicy: ["reject trustScore < 70"],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await radarPreflightAndExecute({
    intent: "get Solana trending pools",
    category: "finance",
    execution: {
      endpointUrl: "https://pay.test/execute",
      method: "GET",
    },
  });

  assert.equal(result.decision.approved, true);
  assert.equal(result.success, false);
  assert.equal(result.executionResult?.mode, "skipped");
  assert.equal(result.executionResult?.errorReason, "live_pay_sh_execution_disabled");
  assert.equal(result.skippedExecutionReason, "live_pay_sh_execution_disabled");
  assert.equal(fetchCount, 1);
});
