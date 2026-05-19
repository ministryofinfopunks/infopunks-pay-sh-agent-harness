import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveSocialDataRedditPostSearchEvidenceHealth,
  normalizeSocialDataRedditPostSearch,
  type NormalizeSocialDataRedditPostSearchResult,
} from "./socialDataRedditPostSearchNormalization";

const canonicalInput = { query: "x402", limit: 5 };

test("StableEnrich-like Reddit search response normalizes", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: {
      posts: [
        {
          title: "x402 launch",
          permalink: "https://reddit.com/r/ethdev/comments/1",
          subreddit: "ethdev",
          author: "alice",
          createdAt: "2026-05-19T00:00:00Z",
          score: 42,
          selftext: "payment rail",
        },
      ],
      searchContext: { query: "x402", resultCount: 1 },
    },
    statusCode: 200,
    statusEvidence: "http 200",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.query_match, true);
  assert.equal(result.normalized.result_count, 1);
  assert.equal(result.normalized.posts.length, 1);
  assert.equal(result.normalized.posts[0]?.title, "x402 launch");
  assert.equal(result.normalized.posts[0]?.snippet, "payment rail");
});

test("StableSocial-like Reddit search response normalizes", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: {
      data: {
        items: [
          {
            title: "x402 mention",
            url: "https://reddit.com/r/solana/comments/2",
            subreddit: "solana",
            author: "bob",
            created_at: "2026-05-19T01:00:00Z",
            score: 7,
            snippet: "x402 support",
          },
        ],
      },
      keywords: "x402",
      total: 1,
    },
    statusCode: 200,
    statusEvidence: "http 200",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.query_match, true);
  assert.equal(result.normalized.result_count, 1);
  assert.equal(result.normalized.posts[0]?.url, "https://reddit.com/r/solana/comments/2");
});

test("nested post arrays are extracted", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: {
      envelope: {
        payload: {
          posts: [
            {
              title: "nested",
              permalink: "/r/test/comments/3",
              subreddit: "test",
              author: "carol",
              created_at: "2026-05-19T02:00:00Z",
            },
          ],
        },
      },
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.posts.length, 1);
  assert.equal(result.normalized.posts[0]?.title, "nested");
});

test("response with results/items/data/posts keys is handled", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: {
      results: {
        items: {
          data: {
            posts: [
              {
                title: "shape",
                permalink: "https://reddit.com/r/test/comments/4",
                subreddit: "test",
                author: "dave",
                created_at: "2026-05-19T03:00:00Z",
              },
            ],
          },
        },
      },
      result_count: 1,
      query: "x402",
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.posts.length, 1);
  assert.equal(result.normalized.result_count, 1);
});

test("402 payment-required only adds payment caveats", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: { error: "Payment Required" },
    statusCode: 402,
    paidExecutionObserved: false,
    canonicalInput,
  });

  const codes = result.caveat_objects.map((c) => c.code);
  assert.ok(codes.includes("payment_required_confirmed_only"));
  assert.ok(codes.includes("paid_payload_unobserved"));
});

test("404 route not found adds route_not_found", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: { error: "not found" },
    statusCode: 404,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "route_not_found"));
});

test("non-JSON response adds non_json_text_response", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: "upstream timeout",
    responsePreview: "upstream timeout",
    statusCode: 502,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "non_json_text_response"));
});

test("pay_cli hidden status uses status evidence and status_code_unavailable", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: {
      posts: [
        {
          title: "x402",
          permalink: "https://reddit.com/r/payments/comments/5",
          subreddit: "payments",
          author: "eve",
          created_at: "2026-05-19T04:00:00Z",
        },
      ],
      query: "x402",
      result_count: 1,
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

test("zero posts adds no_posts_returned", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: { posts: [], query: "x402", result_count: 0 },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "no_posts_returned"));
});

test("missing URL and permalink adds post_url_missing", () => {
  const result = normalizeSocialDataRedditPostSearch({
    parsedJson: {
      posts: [
        {
          title: "x402",
          subreddit: "ethdev",
          author: "frank",
          created_at: "2026-05-19T05:00:00Z",
        },
      ],
      query: "x402",
      result_count: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "post_url_missing"));
});

function makeLatest(overrides: Partial<NormalizeSocialDataRedditPostSearchResult["normalized"]> & {
  caveat_objects?: NormalizeSocialDataRedditPostSearchResult["caveat_objects"];
}): NormalizeSocialDataRedditPostSearchResult {
  const base = normalizeSocialDataRedditPostSearch({
    parsedJson: {
      posts: [
        {
          title: "x402",
          url: "https://reddit.com/r/payments/comments/6",
          subreddit: "payments",
          author: "gina",
          created_at: "2026-05-19T06:00:00Z",
        },
      ],
      query: "x402",
      result_count: 1,
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
    deriveSocialDataRedditPostSearchEvidenceHealth({
      researchOnly: true,
      paidAttempts: 0,
      paidSuccesses: 0,
      latest: makeLatest({}),
    }),
    "scaffold",
  );

  assert.equal(
    deriveSocialDataRedditPostSearchEvidenceHealth({
      paidAttempts: 0,
      paidSuccesses: 0,
      latest: makeLatest({}),
    }),
    "unverified",
  );

  assert.equal(
    deriveSocialDataRedditPostSearchEvidenceHealth({
      paidAttempts: 3,
      paidSuccesses: 1,
      paidFailures: 2,
      latest: makeLatest({}),
    }),
    "degraded",
  );

  assert.equal(
    deriveSocialDataRedditPostSearchEvidenceHealth({
      paidAttempts: 2,
      paidSuccesses: 2,
      successfulPostCounts: [0, 0],
      latest: makeLatest({ posts: [] }),
    }),
    "degraded",
  );

  assert.equal(
    deriveSocialDataRedditPostSearchEvidenceHealth({
      paidAttempts: 1,
      paidSuccesses: 1,
      latest: makeLatest({ query_match: null }),
    }),
    "caveated",
  );

  assert.equal(
    deriveSocialDataRedditPostSearchEvidenceHealth({
      paidAttempts: 1,
      paidSuccesses: 1,
      latest: makeLatest({ caveat_objects: [] }),
    }),
    "recorded",
  );
});
