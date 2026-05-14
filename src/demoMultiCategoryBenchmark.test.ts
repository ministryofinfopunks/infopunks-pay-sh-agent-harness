import assert from "node:assert/strict";
import test from "node:test";
import { providerEndpointMap } from "./providerEndpointMap";
import {
  MULTI_CATEGORY_PROFILES,
  buildSummary,
  classifyOutputShapeMatch,
  classifyProviderMatch,
  getSelectedProfiles,
  resolveRoutingMode,
  selectLocalVerifiedMapping,
  type MultiCategoryProfileResult,
} from "./demoMultiCategoryBenchmark";

test("default routing mode is local_verified_router", () => {
  const mode = resolveRoutingMode(["node", "script.ts"], {} as NodeJS.ProcessEnv);
  assert.equal(mode, "local_verified_router");
});

test("profiles only target verified_pay_cli_success mappings", () => {
  for (const profile of MULTI_CATEGORY_PROFILES) {
    const matches = providerEndpointMap.filter(
      (mapping) =>
        mapping.status === "verified_pay_cli_success" &&
        mapping.category === profile.category &&
        mapping.outputShape === profile.expectedOutputShape,
    );
    assert.ok(matches.length > 0, `missing verified mapping for profile=${profile.profile}`);
  }
});

test("local mode selector only uses verified_pay_cli_success mappings", () => {
  for (const profile of MULTI_CATEGORY_PROFILES.filter((entry) => entry.includeByDefault)) {
    const mapping = selectLocalVerifiedMapping(profile);
    assert.ok(mapping, `expected local mapping for profile=${profile.profile}`);
    assert.equal(mapping?.status, "verified_pay_cli_success");
  }
});

test("stableenrich is excluded from multi-category profiles", () => {
  const hasStableEnrich = MULTI_CATEGORY_PROFILES.some((profile) =>
    profile.expectedProvider.toLowerCase().includes("stableenrich"),
  );
  assert.equal(hasStableEnrich, false);
});

test("classifyProviderMatch handles slash and hyphen provider ids", () => {
  assert.equal(
    classifyProviderMatch("solana-foundation/google/places", "solana-foundation-google-places"),
    true,
  );
  assert.equal(classifyProviderMatch("paysponge/perplexity", "paysponge/perplexity"), true);
  assert.equal(classifyProviderMatch("quicknode-rpc", "paysponge-coingecko"), false);
  assert.equal(classifyProviderMatch("quicknode-rpc", null), false);
});

test("classifyOutputShapeMatch enforces exact shape name", () => {
  assert.equal(classifyOutputShapeMatch("trending_pools", "trending_pools"), true);
  assert.equal(classifyOutputShapeMatch("json_rpc_health", "JSON_RPC_HEALTH"), true);
  assert.equal(classifyOutputShapeMatch("places_search", "research_answer"), false);
  assert.equal(classifyOutputShapeMatch("image_labels", null), false);
});

test("live no_candidates is counted separately", () => {
  const result: MultiCategoryProfileResult = {
    profile: "research_answer",
    intent: "research latest Solana agent payments",
    category: "ai_ml",
    expectedProvider: "paysponge/perplexity",
    selectedProvider: null,
    providerMatched: false,
    expectedOutputShape: "research_answer",
    actualOutputShape: null,
    outputShapeMatched: false,
    executionSuccess: false,
    parsedJsonAvailable: false,
    applicationSuccess: false,
    latencyMs: null,
    errorReason: "no_candidates",
    notes: "Live Radar returned no provider candidate for this profile.",
    routingMode: "live_radar",
    selectionSource: "live_radar",
  };
  const summary = buildSummary([result], "live_radar");
  assert.equal(summary.liveRadarNoCandidatesCount, 1);
  assert.equal(summary.liveRadarUnavailableCount, 0);
});

test("live timeout/unavailable is counted separately", () => {
  const result: MultiCategoryProfileResult = {
    profile: "solana_rpc_health",
    intent: "check Solana RPC health",
    category: "compute",
    expectedProvider: "quicknode-rpc",
    selectedProvider: null,
    providerMatched: false,
    expectedOutputShape: "json_rpc_health",
    actualOutputShape: null,
    outputShapeMatched: false,
    executionSuccess: false,
    parsedJsonAvailable: false,
    applicationSuccess: false,
    latencyMs: null,
    errorReason: "radar_preflight_unavailable",
    notes: "Radar preflight unavailable (timeout=30000ms): The operation was aborted due to timeout.",
    routingMode: "live_radar",
    selectionSource: "live_radar",
  };
  const summary = buildSummary([result], "live_radar");
  assert.equal(summary.liveRadarUnavailableCount, 1);
  assert.equal(summary.liveRadarNoCandidatesCount, 0);
});

test("--profile filters to one profile", () => {
  const selected = getSelectedProfiles(["node", "script.ts", "--profile=solana_rpc_health"], {} as NodeJS.ProcessEnv);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].profile, "solana_rpc_health");
});
