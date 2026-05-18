import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalNetworkMatch,
  normalizeTokenMetadataWithRouteContext,
  resolveTokenMetadataNetwork,
} from "./tokenMetadataNormalization";

const CANONICAL_ADDRESS = "So11111111111111111111111111111111111111112";

test("PaySponge route context resolves network=solana when payload lacks network", () => {
  const normalized = normalizeTokenMetadataWithRouteContext({
    address: CANONICAL_ADDRESS,
    network: null,
    decimals: 9,
    image_url: "https://assets.example/sol.png",
    source_id: "wrapped-solana",
    routePath: "/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112",
  });

  assert.equal(normalized.network, "solana");
  assert.equal(normalized.network_source, "route_context");
  assert.equal(normalized.caveat, "route_context_inferred_network");
});

test("canonical_network_match is true when canonical and route-context network are solana", () => {
  const resolved = resolveTokenMetadataNetwork({
    payloadNetwork: null,
    routePath: "/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112",
  });

  assert.equal(canonicalNetworkMatch({ canonicalNetwork: "solana", normalizedNetwork: resolved.network }), true);
});

test("payload network takes precedence over route context", () => {
  const resolved = resolveTokenMetadataNetwork({
    payloadNetwork: "ethereum",
    routePath: "/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112",
  });

  assert.equal(resolved.network, "ethereum");
  assert.equal(resolved.network_source, "payload");
  assert.equal(resolved.caveat, null);
});

test("missing payload network and route context returns null/missing", () => {
  const resolved = resolveTokenMetadataNetwork({
    payloadNetwork: null,
    routePath: "/x402/onchain/tokens/So11111111111111111111111111111111111111112",
  });

  assert.equal(resolved.network, null);
  assert.equal(resolved.network_source, "missing");
  assert.equal(resolved.caveat, null);
});

test("address/decimals/image_url/source_id fields are preserved", () => {
  const normalized = normalizeTokenMetadataWithRouteContext({
    address: CANONICAL_ADDRESS,
    network: null,
    decimals: 9,
    image_url: "https://assets.example/sol.png",
    source_id: "wrapped-solana",
    routePath: "/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112",
  });

  assert.equal(normalized.address, CANONICAL_ADDRESS);
  assert.equal(normalized.decimals, 9);
  assert.equal(normalized.image_url, "https://assets.example/sol.png");
  assert.equal(normalized.source_id, "wrapped-solana");
});
