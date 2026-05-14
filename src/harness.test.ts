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

test("radarPreflightAndExecute preflight_only path skips execution", async () => {
  process.env.RADAR_API_BASE_URL = "https://radar.test";
  process.env.LIVE_PAYSH_EXECUTION = "true";

  let executionRequested = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://radar.test/v1/preflight") {
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
    }
    executionRequested = true;
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await radarPreflightAndExecute({
    intent: "get Solana trending pools",
    category: "finance",
    executionMode: "preflight_only",
    execution: {
      endpointUrl: "https://pay.test/execute",
      method: "GET",
    },
  });

  assert.equal(result.decision.approved, true);
  assert.equal(result.success, false);
  assert.equal(result.executionResult?.mode, "skipped");
  assert.equal(result.executionResult?.errorReason, "execution_disabled_by_input");
  assert.equal(result.skippedExecutionReason, "execution_disabled_by_input");
  assert.equal(executionRequested, false);
});

test("radarPreflightAndExecute proof disabled does not write proof", async () => {
  process.env.RADAR_API_BASE_URL = "https://radar.test";
  delete process.env.LIVE_PAYSH_EXECUTION;

  globalThis.fetch = async (input) => {
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
    proof: { enabled: false },
  });

  assert.equal(result.decision.approved, true);
  assert.equal(result.success, false);
  assert.equal(result.executionResult?.mode, "skipped");
  assert.equal(result.executionResult?.errorReason, "live_pay_sh_execution_disabled");
  assert.equal(result.skippedExecutionReason, "live_pay_sh_execution_disabled");
  assert.equal(result.proofPath, undefined);
});

test("radar unavailable falls back to local router and returns skipped when execution disabled", async () => {
  process.env.RADAR_API_BASE_URL = "https://radar.test";
  delete process.env.LIVE_PAYSH_EXECUTION;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://radar.test/v1/preflight") {
      throw new Error("network unavailable");
    }
    if (url.startsWith("https://radar.test/signals?")) {
      return new Response(
        JSON.stringify({
          signals: [
            {
              providerId: "pay-a",
              trustScore: 90,
              degradationActive: false,
              signalScore: 75,
              latencyMs: 120,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await radarPreflightAndExecute({
    intent: "get Solana trending pools",
    candidateProviders: ["pay-a"],
    execution: { endpointUrl: "https://pay.test/execute", method: "GET" },
  });

  assert.equal(result.preflightResult.available, false);
  assert.equal(result.metadata.routingSource, "local_router");
  assert.equal(result.decision.approved, true);
  assert.equal(result.executionResult?.mode, "skipped");
  assert.equal(result.skippedExecutionReason, "live_pay_sh_execution_disabled");
});

test("execution exception produces safe skipped result", async () => {
  process.env.RADAR_API_BASE_URL = "https://radar.test";
  process.env.LIVE_PAYSH_EXECUTION = "true";
  process.env.PAYSH_EXECUTION_URL = "https://pay.test/execute";

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://radar.test/v1/preflight") {
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
    }
    if (url === "https://pay.test/execute") {
      throw new Error("socket hang up");
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await radarPreflightAndExecute({
    intent: "get Solana trending pools",
    category: "finance",
    execution: { endpointUrl: "https://pay.test/execute", method: "GET" },
    maxRetries: 0,
  });

  assert.equal(result.success, false);
  assert.equal(result.executionResult?.success, false);
  assert.equal(result.executionResult?.mode, "live_pay_sh");
  assert.equal(result.executionResult?.errorReason, "socket hang up");
});

test("approved route with execution succeeds", async () => {
  process.env.RADAR_API_BASE_URL = "https://radar.test";
  process.env.LIVE_PAYSH_EXECUTION = "true";
  process.env.PAYSH_EXECUTION_URL = "https://pay.test/execute";

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://radar.test/v1/preflight") {
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
    }
    if (url === "https://pay.test/execute") {
      return new Response(JSON.stringify({ ok: true, settlementReference: "set-1", costUsd: 0.01 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await radarPreflightAndExecute({
    intent: "get Solana trending pools",
    category: "finance",
    execution: { endpointUrl: "https://pay.test/execute", method: "POST", body: { q: "x" } },
    maxRetries: 0,
  });

  assert.equal(result.decision.approved, true);
  assert.equal(result.success, true);
  assert.equal(result.executionResult?.success, true);
});

test("retries and succeeds after first failed Radar attempt", async () => {
  process.env.RADAR_API_BASE_URL = "https://radar.test";
  delete process.env.LIVE_PAYSH_EXECUTION;

  let preflightAttempts = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://radar.test/v1/preflight") {
      preflightAttempts += 1;
      if (preflightAttempts === 1) {
        throw new Error("network unavailable");
      }
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
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const result = await radarPreflightAndExecute({
    intent: "get Solana trending pools",
    category: "finance",
    execution: { endpointUrl: "https://pay.test/execute", method: "GET" },
    maxRetries: 1,
  });

  assert.equal(preflightAttempts, 2);
  assert.equal(result.preflightResult.available, true);
  assert.equal(result.decision.approved, true);
});

test("logger receives events and logger throw is swallowed", async () => {
  process.env.RADAR_API_BASE_URL = "https://radar.test";
  delete process.env.LIVE_PAYSH_EXECUTION;

  const events: string[] = [];
  const logger = (event: unknown): void => {
    const typed = event as { event?: string };
    if (typed.event) {
      events.push(typed.event);
    }
    throw new Error("logger blew up");
  };

  globalThis.fetch = async (input) => {
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
    executionMode: "preflight_only",
    proof: { enabled: false },
    logger,
  });

  assert.equal(result.decision.approved, true);
  assert.equal(events.includes("harness_started"), true);
  assert.equal(events.includes("radar_preflight_attempt"), true);
  assert.equal(events.includes("radar_preflight_success"), true);
  assert.equal(events.includes("harness_completed"), true);
});
