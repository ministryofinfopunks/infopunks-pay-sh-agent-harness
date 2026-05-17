import test from "node:test";
import assert from "node:assert/strict";
import { access, rm } from "node:fs/promises";
import path from "node:path";
import {
  classifyCandidateRoute,
  discoverTokenSearchRoutes,
  renderDiscoveryReport,
} from "./discoverTokenSearchRoutes";

test("address lookup route is classified as search_adjacent, not clean candidate", () => {
  const result = classifyCandidateRoute({
    endpoint_url:
      "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112",
    request_shape: { token_address: "So11111111111111111111111111111111111111112" },
  });

  assert.equal(result.classification, "search_adjacent");
});

test("query-based search route with SOL accepted is classified as clean_candidate_sol", () => {
  const result = classifyCandidateRoute({
    endpoint_url: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
    request_shape: { query: "SOL" },
    query_outcomes: [
      {
        query_term: "SOL",
        status_code: 402,
        outcome: "payment_required",
        payment_required_challenge_appears: true,
        content_type: "application/json",
        safe_response_summary: "payment required",
      },
      {
        query_term: "ETH",
        status_code: 402,
        outcome: "payment_required",
        payment_required_challenge_appears: true,
        content_type: "application/json",
        safe_response_summary: "payment required",
      },
      {
        query_term: "BTC",
        status_code: 402,
        outcome: "payment_required",
        payment_required_challenge_appears: true,
        content_type: "application/json",
        safe_response_summary: "payment required",
      },
    ],
  });

  assert.equal(result.classification, "clean_candidate_sol");
});

test("ETH/BTC accepted but SOL rejected is clean_candidate_general", () => {
  const result = classifyCandidateRoute({
    endpoint_url: "https://example.com/search/pools?query=SOL",
    request_shape: { query: "SOL" },
    query_outcomes: [
      {
        query_term: "SOL",
        status_code: 404,
        outcome: "not_found",
        payment_required_challenge_appears: false,
        content_type: "application/json",
        safe_response_summary: "not found",
      },
      {
        query_term: "ETH",
        status_code: 200,
        outcome: "success",
        payment_required_challenge_appears: false,
        content_type: "application/json",
        safe_response_summary: "ok",
      },
      {
        query_term: "BTC",
        status_code: 402,
        outcome: "payment_required",
        payment_required_challenge_appears: true,
        content_type: "application/json",
        safe_response_summary: "payment required",
      },
    ],
  });

  assert.equal(result.classification, "clean_candidate_general");
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
        query_outcomes: [
          {
            query_term: "SOL",
            status_code: 402,
            outcome: "payment_required",
            payment_required_challenge_appears: true,
            content_type: "application/json",
            safe_response_summary: "authorization: bearer abc.def api_key=123",
          },
          {
            query_term: "ETH",
            status_code: 404,
            outcome: "not_found",
            payment_required_challenge_appears: false,
            content_type: "application/json",
            safe_response_summary: "not found",
          },
          {
            query_term: "BTC",
            status_code: 401,
            outcome: "auth_required",
            payment_required_challenge_appears: false,
            content_type: "application/json",
            safe_response_summary: "auth",
          },
        ],
        classification: "clean_candidate_sol",
        reason: "query route",
      },
    ],
    new Date("2026-05-17T00:00:00.000Z"),
  );

  assert.doesNotMatch(markdown, /abc\.def/i);
  assert.doesNotMatch(markdown, /api_key=123/i);
});

test("discovery report records SOL ETH BTC outcomes and no winner/readiness claim", () => {
  const markdown = renderDiscoveryReport([], new Date("2026-05-17T00:00:00.000Z"));
  assert.match(markdown, /Tested query terms: SOL, ETH, BTC\./);
  assert.match(markdown, /No benchmark readiness claim\./);
  assert.match(markdown, /No winner claim\./);
  assert.match(markdown, /No paid execution run by this discovery unless explicitly enabled elsewhere\./);
  assert.doesNotMatch(markdown, /benchmark[-_ ]ready\s*[:=]\s*true/i);
  assert.doesNotMatch(markdown, /winner_claimed:\s*true/i);
});

test("if no clean SOL second candidate exists, no mapping file is added", async () => {
  const mappingPath = path.resolve(process.cwd(), "src/mappings/paysponge-coingeckoTokenSearchCandidate.ts");
  await rm(mappingPath, { force: true });

  const discovery = await discoverTokenSearchRoutes(new Date("2026-05-17T00:00:00.000Z"));
  const hasNonBaselineClean = discovery.cleanSecondCandidates.length > 0;

  if (!hasNonBaselineClean) {
    assert.equal(discovery.mappingPath, null);
    await assert.rejects(async () => access(mappingPath));
  }
});
