import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveDataWebSearchResultsEvidenceHealth,
  normalizeDataWebSearchResults,
  type NormalizeDataWebSearchResultsResult,
} from "./dataWebSearchResultsNormalization";

const canonicalInput = { query: "x402 agent payments", limit: 5 };

test("Exa-like response normalizes", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: {
      results: [
        {
          title: "x402 spec",
          url: "https://x402.org/spec",
          snippet: "HTTP 402 payment flow",
          source: "x402.org",
          published_at: "2026-05-19T00:00:00Z",
        },
      ],
      query: "x402 agent payments",
      total: 1,
    },
    statusCode: 200,
    statusEvidence: "http 200",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.result_count, 1);
  assert.equal(result.normalized.results.length, 1);
  assert.equal(result.normalized.results[0]?.title, "x402 spec");
  assert.equal(result.normalized.query_match, true);
});

test("Firecrawl-like response normalizes", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: {
      data: [
        {
          name: "Firecrawl docs",
          link: "https://firecrawl.dev/docs",
          description: "Search endpoint",
          domain: "firecrawl.dev",
          date: "2026-05-18",
        },
      ],
      search: "x402 agent payments",
      count: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.results[0]?.title, "Firecrawl docs");
  assert.equal(result.normalized.results[0]?.url, "https://firecrawl.dev/docs");
  assert.equal(result.normalized.query_match, true);
});

test("Perplexity-like response normalizes", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: {
      answer: "Top references",
      results: [
        {
          headline: "Perplexity search",
          href: "https://docs.perplexity.ai/search",
          summary: "query and max_results",
          site: "docs.perplexity.ai",
          publishedDate: "2026-05-17",
        },
      ],
      q: "x402 agent payments",
      result_count: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.results[0]?.title, "Perplexity search");
  assert.equal(result.normalized.results[0]?.url, "https://docs.perplexity.ai/search");
  assert.equal(result.normalized.results[0]?.snippet, "query and max_results");
});

test("nested data/results/items shapes are extracted", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: {
      data: {
        results: [
          {
            title: "Nested shape",
            url: "https://example.com/a",
            content: "nested",
            hostname: "example.com",
            timestamp: "2026-05-16T10:00:00Z",
          },
        ],
      },
      results: {
        items: [
          {
            title: "Alternate nested",
            url: "https://example.com/b",
            snippet: "b",
          },
        ],
      },
      query: "x402 agent payments",
      total: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.results.length, 1);
  assert.equal(result.normalized.results[0]?.title, "Nested shape");
});

test("402 payment-required only adds payment caveats", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: { error: "Payment Required" },
    statusCode: 402,
    paidExecutionObserved: false,
    canonicalInput,
  });

  const codes = result.caveat_objects.map((c) => c.code);
  assert.ok(codes.includes("payment_required_confirmed_only"));
  assert.ok(codes.includes("paid_payload_unobserved"));
});

test("405 method not allowed adds method_not_allowed", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: { error: "Method Not Allowed" },
    statusCode: 405,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "method_not_allowed"));
});

test("404 route not found adds route_not_found", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: { error: "Not Found" },
    statusCode: 404,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "route_not_found"));
});

test("non-JSON response adds non_json_text_response", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: "upstream timeout",
    responsePreview: "upstream timeout",
    statusCode: 502,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "non_json_text_response"));
});

test("pay_cli hidden status adds status_code_unavailable", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: {
      results: [
        {
          title: "x402",
          url: "https://example.com/x402",
          snippet: "x402",
          source: "example.com",
          published_at: "2026-05-19T04:00:00Z",
        },
      ],
      query: "x402 agent payments",
      total: 1,
    },
    statusCode: null,
    statusEvidence: "pay_cli exit code 0 and parsed response body",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.raw_status_code, null);
  assert.equal(result.normalized.status_evidence, "pay_cli exit code 0 and parsed response body");
  assert.ok(result.caveat_objects.some((c) => c.code === "status_code_unavailable"));
});

