import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTokenMetadataSemantics, renderProofMarkdown, sanitizeProofMarkdown } from "./verifyTokenMetadataCandidates";

const canonical = {
  network: "solana",
  address: "So11111111111111111111111111111111111111112",
  symbol: "SOL",
};

function headers(input: Record<string, string> = {}): Headers {
  return new Headers(input);
}

test("402 challenge on metadata-shaped endpoint can promote to verified/unproven", () => {
  const result = evaluateTokenMetadataSemantics({
    statusCode: 402,
    contentType: "application/json",
    headers: headers({ "x-payment": "required" }),
    bodyText: JSON.stringify({
      resource: { method: "GET", url: "/onchain/tokens/solana/address" },
      intent: "token metadata",
      token: { symbol: "SOL", name: "Wrapped SOL", address: canonical.address, network: "solana" },
    }),
    parsedJson: {
      token: { symbol: "SOL", name: "Wrapped SOL", address: canonical.address, network: "solana", decimals: 9 },
      metadata: { attributes: { coingecko_id: "wrapped-solana" } },
    },
    canonical,
  });

  assert.equal(result.classification, "verified_semantics");
  assert.equal(result.token_metadata_semantics_detected, true);
});

test("404 keeps candidate/unproven", () => {
  const result = evaluateTokenMetadataSemantics({
    statusCode: 404,
    contentType: "application/json",
    headers: headers(),
    bodyText: "{}",
    parsedJson: {},
    canonical,
  });

  assert.equal(result.classification, "candidate_unverified");
});

test("price-only response is rejected as token metadata", () => {
  const result = evaluateTokenMetadataSemantics({
    statusCode: 200,
    contentType: "application/json",
    headers: headers(),
    bodyText: JSON.stringify({ solana: { usd: 123.4 } }),
    parsedJson: { solana: { usd: 123.4, price: 123.4 } },
    canonical,
  });

  assert.equal(result.classification, "rejected");
  assert.equal(result.response_shape_classified, "price_only");
});

test("pool-only response is rejected unless metadata fields are present", () => {
  const rejected = evaluateTokenMetadataSemantics({
    statusCode: 200,
    contentType: "application/json",
    headers: headers(),
    bodyText: JSON.stringify({ data: [{ type: "pool", attributes: { liquidity: "1", base_token_price_usd: "1" } }] }),
    parsedJson: { data: [{ type: "pool", attributes: { liquidity: "1", base_token_price_usd: "1" } }] },
    canonical,
  });

  assert.equal(rejected.classification, "rejected");

  const accepted = evaluateTokenMetadataSemantics({
    statusCode: 200,
    contentType: "application/json",
    headers: headers(),
    bodyText: JSON.stringify({ data: [{ symbol: "SOL", name: "Wrapped SOL", mint: canonical.address, network: "solana", decimals: 9, attributes: { logo: "x" } }] }),
    parsedJson: { data: [{ symbol: "SOL", name: "Wrapped SOL", mint: canonical.address, network: "solana", decimals: 9, attributes: { logo: "x" } }] },
    canonical,
  });

  assert.notEqual(accepted.classification, "rejected");
});

test("metadata field detection recognizes symbol/name/address/network/decimals/attributes", () => {
  const result = evaluateTokenMetadataSemantics({
    statusCode: 200,
    contentType: "application/json",
    headers: headers(),
    bodyText: JSON.stringify({
      symbol: "SOL",
      name: "Wrapped SOL",
      mint: canonical.address,
      network: "solana",
      decimals: 9,
      attributes: { website: "https://example.test" },
    }),
    parsedJson: {
      symbol: "SOL",
      name: "Wrapped SOL",
      mint: canonical.address,
      network: "solana",
      decimals: 9,
      attributes: { website: "https://example.test" },
    },
    canonical,
  });

  assert.equal(result.metadata_fields_detected.symbol, true);
  assert.equal(result.metadata_fields_detected.name, true);
  assert.equal(result.metadata_fields_detected.token_address, true);
  assert.equal(result.metadata_fields_detected.network, true);
  assert.equal(result.metadata_fields_detected.decimals, true);
  assert.equal(result.metadata_fields_detected.attributes, true);
});

test("proof output keeps paid_execution_attempted false and no proven/benchmark/winner claims", () => {
  const markdown = renderProofMarkdown(
    [
      {
        provider_id: "paysponge-coingecko",
        provider_name: "PaySponge CoinGecko",
        method: "GET",
        endpoint: "https://example.test/metadata",
        request_shape: canonical,
        status_code: 402,
        content_type: "application/json",
        payment_required_challenge_appears: true,
        paid_execution_attempted: false,
        response_shape_classified: "payment_challenge",
        metadata_fields_detected: {
          symbol: true,
          name: true,
          token_address: true,
          network: true,
          decimals: true,
          attributes: true,
          image_or_description: false,
        },
        token_metadata_semantics_detected: true,
        classification: "verified_semantics",
        reason: "ok",
      },
    ],
    "live-proofs/token-metadata-verified-unproven-2026-05-18.md",
  );

  assert.match(markdown, /paid_execution_attempted: false/);
  assert.match(markdown, /No benchmark-ready claim\./);
  assert.match(markdown, /No winner claim\./);
  assert.doesNotMatch(markdown, /execution_evidence_status:\s*proven/i);
  assert.doesNotMatch(markdown, /winner_claimed:\s*true/i);
  assert.doesNotMatch(markdown, /benchmark[-_ ]ready:\s*true/i);
});

test("proof sanitizer removes secrets/auth/wallet/private data", () => {
  const unsafe = "authorization: Bearer abc\napi_key: z\nwallet: 0x123\nprivate_key: 42\nseed: words";
  const safe = sanitizeProofMarkdown(unsafe);
  assert.doesNotMatch(safe, /Bearer abc/);
  assert.doesNotMatch(safe, /api_key: z/);
  assert.doesNotMatch(safe, /wallet: 0x123/);
  assert.doesNotMatch(safe, /private_key: 42/);
  assert.doesNotMatch(safe, /seed: words/);
  assert.match(safe, /\[REDACTED\]/);
});
