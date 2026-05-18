import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  classifyTokenMetadataCandidate,
  maybeWriteTokenMetadataCandidateMappings,
  renderTokenMetadataResearchReport,
} from "./tokenMetadataProviderResearch";

test("token metadata field detection identifies clean candidate", () => {
  const classification = classifyTokenMetadataCandidate({
    summaryText: "Token metadata endpoint with symbol name decimals and image",
    endpointPath: "api/alchemy/token/token-metadata",
    endpointDescription: "Get metadata for a token contract",
  });
  assert.equal(classification, "clean_candidate_possible");
});

test("price-only route is not classified as clean metadata", () => {
  const classification = classifyTokenMetadataCandidate({
    summaryText: "Get token prices and market data",
    endpointPath: "api/coingecko/price",
    endpointDescription: "Token price by id",
  });
  assert.equal(classification, "price_only");
});

test("search-only route is not clean unless metadata fields are present", () => {
  const searchOnly = classifyTokenMetadataCandidate({
    summaryText: "Search for pools and tokens",
    endpointPath: "x402/onchain/search/pools",
    endpointDescription: "Search pools & tokens",
  });
  assert.equal(searchOnly, "search_only");

  const searchWithMetadata = classifyTokenMetadataCandidate({
    summaryText: "Search tokens and return token metadata name symbol decimals",
    endpointPath: "api/tokens/search",
    endpointDescription: "Token metadata search",
  });
  assert.equal(searchWithMetadata, "clean_candidate_possible");
});

test("lookup-by-address can be metadata candidate when metadata fields are expected", () => {
  const classification = classifyTokenMetadataCandidate({
    summaryText: "Token data by token address with symbol name decimals",
    endpointPath: "x402/onchain/networks/{network}/tokens/{address}",
    endpointDescription: "Token Data by Token Address",
  });
  assert.equal(classification, "clean_candidate_possible");
});

test("report includes no benchmark-ready or winner claims and redacts secrets", () => {
  const markdown = renderTokenMetadataResearchReport(
    [
      {
        provider_id: "paysponge/coingecko",
        provider_name: "CoinGecko Onchain DEX API",
        category: "finance",
        service_url: "https://pro-api.coingecko.com/api/v3/x402/onchain",
        catalog_description_use_cases: "Token metadata lookup",
        candidate_endpoint: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/{network}/tokens/{address}",
        method: "GET",
        request_shape: "{\"network\":\"solana\",\"token_address\":\"So11111111111111111111111111111111111111112\"}",
        why_token_metadata_candidate: "Contains symbol, name, address, network, decimals fields.",
        uncertainty_missing_information: "Authorization: Bearer abc.def",
        classification: "clean_candidate_possible",
        docs_url: "https://docs.example/openapi.json",
        canonical_input_candidate:
          "{\"symbol\":\"SOL\",\"network\":\"solana\",\"token_address\":\"So11111111111111111111111111111111111111112\"}",
        rejected_endpoint_notes: [],
      },
    ],
    new Date("2026-05-18T00:00:00.000Z"),
  );

  assert.match(markdown, /No benchmark readiness claim\./);
  assert.match(markdown, /No winner claim\./);
  assert.match(markdown, /No paid execution performed by this research task\./);
  assert.doesNotMatch(markdown, /benchmark[-_ ]ready\s*[:=]\s*true/i);
  assert.doesNotMatch(markdown, /winner_claimed:\s*true/i);
  assert.doesNotMatch(markdown, /abc\.def/i);
  assert.match(markdown, /\[REDACTED\]/);
});

test("if no valid candidate exists, no fake mapping is added", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "token-metadata-research-"));
  const mappingsDir = path.join(tempRoot, "src", "mappings");
  await writeFile(path.join(tempRoot, "live-proofs-placeholder.md"), "placeholder\n", "utf8");
  await rm(mappingsDir, { recursive: true, force: true });

  try {
    const mappingPaths = await maybeWriteTokenMetadataCandidateMappings({
      rows: [
        {
          provider_id: "example/provider",
          provider_name: "Example",
          category: "finance",
          service_url: "https://example.dev",
          catalog_description_use_cases: "Price endpoint only",
          candidate_endpoint: null,
          method: null,
          request_shape: null,
          why_token_metadata_candidate: "Not token metadata",
          uncertainty_missing_information: "N/A",
          classification: "price_only",
          docs_url: null,
          canonical_input_candidate: null,
          rejected_endpoint_notes: [],
        },
      ],
      reportPath: path.join(tempRoot, "live-proofs-placeholder.md"),
      baseDir: tempRoot,
    });

    assert.equal(mappingPaths.length, 0);
    await assert.rejects(async () => access(path.join(tempRoot, "src", "mappings", "exampleProviderTokenMetadataCandidate.ts")));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
