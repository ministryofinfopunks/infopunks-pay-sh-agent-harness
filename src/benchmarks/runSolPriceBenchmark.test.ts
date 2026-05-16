import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAggregateMetrics,
  buildBenchmarkNotes,
  calculateMedianLatencyMs,
  calculateP95LatencyMs,
  calculateSuccessRate,
  extractPaySpongePrice,
  extractStableCryptoPrice,
  renderSafeMarkdown,
  type BenchmarkRouteResult,
  type SolPriceBenchmarkRun,
  type SolPriceBenchmarkArtifact,
} from "./runSolPriceBenchmark";

function makeRoute(overrides: Partial<BenchmarkRouteResult> = {}): BenchmarkRouteResult {
  return {
    run_number: 1,
    generated_at: "2026-05-15T00:00:00.000Z",
    provider_id: "merit-systems-stablecrypto-market-data",
    route: "POST https://stablecrypto.dev/api/coingecko/price",
    success: true,
    execution_transport: "pay_cli",
    cli_exit_code: 0,
    status_code: 200,
    status_evidence: "pay_cli output included HTTP status 200",
    latency_ms: 1000,
    paid_execution_proven: true,
    extracted_price_usd: 164.21,
    extraction_path: "solana.usd",
    normalization_confidence: "high",
    proof_reference: "proof-a",
    ...overrides,
  };
}

test("median latency calculation", () => {
  assert.equal(calculateMedianLatencyMs([900, 1000, 1300]), 1000);
  assert.equal(calculateMedianLatencyMs([900, 1000, 1300, 1700]), 1150);
});

test("p95 latency calculation", () => {
  assert.equal(calculateP95LatencyMs([100, 150, 200, 250, 300]), 300);
  assert.equal(calculateP95LatencyMs([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]), 109);
});

test("success rate calculation", () => {
  assert.equal(calculateSuccessRate(4, 5), 0.8);
  assert.equal(calculateSuccessRate(0, 0), 0);
});

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
  const runs: SolPriceBenchmarkRun[] = [
    {
      run_number: 1,
      generated_at: "2026-05-15T00:00:00.000Z",
      routes: [
        makeRoute(),
        makeRoute({
          provider_id: "paysponge-coingecko",
          route: "GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
          latency_ms: 1410,
          extracted_price_usd: 164.18,
          extraction_path: "data[0].attributes.base_token_price_usd",
          normalization_confidence: "medium",
          proof_reference: "proof-b",
        }),
      ],
    },
  ];

  const artifact: SolPriceBenchmarkArtifact = {
    benchmark_id: "finance-data-sol-price",
    intent: "get SOL price",
    generated_at: "2026-05-15T00:00:00.000Z",
    winner_claimed: false,
    runs,
    aggregate_metrics: buildAggregateMetrics(runs),
    notes: buildBenchmarkNotes(runs),
  };

  assert.equal(artifact.winner_claimed, false);
  assert.match(artifact.notes, /No winner claimed\./);
});

test("safe markdown does not include auth header tokens", () => {
  const runs: SolPriceBenchmarkRun[] = [
    {
      run_number: 1,
      generated_at: "2026-05-15T00:00:00.000Z",
      routes: [
        makeRoute({
          provider_id: "paysponge-coingecko",
          route: "GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
          extracted_price_usd: 164.18,
          extraction_path: "data[0].attributes.base_token_price_usd",
          normalization_confidence: "medium",
          proof_reference: "local-proof",
        }),
      ],
    },
  ];

  const artifact: SolPriceBenchmarkArtifact = {
    benchmark_id: "finance-data-sol-price",
    intent: "get SOL price",
    generated_at: "2026-05-15T00:00:00.000Z",
    winner_claimed: false,
    runs,
    aggregate_metrics: buildAggregateMetrics(runs),
    notes: buildBenchmarkNotes(runs),
  };

  const markdown = renderSafeMarkdown(artifact);
  assert.equal(markdown.toLowerCase().includes("authorization"), false);
  assert.equal(markdown.toLowerCase().includes("bearer"), false);
});

test("safe markdown includes pay_cli status evidence without fake status", () => {
  const runs: SolPriceBenchmarkRun[] = [
    {
      run_number: 1,
      generated_at: "2026-05-15T00:00:00.000Z",
      routes: [
        makeRoute({
          provider_id: "paysponge-coingecko",
          route: "GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
          status_code: null,
          status_evidence: "pay_cli exit code 0 and parsed response body",
          extracted_price_usd: 164.18,
          extraction_path: "data[0].attributes.base_token_price_usd",
          normalization_confidence: "medium",
          proof_reference: "local-proof",
        }),
      ],
    },
  ];

  const artifact: SolPriceBenchmarkArtifact = {
    benchmark_id: "finance-data-sol-price",
    intent: "get SOL price",
    generated_at: "2026-05-15T00:00:00.000Z",
    winner_claimed: false,
    runs,
    aggregate_metrics: buildAggregateMetrics(runs),
    notes: buildBenchmarkNotes(runs),
  };

  const markdown = renderSafeMarkdown(artifact);
  assert.match(markdown, /pay_cli/);
  assert.match(markdown, /pay_cli exit code 0 and parsed response body/);
  assert.match(markdown, /winner_claimed: false/);
});

test("failed route handled honestly in aggregate metrics", () => {
  const runs: SolPriceBenchmarkRun[] = [
    {
      run_number: 1,
      generated_at: "2026-05-15T00:00:00.000Z",
      routes: [makeRoute()],
    },
    {
      run_number: 2,
      generated_at: "2026-05-15T00:10:00.000Z",
      routes: [
        makeRoute({
          run_number: 2,
          success: false,
          extracted_price_usd: null,
          normalization_confidence: "failed",
          error_summary: "missing_or_invalid_solana_usd",
        }),
      ],
    },
  ];

  const metrics = buildAggregateMetrics(runs);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0]?.completed_runs, 1);
  assert.equal(metrics[0]?.failed_runs, 1);
  assert.equal(metrics[0]?.success_rate, 0.5);
});
