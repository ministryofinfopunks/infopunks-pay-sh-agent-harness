# data-web-search-results candidate research (2026-05-19)

## Scope
- Benchmark candidate: `data-web-search-results`
- Canonical input used:

```json
{
  "query": "x402 agent payments",
  "limit": 5
}
```

- Source of route inventory: `~/.config/pay/skills/detail/*.json`
- Search terms used: `search`, `web`, `exa`, `firecrawl`, `perplexity`, `crawl`, `results`
- Probe policy: unpaid only (`curl -i` without payment settlement)

## Route 1
- provider: StableEnrich
- endpoint: `https://stableenrich.dev/api/exa/search`
- method: `POST`
- request shape:
  - required: `query` (string)
  - optional density controls include `numResults` (1-100)
  - note: canonical `limit` is not listed in the unpaid challenge schema for this route
- canonical input used:

```json
{"query":"x402 agent payments","limit":5}
```

- unpaid status evidence:
  - `POST` returned `HTTP/2 402`
  - response headers included `payment-required` and `www-authenticate: Payment ...`
  - wrong method check: `GET` returned `HTTP/2 405`
- payment challenge detected: `true`
- semantic fit:
  - accepts query: `true`
  - returns or promises web search results: `true` (`Exa Search - Neural search across the web`)
  - likely exposes title/url/snippet fields: `likely` (Exa search semantics suggest document result objects; exact field names not confirmed unpaid)
- caveat_objects:
  - request-shape mismatch risk: canonical `limit` may need mapping to Exa `numResults`
  - no unpaid payload example of final result schema
- conclusion:
  - candidate/unproven: `candidate`
  - verified/unproven: `verified` (route+method+402+query requirement), `unproven` (exact output normalization)
  - rejected: `false`

## Route 2
- provider: StableEnrich
- endpoint: `https://stableenrich.dev/api/firecrawl/search`
- method: `POST`
- request shape:
  - required: `query` (string), `limit` (number, min 1, max 10)
- canonical input used:

```json
{"query":"x402 agent payments","limit":5}
```

- unpaid status evidence:
  - `POST` returned `HTTP/2 402`
  - response headers included `payment-required` and `www-authenticate: Payment ...`
  - wrong method check: `GET` returned `HTTP/2 405`
- payment challenge detected: `true`
- semantic fit:
  - accepts query: `true`
  - returns or promises web search results: `true` (`Firecrawl Search - Search the web`)
  - likely exposes title/url/snippet fields: `likely` (search-result semantics; exact field names not confirmed unpaid)
- caveat_objects:
  - `limit` max appears capped at `10`
  - exact published timestamp field mapping unknown without paid response
- conclusion:
  - candidate/unproven: `candidate`
  - verified/unproven: `verified` (route+method+402+shape includes query/limit), `unproven` (exact output normalization)
  - rejected: `false`

## Route 3
- provider: Perplexity AI API
- endpoint: `https://pplx.x402.paysponge.com/search`
- method: `POST`
- request shape:
  - required: `query`
  - optional: `max_results` (1-20), recency/language/domain filters
  - note: canonical `limit` likely maps to `max_results`
- canonical input used:

```json
{"query":"x402 agent payments","limit":5}
```

- unpaid status evidence:
  - `POST` returned `HTTP/2 402`
  - response headers included `payment-required`
  - body included x402 challenge plus schema with required `query`
  - wrong method check: `GET` returned `HTTP/2 404` (`Endpoint not found`)
- payment challenge detected: `true`
- semantic fit:
  - accepts query: `true`
  - returns or promises web search results: `true` (`Search the Web`)
  - likely exposes title/url/snippet fields: `likely` (search endpoint semantics; exact response schema not proven unpaid)
- caveat_objects:
  - canonical `limit` field name mismatch (`max_results` expected)
  - response may include broader AI-enriched fields requiring deterministic normalization
- conclusion:
  - candidate/unproven: `candidate`
  - verified/unproven: `verified` (route+method+402+query-required), `unproven` (exact result object fields)
  - rejected: `false`

## Route 4
- provider: StableEnrich (Serper)
- endpoint: `https://stableenrich.dev/api/serper/news`
- method: `POST`
- request shape:
  - required: `q`
  - optional: `num`, `gl`, `hl`, `location`
- canonical input used:

```json
{"q":"x402 agent payments","num":5}
```

- unpaid status evidence:
  - `POST` returned `HTTP/2 402`
  - response headers included `payment-required` and `www-authenticate: Payment ...`
- payment challenge detected: `true`
- semantic fit:
  - accepts query: `true` (as `q`)
  - returns or promises web search results: `partial` (explicitly Google News search, not generic web)
  - likely exposes title/url/snippet fields: `likely`
- caveat_objects:
  - lane is news-specific, may bias benchmark intent away from general web search
  - canonical fields differ (`q`/`num`)
- conclusion:
  - candidate/unproven: `unproven`
  - verified/unproven: `verified` (route+method+402), `unproven` (fit for generic web-search intent)
  - rejected: `true` (for this benchmark intent)

## Excluded classes (per task constraints)
- StableEnrich `api/reddit/search`: rejected (Reddit-only)
- StableEnrich Google Maps routes: rejected (maps/place search)
- StableEnrich scrape/crawl-only routes (`api/firecrawl/scrape`, `api/cloudflare/crawl`): rejected (not direct search results lane)
- Perplexity chat/agent routes (`/v1/sonar`, `/v1/agent`, async sonar): rejected (AI chat semantics, not direct web search results endpoint)

## Recommendation for benchmark lane
- Primary graduation candidates:
  1. StableEnrich `api/firecrawl/search` (best request-shape alignment with canonical `query` + `limit`)
  2. StableEnrich `api/exa/search` (strong semantics; requires parameter mapping `limit` -> `numResults`)
  3. Perplexity `search` (strong semantics; requires parameter mapping `limit` -> `max_results`)
- Current status: route viability verified via unpaid 402 probes; output-field normalization remains unproven until a paid execution is authorized.
