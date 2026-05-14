import assert from "node:assert/strict";
import test from "node:test";
import { classifyTrialOutcome, getSelectedDiagnosticProfiles, percentile } from "./demoRadarPreflightDiagnostics";
import type { RadarPreflightResult } from "./radarClient";

function makeAvailablePreflight(overrides: Partial<RadarPreflightResult>): RadarPreflightResult {
  return {
    available: true,
    mode: "live",
    decision: {
      decision: "route_approved",
      selectedProvider: "quicknode-rpc",
      rejectedProviders: [],
      candidateCount: 1,
      routingPolicy: [],
      ...((overrides.decision ?? {}) as object),
    },
    ...overrides,
  };
}

test("timeout classification", () => {
  const preflight: RadarPreflightResult = {
    available: false,
    mode: "fallback",
    fallbackReason: "Radar preflight unavailable (timeout=30000ms): The operation was aborted due to timeout.",
  };
  const result = classifyTrialOutcome(preflight, "quicknode-rpc");
  assert.equal(result.outcome, "radar_preflight_unavailable");
  assert.equal(result.errorReason, "radar_preflight_unavailable");
});

test("no_candidates classification", () => {
  const preflight = makeAvailablePreflight({
    decision: {
      decision: "route_blocked",
      selectedProvider: null,
      blockReason: "no_candidates",
      rejectedProviders: [],
      candidateCount: 0,
      routingPolicy: [],
    },
  });

  const result = classifyTrialOutcome(preflight, "paysponge/perplexity");
  assert.equal(result.outcome, "no_candidates");
  assert.equal(result.errorReason, "no_candidates");
});

test("wrong provider classification", () => {
  const preflight = makeAvailablePreflight({
    decision: {
      decision: "route_approved",
      selectedProvider: "paysponge-coingecko",
      rejectedProviders: [],
      candidateCount: 1,
      routingPolicy: [],
    },
  });

  const result = classifyTrialOutcome(preflight, "quicknode-rpc");
  assert.equal(result.outcome, "wrong_provider");
  assert.equal(result.errorReason, "wrong_provider");
});

test("expected provider success classification", () => {
  const preflight = makeAvailablePreflight({
    decision: {
      decision: "route_approved",
      selectedProvider: "quicknode-rpc",
      rejectedProviders: [],
      candidateCount: 1,
      routingPolicy: [],
    },
  });

  const result = classifyTrialOutcome(preflight, "quicknode-rpc");
  assert.equal(result.outcome, "expected_provider_success");
  assert.equal(result.errorReason, null);
});

test("p95 latency calculation", () => {
  const value = percentile([10, 20, 30, 40, 50], 95);
  assert.equal(value, 50);
});

test("--profile filtering", () => {
  const profiles = getSelectedDiagnosticProfiles(
    ["node", "script.ts", "--profile=solana_rpc_health"],
    {} as NodeJS.ProcessEnv,
  );
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].profile, "solana_rpc_health");
});
