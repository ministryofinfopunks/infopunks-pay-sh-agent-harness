import assert from "node:assert/strict";
import test from "node:test";
import {
  BENCHMARK_ID,
  CANONICAL_INPUT,
  assertBenchmarkReadiness,
  assertNoComparativeLanguage,
  buildRouteAggregate,
  median,
  p95,
  renderBenchmarkMarkdown,
  type BenchmarkArtifact,
  type RouteConfig,
  type RouteRunResult,
} from "./benchmarkDocumentOcrLive";

const routeA: RouteConfig = {
  route_id: "paysponge-reducto-parse",
  provider: "PaySponge Reducto",
  provider_id: "paysponge/reducto",
  endpoint: "https://api.paysponge.com/x402/purchase/svc_d672d90ggvqqygj60/parse",
  method: "POST",
  buildBody: () => ({ input: CANONICAL_INPUT.document_url }),
  proof_reference: "live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md",
};

function makeRun(overrides: Partial<RouteRunResult> = {}): RouteRunResult {
  return {
    run_number: 1,
    provider: routeA.provider,
    provider_id: routeA.provider_id,
    route_id: routeA.route_id,
    endpoint: routeA.endpoint,
    method: routeA.method,
    paid_execution_status: "succeeded",
    cli_exit_code: 0,
    latency_ms: 100,
    status_evidence: "pay_cli_exit_0_status_unavailable",
    normalized_output: {
      text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
      text_fragments_detected: [...CANONICAL_INPUT.expected_text_fragments],
      expected_fragment_match_rate: 1,
      ocr_success: true,
      character_count: 55,
      page_count: 1,
      confidence: 0.98,
      status_evidence: "pay_cli_exit_0_status_unavailable",
      raw_status_code: null,
      caveat_objects: [
        {
          code: "status_code_unavailable",
          severity: "warning",
          affects_core_semantics: false,
          detail: "HTTP status code was not available in execution output.",
        },
      ],
      evidence_health: "caveated",
    },
    caveat_objects: [
      {
        code: "status_code_unavailable",
        severity: "warning",
        affects_core_semantics: false,
        detail: "HTTP status code was not available in execution output.",
      },
    ],
    evidence_health: "caveated",
    proof_reference: "live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md",
    ...overrides,
  };
}

test("median and p95 latency", () => {
  assert.equal(median([100, 200, 300]), 200);
  assert.equal(median([100, 200, 300, 500]), 250);
  assert.equal(p95([100, 150, 200, 250, 300]), 300);
});

test("aggregation math and OCR rates", () => {
  const runs = [
    makeRun({ run_number: 1, latency_ms: 100, normalized_output: { ...makeRun().normalized_output, expected_fragment_match_rate: 1, ocr_success: true } }),
    makeRun({ run_number: 2, latency_ms: 200, normalized_output: { ...makeRun().normalized_output, expected_fragment_match_rate: 0.6667, ocr_success: true, text_fragments_detected: CANONICAL_INPUT.expected_text_fragments.slice(0, 2) } }),
    makeRun({ run_number: 3, latency_ms: 300, normalized_output: { ...makeRun().normalized_output, expected_fragment_match_rate: 0, ocr_success: false, text: null, character_count: null, confidence: null, page_count: null, text_fragments_detected: [] }, paid_execution_status: "failed" }),
  ];

  const agg = buildRouteAggregate(routeA, runs);
  assert.equal(agg.attempted_runs, 3);
  assert.equal(agg.successful_runs, 2);
  assert.equal(agg.success_rate, 2 / 3);
  assert.equal(agg.ocr_success_rate, 2 / 3);
  assert.equal(agg.expected_fragment_match_rate_avg, Number(((1 + 0.6667 + 0) / 3).toFixed(4)));
  assert.equal(agg.expected_fragment_match_rate_median, 0.6667);
  assert.equal(agg.full_match_rate, 1 / 3);
  assert.equal(agg.text_detection_rate, 2 / 3);
  assert.equal(agg.character_count_median, 55);
  assert.equal(agg.confidence_detection_rate, 2 / 3);
  assert.equal(agg.page_count_detection_rate, 2 / 3);
});

test("winner_claimed remains false and safe artifact output", () => {
  const artifact: BenchmarkArtifact = {
    benchmark_id: BENCHMARK_ID,
    category: "document-ai",
    canonical_input: CANONICAL_INPUT,
    canonical_input_hash: "abc",
    generated_at: "2026-05-19T00:00:00.000Z",
    run_count: 5,
    winner_status: "no_clear_winner",
    winner_claimed: false,
    route_summaries: [buildRouteAggregate(routeA, [makeRun()])],
    aggregate_metrics: [buildRouteAggregate(routeA, [makeRun()])],
    run_level_summaries: [makeRun()],
  };

  const markdown = renderBenchmarkMarkdown(artifact);
  assert.match(markdown, /winner_claimed: false/);
  assert.match(markdown, /winner_status: no_clear_winner/);
  assert.doesNotMatch(markdown, /authorization|bearer|api[_-]?key|mnemonic|wallet/i);
});

test("both routes required before benchmark runs", () => {
  assert.throws(() => {
    const routes: RouteConfig[] = [routeA];
    if (routes.length < 2) {
      throw new Error("Both routes are required before benchmark runs.");
    }
  }, /Both routes are required before benchmark runs\./);
});

test("no best/top/winner/loser/superiority language", () => {
  assert.doesNotThrow(() => assertNoComparativeLanguage("winner_status: no_clear_winner\nwinner_claimed: false"));
  assert.throws(() => assertNoComparativeLanguage("This route is superior"), /Unsafe comparative language/);
});

test("readiness requires env and both proven routes", async () => {
  const original = { ...process.env };
  process.env.LIVE_PAYSH_EXECUTION = "false";
  process.env.PAYSH_EXECUTION_MODE = "pay_cli";
  await assert.rejects(() => assertBenchmarkReadiness(async () => ({ status: 200 })), /LIVE_PAYSH_EXECUTION_not_true/);
  process.env.LIVE_PAYSH_EXECUTION = original.LIVE_PAYSH_EXECUTION;
  process.env.PAYSH_EXECUTION_MODE = original.PAYSH_EXECUTION_MODE;
});
