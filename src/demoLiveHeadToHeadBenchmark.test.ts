import assert from "node:assert/strict";
import test from "node:test";
import { classifyRadarBlockedOutcome } from "./demoLiveHeadToHeadBenchmark";
import type { RadarPreflightResult } from "./radarClient";

test("classifies explicit Radar policy block as radar_policy_blocked", () => {
  const preflight: RadarPreflightResult = {
    available: true,
    mode: "live",
    decision: {
      decision: "route_blocked",
      selectedProvider: null,
      blockReason: "No provider meets trust/latency constraints.",
      rejectedProviders: [],
      requiredCapabilities: [],
      candidateCount: 0,
      routingPolicy: [],
      dataMode: "live",
    },
  };

  const outcome = classifyRadarBlockedOutcome(preflight, preflight.decision?.blockReason ?? null);
  assert.equal(outcome, "radar_policy_blocked");
});

test("classifies preflight timeout/unavailable as radar_preflight_unavailable", () => {
  const preflight: RadarPreflightResult = {
    available: false,
    mode: "fallback",
    fallbackReason: "Radar preflight unavailable (timeout=15000ms): The operation was aborted due to timeout.",
  };

  const outcome = classifyRadarBlockedOutcome(preflight, preflight.fallbackReason ?? null);
  assert.equal(outcome, "radar_preflight_unavailable");
});
