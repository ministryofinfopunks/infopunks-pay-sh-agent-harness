import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProviderFromMetadata,
  isFinanceDataLikeProvider,
  renderProviderResearchReport,
} from "./tokenSearchProviderResearch";

test("finance/data provider filtering works", () => {
  assert.equal(
    isFinanceDataLikeProvider({
      fqn: "merit-systems/stablecrypto/market-data",
      title: "StableCrypto",
      category: "finance",
      service_url: "https://stablecrypto.dev",
      description: "Crypto market data",
      use_case: "Coin search",
    }),
    true,
  );
  assert.equal(
    isFinanceDataLikeProvider({
      fqn: "paysponge/perplexity",
      title: "Perplexity",
      category: "ai_ml",
      service_url: "https://pplx.example",
      description: "General web research",
      use_case: "Web answers",
    }),
    false,
  );
});

test("lookup-only providers are not clean candidates", () => {
  const classified = classifyProviderFromMetadata({
    summary: {
      fqn: "example/lookup",
      title: "Lookup",
      category: "finance",
      service_url: "https://lookup.example",
      description: "Token data provider",
      use_case: "Token contract address lookup",
    },
    endpoints: [
      {
        method: "POST",
        url: "https://lookup.example/token/by-address",
        path: "token/by-address",
        description: "Get token by address",
      },
    ],
  });
  assert.equal(classified.classification, "lookup_only");
});

test("search-like metadata produces candidate or docs-review classification", () => {
  const clean = classifyProviderFromMetadata({
    summary: {
      fqn: "example/search",
      title: "Search",
      category: "finance",
      service_url: "https://search.example",
      description: "Token and pool search",
      use_case: "Coin search by query",
    },
    endpoints: [
      {
        method: "POST",
        url: "https://search.example/onchain/search",
        path: "onchain/search",
        description: "Search on-chain pools by query",
      },
    ],
  });
  assert.equal(clean.classification, "clean_candidate_possible");

  const docsReview = classifyProviderFromMetadata({
    summary: {
      fqn: "example/docs",
      title: "Docs",
      category: "data",
      service_url: "https://docs.example",
      description: "Token search provider",
      use_case: "Coin search",
    },
    endpoints: [],
  });
  assert.equal(docsReview.classification, "needs_docs_review");
});

test("report includes no benchmark-ready or winner claims and can state no confirmed second route", () => {
  const markdown = renderProviderResearchReport(
    [
      {
        provider_id: "paysponge/coingecko",
        provider_name: "CoinGecko Onchain DEX API",
        category: "finance",
        service_url: "https://pro-api.coingecko.com/api/v3/x402/onchain",
        catalog_description_use_cases: "Search across GeckoTerminal market data.",
        token_search_suggested_by_metadata: true,
        candidate_endpoint: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
        docs_url: "https://pro-api.coingecko.com/api/v3/x402/onchain/openapi.json",
        classification: "clean_candidate_possible",
      },
    ],
    new Date("2026-05-17T00:00:00.000Z"),
  );
  assert.match(markdown, /No benchmark readiness claim\./);
  assert.match(markdown, /No winner claim\./);
  assert.match(markdown, /No confirmed second query-based token-search route found from provider metadata\./);
  assert.doesNotMatch(markdown, /benchmark[-_ ]ready\s*[:=]\s*true/i);
  assert.doesNotMatch(markdown, /winner_claimed:\s*true/i);
});
