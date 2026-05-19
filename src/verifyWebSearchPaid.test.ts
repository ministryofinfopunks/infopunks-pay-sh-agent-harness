import assert from "node:assert/strict";
import test from "node:test";

import type { LivePayShExecutionResult } from "./types";
import {
  deriveRouteState,
  getRouteConfigs,
  hashCanonicalInput,
  renderProofMarkdown,
  runPaidRoute,
  runWebSearchPaidVerification,
  shouldExecuteFirecrawlBackup,
} from "./verifyWebSearchPaid";

function fakeLiveResult(overrides: Partial<LivePayShExecutionResult> = {}): LivePayShExecutionResult {
  return {
    providerId: "merit-systems/stableenrich/enrichment",
    intent: "data-web-search-results",
    endpointUrl: "https://stableenrich.dev/api/exa/search",
    startedAt: new Date("2026-05-19T00:00:00.000Z").toISOString(),
    completedAt: new Date("2026-05-19T00:00:01.000Z").toISOString(),
    latencyMs: 1000,
    success: true,
    statusCode: 200,
    exitCode: 0,
    costUsd: null,
    settlementReference: null,
    responsePreview: "{}",
    parsedJsonAvailable: true,
    parsedJson: {
      query: "x402 agent payments",
      total: 1,
      results: [
        {
          title: "x402 docs",
          url: "https://x402.org/docs",
          snippet: "x402 payments",
          source: "x402.org",
          published_at: "2026-05-19",
        },
      ],
    },
    mode: "live_pay_sh_cli",
    ...overrides,
  };
}

test("route-specific body generation for Exa", () => {
  const body = getRouteConfigs().exa.buildBody({ query: "x402 agent payments", limit: 5 });
  assert.deepEqual(body, { query: "x402 agent payments", numResults: 5 });
});

test("route-specific body generation for Perplexity", () => {
  const body = getRouteConfigs().perplexity.buildBody({ query: "x402 agent payments", limit: 5 });
  assert.deepEqual(body, { query: "x402 agent payments", max_results: 5 });
});

test("route-specific body generation for Firecrawl", () => {
  const body = getRouteConfigs().firecrawl.buildBody({ query: "x402 agent payments", limit: 5 });
  assert.deepEqual(body, { query: "x402 agent payments", limit: 5 });
});

test("canonical input hash", () => {
  const hash = hashCanonicalInput({ query: "x402 agent payments", limit: 5 });
  assert.equal(hash.length, 64);
  assert.match(hash, /^[a-f0-9]+$/);
});

test("successful Exa result normalization", async () => {
  const proof = await runPaidRoute(
    getRouteConfigs().exa,
    hashCanonicalInput({ query: "x402 agent payments", limit: 5 }),
    async () => fakeLiveResult(),
  );

  assert.equal(proof.provider, "StableEnrich Exa Search");
  assert.equal(proof.route_state, "verified/proven");
  assert.equal(proof.search_success, true);
  assert.equal(proof.sample_normalized_results[0]?.title, "x402 docs");
});

test("successful Perplexity result normalization", async () => {
  const proof = await runPaidRoute(
    getRouteConfigs().perplexity,
    hashCanonicalInput({ query: "x402 agent payments", limit: 5 }),
    async () =>
      fakeLiveResult({
        providerId: "paysponge/perplexity",
        endpointUrl: "https://pplx.x402.paysponge.com/search",
        parsedJson: {
          query: "x402 agent payments",
          result_count: 1,
          answer: "summary",
          results: [
            {
              headline: "Perplexity result",
              href: "https://example.com/perplexity",
              summary: "snippet",
              site: "example.com",
              publishedDate: "2026-05-19",
            },
          ],
        },
      }),
  );

  assert.equal(proof.provider, "Perplexity Search");
  assert.equal(proof.route_state, "verified/proven");
  assert.equal(proof.sample_normalized_results[0]?.url, "https://example.com/perplexity");
});

