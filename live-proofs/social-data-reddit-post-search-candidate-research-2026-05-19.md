# Candidate Research: social-data-reddit-post-search (2026-05-19)

## Scope
- benchmark_id: `social-data-reddit-post-search`
- category: `social-data`
- intent: search Reddit posts for the same keyword query
- canonical input tested for compatibility review:
  ```json
  {
    "query": "x402",
    "limit": 5
  }
  ```
- Paid execution: **not performed**
- Probe mode: **unpaid only**

## Route 1: StableEnrich
- provider: `merit-systems/stableenrich/enrichment`
- endpoint: `https://stableenrich.dev/api/reddit/search`
- method: `POST`

### request shape (confirmed)
From `~/.config/pay/skills/detail/32f0afdaade13c61.json` and `https://stableenrich.dev/openapi.json`:
- Required:
  - `query` (string)
- Optional:
  - `sort` (`relevance|new|top|comment_count`, default `relevance`)
  - `timeframe` (`all|day|week|month|year`, default `all`)
  - `after` (string)
  - `maxResults` (number, min 1, max 25, default 10)

### canonical input used
```json
{
  "query": "x402",
  "limit": 5
}
```

### unpaid status evidence
- `GET /api/reddit/search` returned `HTTP/2 405` (route exists, method mismatch for GET).
- `POST /api/reddit/search` (no payment header) returned `HTTP/2 402` with:
  - `payment-required: ...`
  - `www-authenticate: Payment ...`
- `POST` with provider-native body (`{"query":"x402","maxResults":5}`) also returned `402`.

### payment challenge detected
- `true`

### semantic fit
- accepts keyword query: `true` (`query`)
- returns or promises Reddit posts: `true` (OpenAPI summary `Reddit Search - Search Reddit posts`; response schema includes `posts`)
- likely exposes title/url/subreddit/author/snippet fields: `mostly true`
  - Explicit in schema: `title`, `author`, `subreddit`, `permalink`, `selftext`, `createdAt`, `score`
  - `url` is not explicitly named as `url`; `permalink` is present.
  - `snippet` likely map from `selftext` (possibly truncated by design).

### caveat_objects
- `canonical input mismatch`: benchmark uses `limit`, provider expects `maxResults`.
- `shape source divergence`: OpenAPI request `required` lists only `query`, but 402 payment metadata schema embedded in challenge appears stricter (`query`, `sort`, `timeframe`, `maxResults` required).
- `response normalization`: provider returns `selftext`/`createdAt`/`numComments`; benchmark expects `snippet`/`created_at`.

### conclusion
- candidate/unproven: `candidate`
- verified/unproven: `verified` (for existence + 402 + method + documented schema; not paid-run verified)
- rejected: `false`

---

## Route 2: StableSocial
- provider: `merit-systems/stablesocial/social-data`
- endpoint: `https://stablesocial.dev/api/reddit/search`
- method: `POST`

### request shape (confirmed)
From `~/.config/pay/skills/detail/7e930b1d13fc851f.json` and `https://stablesocial.dev/openapi.json`:
- Required:
  - `keywords` (string)
- Optional:
  - `max_posts` (integer, default 50)
  - `max_page_size` (integer, default 50)
  - `cursor` (string)

### canonical input used
```json
{
  "query": "x402",
  "limit": 5
}
```

### unpaid status evidence
- `GET /api/reddit/search` returned `HTTP/2 405` (route exists, method mismatch for GET).
- `POST /api/reddit/search` (no payment header) returned `HTTP/2 402` with:
  - `payment-required: ...`
  - `www-authenticate: Payment ...`
- `POST` with provider-native body (`{"keywords":"x402","max_posts":5}`) also returned `402`.

### payment challenge detected
- `true`

### semantic fit
- accepts keyword query: `true` (via `keywords` rather than `query`)
- returns or promises Reddit posts: `true` (summary `Reddit - Search posts by keyword`)
- likely exposes title/url/subreddit/author/snippet fields: `likely true but less explicit`
  - OpenAPI in skill detail does not include rich explicit response object for this endpoint.
  - Guidance states Reddit search supports post search and lightweight previews.

### caveat_objects
- `canonical input mismatch`: benchmark uses `query`/`limit`; provider expects `keywords` and `max_posts`/`max_page_size`.
- `response contract opacity`: response field-level structure not fully explicit in current exposed OpenAPI path object.
- `higher price`: listed as $0.06 vs StableEnrich $0.02 for similar Reddit search intent.

### conclusion
- candidate/unproven: `candidate`
- verified/unproven: `verified` (for existence + 402 + method + documented schema; not paid-run verified)
- rejected: `false`

---

## Comparative verdict for benchmark lane
- Two comparable paid-proven route candidates exist for Reddit keyword post search intent.
- Both are unpaid-probe verified for route existence, method (`POST`), and payment challenge (`402`).
- Both require request normalization from canonical benchmark input:
  - StableEnrich: map `limit -> maxResults`
  - StableSocial: map `query -> keywords`, `limit -> max_posts` (and/or `max_page_size`)
- Lane status recommendation: **good candidate for benchmark implementation**, pending paid execution phase in a separate step.
