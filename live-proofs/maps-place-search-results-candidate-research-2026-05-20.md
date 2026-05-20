# Candidate Research: maps-place-search-results (2026-05-20)

## Scope
- benchmark_id: `maps-place-search-results`
- category: `maps`
- intent: search for the same local/place query and return normalized place candidates
- canonical input:
  ```json
  {
    "query": "coffee near Union Square San Francisco",
    "location": "Union Square, San Francisco, CA",
    "limit": 5
  }
  ```
- alternative canonical input (if needed):
  ```json
  {
    "query": "restaurants near Eiffel Tower Paris",
    "location": "Eiffel Tower, Paris, France",
    "limit": 5
  }
  ```
- paid execution: **not performed**
- probe mode: **unpaid only**

## Candidate 1
- provider: `solana-foundation/google/places`
- endpoint: `https://places.google.gateway-402.com/v1/places:searchText`
- method: `POST`

### request shape
From `~/.config/pay/skills/detail/11d60fbc9c7e5c28.json`:
- Core query input:
  - `textQuery` (required string)
- Limit/paging:
  - `maxResultCount` (supported)
  - `pageToken` (supported)
- Location/nearby controls:
  - `locationBias` (circle/rectangle)
  - `locationRestriction` (circle/rectangle)
  - `radius` via circle payload in bias/restriction shapes
- Nearby route also exists:
  - `POST /v1/places:searchNearby`

### canonical input feasibility
- `query` maps to `textQuery`: **yes**
- `location` text maps directly: **partial** (needs geocode or structured `locationBias`/`locationRestriction`)
- `limit` maps to `maxResultCount`: **yes**

### unpaid status evidence
- `POST /v1/places:searchText` (no payment) returned `HTTP/2 402` with `www-authenticate: Payment ...` and JSON body `"error":"payment_required"`.
- Wrong-method check `GET /v1/places:searchText` returned `HTTP/2 400` (non-payment Google API argument error), confirming route is live but method/shape-sensitive.

### payment challenge detected
- `true`

### semantic fit
- accepts query/location: `true` (query direct, location via bias/restriction objects)
- returns place candidates: `true`
- likely exposes `name/address/rating/reviews/lat/lng/category/website/phone`: `true` (provider docs and schema include rich Places details, field-mask dependent)

### caveat_objects
- Requires Google field-mask behavior; response completeness depends on requested fields.
- Canonical `location` string likely needs geocoding/adapter translation for strict nearby biasing.
- Nearby route (`searchNearby`) is coordinate-first rather than free-text location-first.

### conclusion
- candidate/unproven: `candidate`
- verified/unproven: `verified` (existence + unpaid 402 + method sensitivity + schema fit)
- rejected: `false`

---

## Candidate 2
- provider: `paysponge/tripadvisor`
- endpoint: `https://tripadvisor.x402.paysponge.com/api/v1/location/search`
- method: `GET`

### request shape
From `~/.config/pay/skills/detail/34ed5fa79722e4a5.json`:
- Search routes:
  - `GET /api/v1/location/search`
  - `GET /api/v1/location/nearby_search`
- Detail routes also exist but excluded as primary benchmark route:
  - `/api/v1/location/:locationId/details`
  - `/api/v1/location/:locationId/reviews`
  - `/api/v1/location/:locationId/photos`
- Parameter schema in OpenAPI is minimal; exact query keys are less explicit than other providers.

### canonical input feasibility
- `query` text: **likely yes** (location search route exists for text search)
- `location` text: **likely yes** for `location/search`; nearby may need lat/lng
- `limit`: **unproven** (not explicit in exposed schema)

### unpaid status evidence
- `GET /api/v1/location/search?...` (no payment) returned `HTTP/2 402` with `payment-required` payload and x402 challenge object.
- `GET /api/v1/location/nearby_search?...` (no payment) returned `HTTP/2 402` with `payment-required` payload and x402 challenge object.

### payment challenge detected
- `true`

### semantic fit
- accepts query/location: `likely true` (search + nearby routes both present)
- returns place candidates: `likely true` (Tripadvisor location search semantics)
- likely exposes `name/address/rating/reviews/lat/lng/category/website/phone`: `partial/likely`
  - Details/reviews/photos routes strongly imply rich place objects.
  - Exact location search response contract is less explicit in current minimal OpenAPI.

### caveat_objects
- Query parameter schema is under-specified in local OpenAPI; adapter assumptions required.
- Candidate quality may skew to travel venues (hotels/restaurants/attractions) rather than broad local POIs.
- `limit` control not clearly documented in the exposed schema snapshot.

### conclusion
- candidate/unproven: `candidate`
- verified/unproven: `verified` (existence + unpaid 402 + method correctness)
- rejected: `false`

---

## Candidate 3
- provider: `merit-systems/stableenrich/enrichment`
- endpoint: `https://stableenrich.dev/api/google-maps/text-search/partial`
- method: `POST`

### request shape
From `~/.config/pay/skills/detail/32f0afdaade13c61.json` and embedded 402 schema:
- Text search route:
  - `POST /api/google-maps/text-search/partial` (also `/full`)
  - Supports `textQuery`, `maxResultCount`, optional `locationBias` circle, filters
- Nearby route:
  - `POST /api/google-maps/nearby-search/partial` (also `/full`)
  - Supports `locationRestriction.circle.center.{latitude,longitude}` + `radius`, `maxResultCount`

### canonical input feasibility
- `query` maps to `textQuery`: **yes**
- `location` text: **partial** (needs geocode for strict nearby; optional text bias in query still works)
- `limit` maps to `maxResultCount`: **yes** (bounded to max 5 in partial route schema)

### unpaid status evidence
- `POST /api/google-maps/text-search/partial` (no payment) returned `HTTP/2 402` with `payment-required` and `www-authenticate: Payment ...`.
- `POST /api/google-maps/nearby-search/partial` (no payment) returned `HTTP/2 402` with `payment-required` and `www-authenticate: Payment ...`.

### payment challenge detected
- `true`

### semantic fit
- accepts query/location: `true` (query direct; nearby via coordinates/radius)
- returns place candidates: `true`
- likely exposes `name/address/rating/reviews/lat/lng/category/website/phone`: `true` (Google Maps-backed routes; `partial` excludes some heavy fields unless requested/available)

### caveat_objects
- `location` string in canonical input may require geocoding when strict nearby radius semantics are needed.
- `partial` route’s `maxResultCount` cap and reduced field set may affect comparability with richer routes.
- Wrapper-level schema in payment challenge can be stricter than high-level prose docs; adapter should follow strict schema.

### conclusion
- candidate/unproven: `candidate`
- verified/unproven: `verified` (existence + unpaid 402 + method + schema compatibility)
- rejected: `false`

---

## Summary Assessment
- High-probability comparable pair for a benchmark lane:
  - `solana-foundation/google/places` (`searchText`/`searchNearby`)
  - `merit-systems/stableenrich/enrichment` (`google-maps/text-search` and `nearby-search`)
- `paysponge/tripadvisor` remains promising, but request/response shape is less explicit and may need extra adapter discovery before strict comparability.
- No paid executions were run.