test("zero results adds no_results_returned", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: { results: [], query: "x402 agent payments", total: 0 },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "no_results_returned"));
});

test("missing title adds result_title_missing", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: {
      results: [
        {
          url: "https://example.com/1",
          snippet: "s",
          source: "example.com",
          published_at: "2026-05-19",
        },
      ],
      query: "x402 agent payments",
      total: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "result_title_missing"));
});

test("missing URL adds result_url_missing", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: {
      results: [
        {
          title: "No URL",
          snippet: "s",
          source: "example.com",
          published_at: "2026-05-19",
        },
      ],
      query: "x402 agent payments",
      total: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "result_url_missing"));
});

test("missing snippet adds result_snippet_missing", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: {
      results: [
        {
          title: "No snippet",
          url: "https://example.com/1",
          source: "example.com",
          published_at: "2026-05-19",
        },
      ],
      query: "x402 agent payments",
      total: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "result_snippet_missing"));
});

test("source is derived from URL if missing", () => {
  const result = normalizeDataWebSearchResults({
    parsedJson: {
      results: [
        {
          title: "Derive source",
          url: "https://sub.example.com/path",
          snippet: "snip",
          published_at: "2026-05-19",
        },
      ],
      query: "x402 agent payments",
      total: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.results[0]?.source, "sub.example.com");
  assert.ok(!result.caveat_objects.some((c) => c.code === "source_missing"));
});

function makeLatest(overrides: Partial<NormalizeDataWebSearchResultsResult["normalized"]> & {
  caveat_objects?: NormalizeDataWebSearchResultsResult["caveat_objects"];
}): NormalizeDataWebSearchResultsResult {
  const base = normalizeDataWebSearchResults({
    parsedJson: {
      results: [
        {
          title: "x402",
          url: "https://example.com/x402",
          snippet: "x402",
          source: "example.com",
          published_at: "2026-05-19T06:00:00Z",
        },
      ],
      query: "x402 agent payments",
      total: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  return {
    normalized: {
      ...base.normalized,
      ...(overrides ?? {}),
    },
    caveat_objects: overrides.caveat_objects ?? base.caveat_objects,
  };
}

test("evidence_health derivation", () => {
  assert.equal(
    deriveDataWebSearchResultsEvidenceHealth({
      researchOnly: true,
      paidAttempts: 0,
      paidSuccesses: 0,
      latest: makeLatest({}),
    }),
    "scaffold",
  );

  assert.equal(
    deriveDataWebSearchResultsEvidenceHealth({
      paidAttempts: 0,
      paidSuccesses: 0,
      latest: makeLatest({}),
    }),
    "unverified",
  );

  assert.equal(
    deriveDataWebSearchResultsEvidenceHealth({
      paidAttempts: 3,
      paidSuccesses: 1,
      paidFailures: 2,
      latest: makeLatest({}),
    }),
    "degraded",
  );

  assert.equal(
    deriveDataWebSearchResultsEvidenceHealth({
      paidAttempts: 2,
      paidSuccesses: 2,
      successfulResultCounts: [0, 0],
      latest: makeLatest({ results: [] }),
    }),
    "degraded",
  );

  assert.equal(
    deriveDataWebSearchResultsEvidenceHealth({
      paidAttempts: 1,
      paidSuccesses: 1,
      latest: makeLatest({
        caveat_objects: [
          {
            code: "query_unconfirmed",
            severity: "warning",
            affects_core_semantics: false,
            detail: "Response does not echo query text; query match could not be confirmed.",
          },
        ],
      }),
    }),
    "caveated",
  );

  assert.equal(
    deriveDataWebSearchResultsEvidenceHealth({
      paidAttempts: 1,
      paidSuccesses: 1,
      latest: makeLatest({ caveat_objects: [] }),
    }),
    "recorded",
  );
});
