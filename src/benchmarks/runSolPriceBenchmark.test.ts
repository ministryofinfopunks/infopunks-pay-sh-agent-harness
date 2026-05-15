import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBenchmarkNotes,
  extractPaySpongePrice,
  extractStableCryptoPrice,
  renderSafeMarkdown,
  type SolPriceBenchmarkArtifact,
} from "./runSolPriceBenchmark";

test("extracts StableCrypto SOL price from solana.usd", () => {
  const sample = { solana: { usd: 164.21 } };
  const result = extractStableCryptoPrice(sample);
  assert.equal(result.extractedPriceUsd, 164.21);
  assert.equal(result.extractionPath, "solana.usd");
  assert.equal(result.normalizationConfidence, "high");
});

test("extracts PaySponge SOL/USDC base_token_price_usd from matching pool", () => {
  const sample = {
    data: [
      { attributes: { name: "DAD / SOL", base_token_price_usd: "0.0010" } },
      { attributes: { name: "SOL / USDC", base_token_price_usd: "164.18" } },
    ],
  };
  const result = extractPaySpongePrice(sample);
  assert.equal(result.extractedPriceUsd, 164.18);
  assert.equal(result.extractionPath, "data[sol_usdc].attributes.base_token_price_usd");
  assert.equal(result.normalizationConfidence, "high");
});

test("returns failed confidence on missing price", () => {
  const result = extractPaySpongePrice({ data: [{ attributes: { name: "SOL / USDC" } }] });
  assert.equal(result.extractedPriceUsd, null);
  assert.equal(result.normalizationConfidence, "failed");
});

test("benchmark notes and artifact keep winner_claimed false", () => {
  const artifact: SolPriceBenchmarkArtifact = {
    benchmark_id: "finance-data-sol-price",
    intent: "get SOL price",
    generated_at: "2026-05-15T00:00:00.000Z",
    winner_claimed: false,
    routes: [
      {
        provider_id: "merit-systems-stablecrypto-market-data",
        route: "POST https://stablecrypto.dev/api/coingecko/price",
        success: true,
        status_code: 200,
        latency_ms: 1234,
        paid_execution_proven: true,
        extracted_price_usd: 164.21,
        extraction_path: "solana.usd",
        normalization_confidence: "high",
        proof_reference: "proof-a",
      },
      {
        provider_id: "paysponge-coingecko",
        route: "GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
        success: true,
        status_code: 200,
        latency_ms: 1410,
        paid_execution_proven: true,
        extracted_price_usd: 164.18,
        extraction_path: "data[0].attributes.base_token_price_usd",
        normalization_confidence: "medium",
        proof_reference: "proof-b",
      },
    ],
    notes: buildBenchmarkNotes([
      {
        provider_id: "merit-systems-stablecrypto-market-data",
        route: "a",
        success: true,
        status_code: 200,
        latency_ms: 1,
        paid_execution_proven: true,
        extracted_price_usd: 164.21,
        extraction_path: "solana.usd",
        normalization_confidence: "high",
        proof_reference: "x",
      },
      {
        provider_id: "paysponge-coingecko",
        route: "b",
        success: true,
        status_code: 200,
        latency_ms: 2,
        paid_execution_proven: true,
        extracted_price_usd: 164.18,
        extraction_path: "data[0].attributes.base_token_price_usd",
        normalization_confidence: "medium",
        proof_reference: "y",
      },
    ]),
  };

  assert.equal(artifact.winner_claimed, false);
  assert.match(artifact.notes, /No winner claimed\./);
});

test("safe markdown does not include auth header tokens", () => {
  const artifact: SolPriceBenchmarkArtifact = {
    benchmark_id: "finance-data-sol-price",
    intent: "get SOL price",
    generated_at: "2026-05-15T00:00:00.000Z",
    winner_claimed: false,
    routes: [
      {
        provider_id: "paysponge-coingecko",
        route: "GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
        success: true,
        status_code: 200,
        latency_ms: 1000,
        paid_execution_proven: true,
        extracted_price_usd: 164.18,
        extraction_path: "data[0].attributes.base_token_price_usd",
        normalization_confidence: "medium",
        proof_reference: "local-proof",
      },
    ],
    notes: "Prices are comparable but no route winner is claimed until benchmark criteria are finalized.",
  };

  const markdown = renderSafeMarkdown(artifact);
  assert.equal(markdown.toLowerCase().includes("authorization"), false);
  assert.equal(markdown.toLowerCase().includes("bearer"), false);
});
