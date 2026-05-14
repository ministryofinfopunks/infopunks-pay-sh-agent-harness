import assert from "node:assert/strict";
import test from "node:test";
import { providerEndpointMap } from "./providerEndpointMap";
import {
  MULTI_CATEGORY_PROFILES,
  classifyOutputShapeMatch,
  classifyProviderMatch,
} from "./demoMultiCategoryBenchmark";

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
