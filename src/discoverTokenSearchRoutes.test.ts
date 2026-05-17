import test from "node:test";
import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import {
  classifyCandidateRoute,
  discoverTokenSearchRoutes,
  renderDiscoveryReport,
} from "./discoverTokenSearchRoutes";

test("address lookup route is not classified as clean_candidate", () => {
  const result = classifyCandidateRoute({
    endpoint_url:
      "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112",
    request_shape: { token_address: "So11111111111111111111111111111111111111112" },
  });

  assert.notEqual(result.classification, "clean_candidate");
  assert.ok(result.classification === "search_adjacent" || result.classification === "lookup_only");
});

test("query-based search route is classified as clean_candidate", () => {
  const result = classifyCandidateRoute({
    endpoint_url: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
    request_shape: { query: "SOL" },
  });

  assert.equal(result.classification, "clean_candidate");
});

test("discovery report contains no obvious secrets", () => {
  const markdown = renderDiscoveryReport(
    [
      {
        provider_id: "paysponge-coingecko",
        provider_name: "CoinGecko Onchain DEX API",
        endpoint_url: "https://example.com/search/pools?query=SOL",
        method: "GET",
        request_shape: { query: "SOL" },
        status_code: 402,
        payment_required_challenge_appears: true,
        content_type: "application/json",
        safe_response_summary: "authorization: bearer abc.def api_key=123",
        classification: "clean_candidate",
        reason: "query route",
      },
    ],
    new Date("2026-05-17T00:00:00.000Z"),
  );

  assert.doesNotMatch(markdown, /abc\.def/i);
  assert.doesNotMatch(markdown, /api_key=123/i);
});

test("discovery report has no benchmark-ready or winner claim", () => {
  const markdown = renderDiscoveryReport([], new Date("2026-05-17T00:00:00.000Z"));
  assert.match(markdown, /No benchmark readiness claim\./);
  assert.match(markdown, /No winner claim\./);
  assert.doesNotMatch(markdown, /benchmark[-_ ]ready\s*[:=]\s*true/i);
  assert.doesNotMatch(markdown, /winner\s*[:=]\s*/i);
});

test("if no clean second candidate exists, no mapping file is added", async () => {
  const mappingPath = path.resolve(process.cwd(), "src/mappings/paysponge-coingeckoTokenSearchCandidate.ts");
  await rm(mappingPath, { force: true });

  const discovery = await discoverTokenSearchRoutes(new Date("2026-05-17T00:00:00.000Z"));
  const hasNonBaselineClean = discovery.cleanSecondCandidates.length > 0;

  if (!hasNonBaselineClean) {
    assert.equal(discovery.mappingPath, null);
    await assert.rejects(async () => access(mappingPath));
  }
});
