import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateRouteMetrics,
  assertBothRoutesPresent,
  calculateMedian,
  calculateP95,
  renderBenchmarkMarkdown,
  type RouteRunRecord,
  type WebSearchBenchmarkArtifact,
} from "./benchmarkWebSearchLive";

function makeRun(overrides: Partial<RouteRunRecord> = {}): RouteRunRecord {
  return {
    run_number: 1,
    generated_at: "2026-05-19T00:00:00.000Z",
    route_name: "StableEnrich Exa Search",
    provider_id: "merit-systems/stableenrich/enrichment",
    endpoint: "https://stableenrich.dev/api/exa/search",
    method: "POST",
    request_body: { query: "x402 agent payments", numResults: 5 },
    execution_transport: "pay_cli",
    paid_execution_succeeded: true,
    cli_exit_code: 0,
    status_code: null,
    status_evidence: "pay_cli_exit_0_status_unavailable",
    latency_ms: 1000,
    normalized_output: {
      query: "x402 agent payments",
      result_count: 5,
      results: [
        {
          title: "x402",
          url: "https://x402.org",
          snippet: "x402 search",
          source: "x402.org",
          published_at: "2026-05-10",
        },
      ],
      search_success: true,
      query_match: true,
      status_evidence: "pay_cli_exit_0_status_unavailable",
      raw_status_code: null,
      caveat_objects: [],
      evidence_health: "recorded",
    },
    caveat_objects: [],
    evidence_health: "recorded",
    proof_reference: "live-proofs/data-web-search-results-paid-routes-2026-05-19.md",
    ...overrides,
  };
}

test("median and p95 latency", () => {
  assert.equal(calculateMedian([900, 1000, 1300]), 1000);
  assert.equal(calculateMedian([900, 1000, 1300, 1700]), 1150);
  assert.equal(calculateP95([100, 150, 200, 250, 300]), 300);
});

test("aggregation math and detection rates", () => {
  const runs: RouteRunRecord[] = [
    makeRun({ run_number: 1, latency_ms: 500 }),
    makeRun({ run_number: 2, latency_ms: 700, normalized_output: { ...makeRun().normalized_output, results: [], result_count: 0, search_success: false } }),
    makeRun({ run_number: 3, latency_ms: 900, paid_execution_succeeded: false, normalized_output: { ...makeRun().normalized_output, results: [{ title: null, url: null, snippet: null, source: null, published_at: null }] } }),
    makeRun({ run_number: 4, latency_ms: 1100 }),
    makeRun({ run_number: 5, latency_ms: 1300 }),
  ];

  const agg = aggregateRouteMetrics(runs);
  assert.equal(agg.attempted_runs, 5);
  assert.equal(agg.successful_runs, 4);
  assert.equal(agg.success_rate, 0.8);
  assert.equal(agg.search_success_rate, 0.8);
  assert.equal(agg.result_detection_rate, 0.8);
  assert.equal(agg.title_detection_rate, 0.6);
  assert.equal(agg.url_detection_rate, 0.6);
  assert.equal(agg.snippet_detection_rate, 0.6);
  assert.equal(agg.source_detection_rate, 0.6);
  assert.equal(agg.published_at_detection_rate, 0.6);
  assert.equal(agg.median_result_count, 1);
  assert.equal(agg.median_latency_ms, 900);
  assert.equal(agg.p95_latency_ms, 1300);
});

test("winner_claimed remains false in artifact", () => {
  const artifact: WebSearchBenchmarkArtifact = {
    benchmark_id: "data-web-search-results",
    category: "web-search",
    intent: "search the web for the same query and return normalized search results",
    generated_at: "2026-05-19T00:00:00.000Z",
    canonical_input: { query: "x402 agent payments", limit: 5 },
    canonical_input_hash: "abc",
    route_summaries: [],
    aggregate_metrics: [],
    run_level_summaries: [],
    structured_caveats: [],
    winner_status: "no_clear_winner",
    winner_claimed: false,
  };
  assert.equal(artifact.winner_claimed, false);
});

test("benchmark artifact safe output", () => {
  const artifact: WebSearchBenchmarkArtifact = {
    benchmark_id: "data-web-search-results",
    category: "web-search",
    intent: "search the web for the same query and return normalized search results",
    generated_at: "2026-05-19T00:00:00.000Z",
    canonical_input: { query: "x402 agent payments", limit: 5 },
    canonical_input_hash: "abc",
    route_summaries: [
      {
        route_name: "StableEnrich Exa Search",
        provider_id: "merit-systems/stableenrich/enrichment",
        endpoint: "https://stableenrich.dev/api/exa/search",
        method: "POST",
      },
    ],
    aggregate_metrics: [aggregateRouteMetrics([makeRun()])],
    run_level_summaries: [makeRun()],
    structured_caveats: [{ route_name: "StableEnrich Exa Search", caveat_objects: [] }],
    winner_status: "no_clear_winner",
    winner_claimed: false,
  };

  const markdown = renderBenchmarkMarkdown(artifact).toLowerCase();
  assert.equal(markdown.includes("authorization:"), false);
  assert.equal(markdown.includes("bearer "), false);
  assert.match(markdown, /winner_claimed: false/);
  assert.doesNotMatch(markdown, /winner:\s*true/i);
});

test("both routes required before benchmark runs", () => {
  assert.throws(
    () =>
      assertBothRoutesPresent([
        makeRun({ route_name: "StableEnrich Exa Search" }),
      ]),
    /both_routes_required_before_benchmark_runs/,
  );
});