test("Firecrawl backup execution decision", () => {
  assert.equal(
    shouldExecuteFirecrawlBackup([
      {
        benchmark_id: "data-web-search-results",
        provider: "StableEnrich Exa Search",
        endpoint: "https://stableenrich.dev/api/exa/search",
        method: "POST",
        canonical_input_hash: "h",
        route_specific_body: {},
        paid_execution_status: "succeeded",
        cli_exit_code: 0,
        status_evidence: "status_code_observed_200",
        normalized_output: {
          query: "x402 agent payments",
          result_count: 1,
          results: [{ title: "t", url: "u", snippet: "s", source: "d", published_at: "p" }],
          search_success: true,
          query_match: true,
          status_evidence: "status_code_observed_200",
          raw_status_code: 200,
          caveat_objects: [],
          evidence_health: "recorded",
        },
        result_count: 1,
        search_success: true,
        sample_normalized_results: [],
        caveat_objects: [],
        evidence_health: "recorded",
        route_state: "verified/proven",
      },
      {
        benchmark_id: "data-web-search-results",
        provider: "Perplexity Search",
        endpoint: "https://pplx.x402.paysponge.com/search",
        method: "POST",
        canonical_input_hash: "h",
        route_specific_body: {},
        paid_execution_status: "succeeded",
        cli_exit_code: 0,
        status_evidence: "status_code_observed_200",
        normalized_output: {
          query: "x402 agent payments",
          result_count: 1,
          results: [{ title: "t", url: "u", snippet: "s", source: "d", published_at: "p" }],
          search_success: true,
          query_match: true,
          status_evidence: "status_code_observed_200",
          raw_status_code: 200,
          caveat_objects: [],
          evidence_health: "recorded",
        },
        result_count: 1,
        search_success: true,
        sample_normalized_results: [],
        caveat_objects: [],
        evidence_health: "recorded",
        route_state: "verified/proven",
      },
    ]),
    false,
  );

  assert.equal(
    shouldExecuteFirecrawlBackup([
      {
        benchmark_id: "data-web-search-results",
        provider: "StableEnrich Exa Search",
        endpoint: "https://stableenrich.dev/api/exa/search",
        method: "POST",
        canonical_input_hash: "h",
        route_specific_body: {},
        paid_execution_status: "failed",
        cli_exit_code: 1,
        status_evidence: "pay_cli_exit_1",
        normalized_output: {
          query: "x402 agent payments",
          result_count: 0,
          results: [],
          search_success: false,
          query_match: null,
          status_evidence: "pay_cli_exit_1",
          raw_status_code: null,
          caveat_objects: [],
          evidence_health: "unverified",
        },
        result_count: 0,
        search_success: false,
        sample_normalized_results: [],
        caveat_objects: [],
        evidence_health: "unverified",
        route_state: "candidate/unproven",
      },
      {
        benchmark_id: "data-web-search-results",
        provider: "Perplexity Search",
        endpoint: "https://pplx.x402.paysponge.com/search",
        method: "POST",
        canonical_input_hash: "h",
        route_specific_body: {},
        paid_execution_status: "succeeded",
        cli_exit_code: 0,
        status_evidence: "status_code_observed_200",
        normalized_output: {
          query: "x402 agent payments",
          result_count: 1,
          results: [{ title: "t", url: "u", snippet: "s", source: "d", published_at: "p" }],
          search_success: true,
          query_match: true,
          status_evidence: "status_code_observed_200",
          raw_status_code: 200,
          caveat_objects: [],
          evidence_health: "recorded",
        },
        result_count: 1,
        search_success: true,
        sample_normalized_results: [],
        caveat_objects: [],
        evidence_health: "recorded",
        route_state: "verified/proven",
      },
    ]),
    true,
  );
});

test("failed route remains candidate/unproven", async () => {
  const proof = await runPaidRoute(
    getRouteConfigs().exa,
    hashCanonicalInput({ query: "x402 agent payments", limit: 5 }),
    async () =>
      fakeLiveResult({
        success: false,
        exitCode: 1,
        statusCode: undefined,
        parsedJsonAvailable: false,
        responsePreview: "payment required",
      }),
  );

  assert.equal(proof.paid_execution_status, "failed");
  assert.equal(proof.route_state, "candidate/unproven");
});

