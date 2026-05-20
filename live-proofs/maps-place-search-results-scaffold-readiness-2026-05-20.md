# Scaffold Readiness: maps-place-search-results (2026-05-20)

- benchmark_id: `maps-place-search-results`
- canonical_input:
  ```json
  {
    "query": "coffee near Union Square San Francisco",
    "location": "Union Square, San Francisco, CA",
    "limit": 5
  }
  ```
- candidate_count: `3`
- comparable_candidate_count: `2`
- recommended_state: `scaffold_ready`

- recommended_candidates:
  - `solana-foundation/google/places` — `verified/unproven`, `candidate/unproven`
  - `merit-systems/stableenrich/enrichment` — `verified/unproven`, `candidate/unproven`

- rejected_or_blocked_candidates:
  - `paysponge/tripadvisor` — `verified/unproven`, `candidate/unproven` (blocked for strict comparability right now, not rejected)
    - blocker: local OpenAPI request/response schema is minimal and under-specified for search query params and result fields
    - blocker: `limit` control is not clearly documented in the exposed schema
    - blocker: semantic scope may skew toward travel categories (hotels/restaurants/attractions), which can reduce parity with broad local place-search coverage

- missing_requirements:
  - route-level adapter spec for canonical mapping (`query`, `location`, `limit`) to each selected provider payload
  - normalization contract for output fields (`name`, `address`, `rating`, `reviews`, `lat`, `lng`, `category`, `website`, `phone`) with fallback handling when fields are absent
  - geocoding/bias strategy for canonical text `location` when route requires coordinate-first nearby restrictions

- next_step:
  - Proceed with Radar scaffold using the two comparable candidates above; keep Tripadvisor as research-only backup pending deeper schema/shape validation.
