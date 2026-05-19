# StableSocial Reddit Search Shape Diagnostic

- generated_at: 2026-05-19T06:50:53.842Z
- benchmark_id: social-data-reddit-post-search
- provider: StableSocial
- provider_id: merit-systems/stablesocial/social-data
- endpoint: https://stablesocial.dev/api/reddit/search
- method: POST
- canonical_input: {"query":"x402","limit":5}

## Candidate Body Variants Tested
- A: {"keywords":"x402","max_posts":5}
- B: {"keywords":["x402"],"max_posts":5}
- C: {"keywords":"x402","max_page_size":5}
- D: {"keywords":["x402"],"max_page_size":5}
- E: {"query":"x402","max_posts":5}
- F: {"keyword":"x402","max_posts":5}

## Unpaid Status Evidence
- A: status_code=402 payment_challenge_detected=true has_www_authenticate=true content_type=application/json status_evidence=status_code_observed_402
- B: status_code=402 payment_challenge_detected=true has_www_authenticate=true content_type=application/json status_evidence=status_code_observed_402
- C: status_code=402 payment_challenge_detected=true has_www_authenticate=true content_type=application/json status_evidence=status_code_observed_402
- D: status_code=402 payment_challenge_detected=true has_www_authenticate=true content_type=application/json status_evidence=status_code_observed_402
- E: status_code=402 payment_challenge_detected=true has_www_authenticate=true content_type=application/json status_evidence=status_code_observed_402
- F: status_code=402 payment_challenge_detected=true has_www_authenticate=true content_type=application/json status_evidence=status_code_observed_402
- unpaid_compatibility_conclusion: all variants returned 402 with payment challenge; request-shape compatibility remains payment-gated and semantically unproven.

## Paid Retry
- paid_retry_attempted: true
- selected_paid_body_variant: A
- selected_paid_body: {"keywords":"x402","max_posts":5}
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"query":"x402","result_count":null,"posts":[],"search_success":false,"query_match":null,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"query_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response does not echo query text; query match could not be confirmed."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit result count."},{"code":"no_posts_returned","severity":"warning","affects_core_semantics":true,"detail":"Paid response included zero posts."},{"code":"reddit_search_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Paid execution did not produce recognizable Reddit post objects."}],"evidence_health":"degraded"}
- result_count: null
- search_success: false
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"query_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response does not echo query text; query match could not be confirmed."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit result count."},{"code":"no_posts_returned","severity":"warning","affects_core_semantics":true,"detail":"Paid response included zero posts."},{"code":"reddit_search_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Paid execution did not produce recognizable Reddit post objects."}]
- evidence_health: degraded
- route_state: candidate/unproven
- blocker: paid_execution_succeeded_but_no_posts_returned
- recommendation: keep StableSocial as candidate/unproven and use alternate second Reddit/search route or keep scaffold.

No 5-run benchmark artifact generated.
No benchmark recorded claim.
No winner claim.
