# Google Places Shape Diagnostic (2026-05-20)

- benchmark_id: maps-place-search-results
- canonical_input: {"query":"coffee near Union Square San Francisco","location":"Union Square, San Francisco, CA","limit":5}
- unpaid variants tested: ["textQuery+maxResultCount","textQuery+maxResultCount+includedType","textQuery+maxResultCount+locationBias.circle","textQuery+maxResultCount+locationBias.rectangle","simple-textQuery","textQuery+maxResultCount+fields-query-param"]
- selected_paid_retry_variant: textQuery+maxResultCount+includedType
- paid_retry_attempted: true
- paid_retry_count: 1
- endpoint: https://places.google.gateway-402.com/v1/places:searchText
- route_specific_body: {"textQuery":"coffee near Union Square San Francisco in Union Square, San Francisco, CA","maxResultCount":5,"includedType":"cafe"}

## Skill Metadata
- detail_file: /Users/ahdilm/.config/pay/skills/detail/11d60fbc9c7e5c28.json
- request_field_support: {"textQuery":true,"maxResultCount":true,"includedType":true,"locationBiasCircle":true,"locationBiasRectangle":true,"fieldsQueryParam":true,"xGoogFieldMaskHeader":false}

## Unpaid Probe Status Evidence
- textQuery+maxResultCount: status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- textQuery+maxResultCount+includedType: status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- textQuery+maxResultCount+locationBias.circle: status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- textQuery+maxResultCount+locationBias.rectangle: status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- simple-textQuery: status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- textQuery+maxResultCount+fields-query-param: status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402

## Paid Retry
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"query":"coffee near Union Square San Francisco","location":"Union Square, San Francisco, CA","result_count":0,"places":[],"place_search_success":false,"query_match":null,"location_match":null,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit place result count."},{"code":"no_places_returned","severity":"warning","affects_core_semantics":true,"detail":"Response included zero recognizable place candidates."},{"code":"query_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"No places available to confirm canonical query context."},{"code":"location_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"No places available to confirm canonical location context."},{"code":"place_search_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Paid execution did not produce recognizable place result objects."}],"evidence_health":"degraded"}
- result_count: 0
- place_search_success: false
- query_match: null
- location_match: null
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit place result count."},{"code":"no_places_returned","severity":"warning","affects_core_semantics":true,"detail":"Response included zero recognizable place candidates."},{"code":"query_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"No places available to confirm canonical query context."},{"code":"location_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"No places available to confirm canonical location context."},{"code":"place_search_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Paid execution did not produce recognizable place result objects."}]
- evidence_health: degraded
- route_state: candidate/unproven

## Guardrails
- benchmark_artifact_created: false
- benchmark_record_marked: false
- comparison_claim_made: false
- excluded_routes: ["stableenrich", "tripadvisor"]

## Conclusion
- conclusion: candidate/unproven
