# Maps Place Search Results Paid Route Verification

- generated_at: 2026-05-20T17:15:22.282Z
- benchmark_id: maps-place-search-results
- canonical_input: {"query":"coffee near Union Square San Francisco","location":"Union Square, San Francisco, CA","limit":5}

## Google Places SearchText
- benchmark_id: maps-place-search-results
- provider: Google Places SearchText
- endpoint: https://places.google.gateway-402.com/v1/places:searchText
- method: POST
- canonical_input_hash: 0643d20a99e3aa47d3ca0f16bdc8ff5af7b2f888a5fa18f65ef6507c14333539
- canonical_input: {"query":"coffee near Union Square San Francisco","location":"Union Square, San Francisco, CA","limit":5}
- route_specific_body: {"textQuery":"coffee near Union Square San Francisco in Union Square, San Francisco, CA","maxResultCount":5}
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"query":"coffee near Union Square San Francisco","location":"Union Square, San Francisco, CA","result_count":0,"places":[],"place_search_success":false,"query_match":null,"location_match":null,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit place result count."},{"code":"no_places_returned","severity":"warning","affects_core_semantics":true,"detail":"Response included zero recognizable place candidates."},{"code":"query_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"No places available to confirm canonical query context."},{"code":"location_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"No places available to confirm canonical location context."},{"code":"place_search_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Paid execution did not produce recognizable place result objects."}],"evidence_health":"degraded"}
- result_count: 0
- place_search_success: false
- query_match: null
- location_match: null
- sample_normalized_place_fields: []
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit place result count."},{"code":"no_places_returned","severity":"warning","affects_core_semantics":true,"detail":"Response included zero recognizable place candidates."},{"code":"query_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"No places available to confirm canonical query context."},{"code":"location_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"No places available to confirm canonical location context."},{"code":"place_search_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Paid execution did not produce recognizable place result objects."}]
- evidence_health: degraded
- route_state: candidate/unproven

## StableEnrich Google Maps Text Search
- benchmark_id: maps-place-search-results
- provider: StableEnrich Google Maps Text Search
- endpoint: https://stableenrich.dev/api/google-maps/text-search/partial
- method: POST
- canonical_input_hash: 0643d20a99e3aa47d3ca0f16bdc8ff5af7b2f888a5fa18f65ef6507c14333539
- canonical_input: {"query":"coffee near Union Square San Francisco","location":"Union Square, San Francisco, CA","limit":5}
- route_specific_body: {"textQuery":"coffee near Union Square San Francisco in Union Square, San Francisco, CA","maxResultCount":5}
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"query":"coffee near Union Square San Francisco","location":"Union Square, San Francisco, CA","result_count":5,"places":[{"name":null,"address":null,"latitude":null,"longitude":null,"rating":null,"review_count":null,"category":"breakfast_restaurant","website":null,"phone":null,"source_url":null},{"name":null,"address":null,"latitude":null,"longitude":null,"rating":null,"review_count":null,"category":"coffee_shop","website":null,"phone":null,"source_url":null},{"name":null,"address":null,"latitude":null,"longitude":null,"rating":null,"review_count":null,"category":"coffee_shop","website":null,"phone":null,"source_url":null},{"name":null,"address":null,"latitude":null,"longitude":null,"rating":null,"review_count":null,"category":"cafe","website":null,"phone":null,"source_url":null},{"name":null,"address":null,"latitude":null,"longitude":null,"rating":null,"review_count":null,"category":"coffee_shop","website":null,"phone":null,"source_url":null}],"place_search_success":true,"query_match":true,"location_match":false,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit place result count."},{"code":"place_name_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more places are missing name."},{"code":"address_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing address."},{"code":"coordinates_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing coordinates."},{"code":"rating_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing rating."},{"code":"review_count_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing review count."},{"code":"website_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing website."},{"code":"phone_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing phone."},{"code":"location_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Place addresses did not clearly confirm canonical location context."}],"evidence_health":"degraded"}
- result_count: 5
- place_search_success: true
- query_match: true
- location_match: false
- sample_normalized_place_fields: [{"name":null,"address":null,"latitude":null,"longitude":null,"rating":null,"review_count":null,"category":"breakfast_restaurant","website":null,"phone":null,"source_url":null},{"name":null,"address":null,"latitude":null,"longitude":null,"rating":null,"review_count":null,"category":"coffee_shop","website":null,"phone":null,"source_url":null},{"name":null,"address":null,"latitude":null,"longitude":null,"rating":null,"review_count":null,"category":"coffee_shop","website":null,"phone":null,"source_url":null}]
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit place result count."},{"code":"place_name_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more places are missing name."},{"code":"address_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing address."},{"code":"coordinates_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing coordinates."},{"code":"rating_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing rating."},{"code":"review_count_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing review count."},{"code":"website_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing website."},{"code":"phone_missing","severity":"warning","affects_core_semantics":false,"detail":"One or more places are missing phone."},{"code":"location_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Place addresses did not clearly confirm canonical location context."}]
- evidence_health: degraded
- route_state: verified/proven

Excluded from paid proof: paysponge/tripadvisor.
No 5-run benchmark artifact generated.
No benchmark recorded claim.
