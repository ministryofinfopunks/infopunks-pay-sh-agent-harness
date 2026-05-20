# Google Places SearchText Shape Diagnostic (2026-05-20)

- benchmark_id: `maps-place-search-results`
- provider_id: `solana-foundation/google/places`
- endpoint: `https://places.google.gateway-402.com/v1/places:searchText`
- method: `POST`
- canonical_input: `{"query":"coffee near Union Square San Francisco","location":"Union Square, San Francisco, CA","limit":5}`
- benchmark_artifact_created: `false`
- recorded_marked: `false`
- winner_claimed: `false`

## 1) Skill-detail inspection (`~/.config/pay/skills/detail/*.json`)

Matched skill detail file:
- `~/.config/pay/skills/detail/11d60fbc9c7e5c28.json`

Route metadata found:
- `fqn`: `solana-foundation/google/places`
- route path: `v1/places:searchText`
- operationId: `places.places.searchText`
- protocol: `mpp`
- pricing tier observed in route metadata: `$0.001 / request`

OpenAPI request schema (`GoogleMapsPlacesV1SearchTextRequest`) from `openapi_doc`:
- required request body field:
  - `textQuery` (required)
- optional request body fields relevant to this diagnostic:
  - `maxResultCount` (1..20)
  - `includedType`
  - `locationBias` (`circle` or `rectangle`)
  - `locationRestriction` (`rectangle`)

Headers / request shape evidence:
- `Content-Type: application/json` used for all variants.
- OpenAPI doc exposes query-level `fields` parameter.
- Route metadata did not expose a required gateway-specific `fieldMask` requirement.
- `X-Goog-FieldMask` was tested as an optional variant.

## 2) Unpaid request-shape variants (executed first)

All variants were executed unpaid using plain HTTP `curl` (no `pay` settlement):

1. `textQuery` only
2. `textQuery + maxResultCount`
3. `textQuery + maxResultCount + includedType: "cafe"`
4. `textQuery + maxResultCount + locationBias.circle` (Union Square center)
5. `textQuery + maxResultCount + locationBias.rectangle` (Union Square bounds)
6. wrong-shape canonical fields: `query/location/limit`
7. `textQuery + maxResultCount` with `?fields=places.displayName,places.formattedAddress,places.location`
8. `textQuery + maxResultCount` with `X-Goog-FieldMask: places.displayName,places.formattedAddress,places.location`

Observed unpaid result for every variant:
- HTTP status: `402`
- body shape: `{"error":"payment_required", ... "endpoint":{"method":"POST","path":"v1/places:searchText"}}`

Implication:
- Unpaid probing confirms endpoint reachability + paywall semantics.
- Unpaid probing does **not** validate payload correctness because even intentionally wrong shape (`query/location/limit`) also returns `402`.

## 3) Normalization (`normalizeMapsPlaceSearchResults`)

Each unpaid variant normalized with:
- `statusCode: 402`
- `statusEvidence: status_code_observed_402`
- `paidExecutionObserved: false`

Consistent normalized outcome across variants:
- `result_count: 0`
- `place_search_success: false`
- caveat codes:
  - `payment_required_confirmed_only`
  - `paid_payload_unobserved`
  - `result_count_missing`
  - `no_places_returned`
  - `query_unconfirmed`
  - `location_unconfirmed`

## 4) Paid retry gate and action

Environment gate requirement:
- `LIVE_PAYSH_EXECUTION=true`
- `PAYSH_EXECUTION_MODE=pay_cli`

Observed in this run:
- gate not satisfied (env vars not both present)

Paid retry action:
- exactly one paid retry allowed by task only when gate is satisfied.
- executed in this run: `0` (skipped due to gate not satisfied).

Most likely corrected body for a future single paid retry:
```json
{
  "textQuery": "coffee near Union Square San Francisco",
  "maxResultCount": 5,
  "includedType": "cafe",
  "locationBias": {
    "circle": {
      "center": { "latitude": 37.78799, "longitude": -122.40744 },
      "radius": 1200
    }
  }
}
```

## Conclusion

- classification: `candidate/unproven`
- rationale: paid payload semantics were not observed in this run; unpaid checks only confirmed payment gating and route reachability.
- `verified/proven` requires one paid retry returning recognizable place objects.
