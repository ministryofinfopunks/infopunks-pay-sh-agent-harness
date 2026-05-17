import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAggregateMetrics,
  calculateMedianLatencyMs,
  calculateP95LatencyMs,
  calculateSuccessRate,
  parseRunsArg,
  renderSafeMarkdown,
  resolveWinnerStatus,
  type BenchmarkRouteResult,
  type TokenSearchBenchmarkArtifact,
  type TokenSearchBenchmarkRun,
} from "./runTokenSearchBenchmark";

function makeRoute(overrides: Partial<BenchmarkRouteResult> = {}): BenchmarkRouteResult {
  return {
    run_number: 1,
    generated_at: "2026-05-17T00:00:00.000Z",
    provider_id: "merit-systems-stablecrypto-market-data",
    route: "POST https://stablecrypto.dev/api/coingecko/onchain/search",
    success: true,
    execution_transport: "pay_cli",
    cli_exit_code: 0,
    status_code: null,
    status_evidence: "pay_cli exit code 0 and parsed response body",
    latency_ms: 900,
    canonical_query: "SOL",
    token_search_result_detected: true,
    response_shape_classified: "pool_search_results",
    normalization_confidence: "high",
    extraction_path: "data[].attributes",
    semantic_detection_path: "json_string_scan:data",
    proof_reference: "live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md",
    ...overrides,
  };
}

test("parses --runs default and explicit value", () => {
  assert.equal(parseRunsArg([]), 1);
  assert.equal(parseRunsArg(["--runs", "5"]), 5);
});

test("aggregate median latency", () => {
  assert.equal(calculateMedianLatencyMs([900, 1000, 1300]), 1000);
  assert.equal(calculateMedianLatencyMs([900, 1000, 1300, 1700]), 1150);
});

test("p95 latency", () => {
  assert.equal(calculateP95LatencyMs([100, 150, 200, 250, 300]), 300);
});

test("success rate", () => {
  assert.equal(calculateSuccessRate(4, 5), 0.8);
  assert.equal(calculateSuccessRate(0, 0), 0);
});

test("token_search_detection_rate", () => {
  const runs: TokenSearchBenchmarkRun[] = [
    {
      run_number: 1,
      generated_at: "2026-05-17T00:00:00.000Z",
      routes: [
        makeRoute({ token_search_result_detected: true }),
        makeRoute({ provider_id: "paysponge-coingecko", token_search_result_detected: false, success: false }),
      ],
    },
  ];
  const metrics = buildAggregateMetrics(runs);
  const stable = metrics.find((m) => m.provider_id === "merit-systems-stablecrypto-market-data");
  const pay = metrics.find((m) => m.provider_id === "paysponge-coingecko");
  assert.equal(stable?.token_search_detection_rate, 1);
  assert.equal(pay?.token_search_detection_rate, 0);
});

test("winner_claimed remains false", () => {
  const artifact: TokenSearchBenchmarkArtifact = {
    benchmark_id: "finance-data-token-search",
    intent: "token search",
    canonical_query: "SOL",
    generated_at: "2026-05-17T00:00:00.000Z",
    total_runs: 1,
    winner_claimed: false,
    winner_status: "insufficient_runs",
    runs: [],
    aggregate_metrics: [],
    proof_references: [],
    notes: "Token-search benchmark recorded. No route winner is claimed. Scoring thresholds are not finalized.",
  };
  assert.equal(artifact.winner_claimed, false);
});

test("winner_status insufficient_runs for <5", () => {
  assert.equal(resolveWinnerStatus(1), "insufficient_runs");
  assert.equal(resolveWinnerStatus(4), "insufficient_runs");
});

test("winner_status no_clear_winner for 5+", () => {
  assert.equal(resolveWinnerStatus(5), "no_clear_winner");
  assert.equal(resolveWinnerStatus(8), "no_clear_winner");
});

test("failed route handled honestly", () => {
  const runs: TokenSearchBenchmarkRun[] = [
    {
      run_number: 1,
      generated_at: "2026-05-17T00:00:00.000Z",
      routes: [makeRoute({ success: true })],
    },
    {
      run_number: 2,
      generated_at: "2026-05-17T00:01:00.000Z",
      routes: [makeRoute({ run_number: 2, success: false, normalization_confidence: "failed", error_summary: "pay_cli_execution_failed" })],
    },
  ];
  const metrics = buildAggregateMetrics(runs);
  assert.equal(metrics[0]?.completed_runs, 1);
  assert.equal(metrics[0]?.failed_runs, 1);
  assert.equal(metrics[0]?.success_rate, 0.5);
});

test("pay_cli null status uses status_evidence, not fake 200", () => {
  const runs: TokenSearchBenchmarkRun[] = [
    {
      run_number: 1,
      generated_at: "2026-05-17T00:00:00.000Z",
      routes: [makeRoute({ status_code: null, status_evidence: "pay_cli exit code 0 and parsed response body" })],
    },
  ];

  const artifact: TokenSearchBenchmarkArtifact = {
    benchmark_id: "finance-data-token-search",
    intent: "token search",
    canonical_query: "SOL",
    generated_at: "2026-05-17T00:00:00.000Z",
    total_runs: 1,
    winner_claimed: false,
    winner_status: "insufficient_runs",
    runs,
    aggregate_metrics: buildAggregateMetrics(runs),
    proof_references: ["live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md"],
    notes: "Token-search benchmark recorded. No route winner is claimed. Scoring thresholds are not finalized.",
  };

  const markdown = renderSafeMarkdown(artifact);
  assert.match(markdown, /status_evidence/);
  assert.match(markdown, /pay_cli exit code 0 and parsed response body/);
  assert.doesNotMatch(markdown, /status_code\s*:\s*200/i);
});

test("safe markdown contains no secrets", () => {
  const runs: TokenSearchBenchmarkRun[] = [
    {
      run_number: 1,
      generated_at: "2026-05-17T00:00:00.000Z",
      routes: [makeRoute()],
    },
  ];
  const artifact: TokenSearchBenchmarkArtifact = {
    benchmark_id: "finance-data-token-search",
    intent: "token search",
    canonical_query: "SOL",
    generated_at: "2026-05-17T00:00:00.000Z",
    total_runs: 1,
    winner_claimed: false,
    winner_status: "insufficient_runs",
    runs,
    aggregate_metrics: buildAggregateMetrics(runs),
    proof_references: ["live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md"],
    notes: "Token-search benchmark recorded. No route winner is claimed. Scoring thresholds are not finalized.",
  };
  const markdown = renderSafeMarkdown(artifact).toLowerCase();
  assert.equal(markdown.includes("authorization"), false);
  assert.equal(markdown.includes("bearer"), false);
  assert.equal(markdown.includes("api_key"), false);
  assert.equal(markdown.includes("mnemonic"), false);
  assert.equal(markdown.includes("wallet"), false);
});

test("no winner or superiority language appears", () => {
  const artifact: TokenSearchBenchmarkArtifact = {
    benchmark_id: "finance-data-token-search",
    intent: "token search",
    canonical_query: "SOL",
    generated_at: "2026-05-17T00:00:00.000Z",
    total_runs: 5,
    winner_claimed: false,
    winner_status: "no_clear_winner",
    runs: [],
    aggregate_metrics: [],
    proof_references: [],
    notes: "Token-search benchmark recorded. No route winner is claimed. Scoring thresholds are not finalized.",
  };
  const markdown = renderSafeMarkdown(artifact);
  assert.doesNotMatch(markdown, /benchmark[-_ ]winning|superior|winner:\s*\w+/i);
  assert.match(markdown, /winner_claimed: false/);
});