test("route_state/evidence_health distinction", () => {
  const state = deriveRouteState({
    paidCallSuccess: true,
    normalized: {
      normalized: {
        query: "x402 agent payments",
        result_count: 1,
        results: [{ title: "x", url: "https://x", snippet: null, source: null, published_at: null }],
        search_success: true,
        query_match: null,
        status_evidence: "pay_cli_exit_0_status_unavailable",
        raw_status_code: null,
        caveat_objects: [
          {
            code: "query_unconfirmed",
            severity: "warning",
            affects_core_semantics: false,
            detail: "d",
          },
        ],
        evidence_health: "caveated",
      },
      caveat_objects: [
        {
          code: "query_unconfirmed",
          severity: "warning",
          affects_core_semantics: false,
          detail: "d",
        },
      ],
    },
  });

  assert.equal(state, "verified/proven");
});

test("proof safe output", () => {
  const markdown = renderProofMarkdown(
    [
      {
        benchmark_id: "data-web-search-results",
        provider: "StableEnrich Exa Search",
        endpoint: "https://stableenrich.dev/api/exa/search",
        method: "POST",
        canonical_input_hash: "abc",
        route_specific_body: { query: "x402 agent payments", numResults: 5 },
        paid_execution_status: "succeeded",
        cli_exit_code: 0,
        status_evidence: "authorization: Bearer secret",
        normalized_output: {
          query: "x402 agent payments",
          result_count: 1,
          results: [{ title: "x", url: "https://x", snippet: "s", source: "x", published_at: "2026-05-19" }],
          search_success: true,
          query_match: true,
          status_evidence: "authorization: Bearer secret",
          raw_status_code: 200,
          caveat_objects: [],
          evidence_health: "recorded",
        },
        result_count: 1,
        search_success: true,
        sample_normalized_results: [{ title: "x", url: "https://x", snippet: "s", source: "x", published_at: "2026-05-19" }],
        caveat_objects: [],
        evidence_health: "recorded",
        route_state: "verified/proven",
      },
    ],
    new Date("2026-05-19T00:00:00.000Z"),
  );

  assert.doesNotMatch(markdown, /Bearer secret/);
  assert.match(markdown, /No winner claim\./);
});

test("Firecrawl backup is executed when one primary route fails", async () => {
  const originalLive = process.env.LIVE_PAYSH_EXECUTION;
  const originalMode = process.env.PAYSH_EXECUTION_MODE;
  process.env.LIVE_PAYSH_EXECUTION = "true";
  process.env.PAYSH_EXECUTION_MODE = "pay_cli";

  const calls: string[] = [];

  try {
    const result = await runWebSearchPaidVerification(
      async (input) => {
        calls.push(input.endpointUrl ?? "");
        if ((input.endpointUrl ?? "").includes("/exa/search")) {
          return fakeLiveResult({
            success: false,
            statusCode: undefined,
            exitCode: 1,
            parsedJsonAvailable: false,
            responsePreview: "payment required",
          });
        }
        if ((input.endpointUrl ?? "").includes("/search") && (input.endpointUrl ?? "").includes("pplx")) {
          return fakeLiveResult({
            providerId: "paysponge/perplexity",
            endpointUrl: "https://pplx.x402.paysponge.com/search",
          });
        }
        return fakeLiveResult({ endpointUrl: "https://stableenrich.dev/api/firecrawl/search" });
      },
      new Date("2026-05-19T00:00:00.000Z"),
    );

    assert.equal(result.attempted_routes.length, 3);
    assert.ok(calls.some((url) => url.includes("/firecrawl/search")));
  } finally {
    if (originalLive === undefined) {
      delete process.env.LIVE_PAYSH_EXECUTION;
    } else {
      process.env.LIVE_PAYSH_EXECUTION = originalLive;
    }
    if (originalMode === undefined) {
      delete process.env.PAYSH_EXECUTION_MODE;
    } else {
      process.env.PAYSH_EXECUTION_MODE = originalMode;
    }
  }
});
