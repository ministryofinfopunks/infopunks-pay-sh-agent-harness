# Data Web Search Results Paid Route Verification

- generated_at: 2026-05-19T00:00:00.000Z
- benchmark_id: data-web-search-results
- canonical_input: {"query":"x402 agent payments","limit":5}

## StableEnrich Exa Search
- benchmark_id: data-web-search-results
- provider: StableEnrich Exa Search
- endpoint: https://stableenrich.dev/api/exa/search
- method: POST
- canonical_input_hash: 4450c155e3267e4f7889be725d5c59346eaa84949a36809cbaa737fa76fb2f5d
- route_specific_body: {"query":"x402 agent payments","numResults":5}
- paid_execution_status: failed
- cli_exit_code: 1
- status_evidence: pay_cli_exit_1_status_unavailable
- normalized_output: {"query":"x402 agent payments","result_count":0,"results":[],"search_success":false,"query_match":null,"status_evidence":"pay_cli_exit_1_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"non_json_text_response","severity":"warning","affects_core_semantics":true,"detail":"Response payload was plain text and not structured JSON."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit result count."},{"code":"no_results_returned","severity":"warning","affects_core_semantics":true,"detail":"Paid response included zero search results."},{"code":"query_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response does not echo query text; query match could not be confirmed."}],"evidence_health":"unverified"}
- result_count: 0
- search_success: false
- sample normalized results: []
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"non_json_text_response","severity":"warning","affects_core_semantics":true,"detail":"Response payload was plain text and not structured JSON."},{"code":"result_count_missing","severity":"warning","affects_core_semantics":false,"detail":"Response does not expose an explicit result count."},{"code":"no_results_returned","severity":"warning","affects_core_semantics":true,"detail":"Paid response included zero search results."},{"code":"query_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response does not echo query text; query match could not be confirmed."}]
- evidence_health: unverified
- route_state: candidate/unproven

## Perplexity Search
- benchmark_id: data-web-search-results
- provider: Perplexity Search
- endpoint: https://pplx.x402.paysponge.com/search
- method: POST
- canonical_input_hash: 4450c155e3267e4f7889be725d5c59346eaa84949a36809cbaa737fa76fb2f5d
- route_specific_body: {"query":"x402 agent payments","max_results":5}
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: status_code_observed_200
- normalized_output: {"query":"x402 agent payments","result_count":1,"results":[{"title":"x402 docs","url":"https://x402.org/docs","snippet":"x402 payments","source":"x402.org","published_at":"2026-05-19"}],"search_success":true,"query_match":true,"status_evidence":"status_code_observed_200","raw_status_code":200,"caveat_objects":[],"evidence_health":"recorded"}
- result_count: 1
- search_success: true
- sample normalized results: [{"title":"x402 docs","url":"https://x402.org/docs","snippet":"x402 payments","source":"x402.org","published_at":"2026-05-19"}]
- caveat_objects: []
- evidence_health: recorded
- route_state: verified/proven

## StableEnrich Firecrawl Search
- benchmark_id: data-web-search-results
- provider: StableEnrich Firecrawl Search
- endpoint: https://stableenrich.dev/api/firecrawl/search
- method: POST
- canonical_input_hash: 4450c155e3267e4f7889be725d5c59346eaa84949a36809cbaa737fa76fb2f5d
- route_specific_body: {"query":"x402 agent payments","limit":5}
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: status_code_observed_200
- normalized_output: {"query":"x402 agent payments","result_count":1,"results":[{"title":"x402 docs","url":"https://x402.org/docs","snippet":"x402 payments","source":"x402.org","published_at":"2026-05-19"}],"search_success":true,"query_match":true,"status_evidence":"status_code_observed_200","raw_status_code":200,"caveat_objects":[],"evidence_health":"recorded"}
- result_count: 1
- search_success: true
- sample normalized results: [{"title":"x402 docs","url":"https://x402.org/docs","snippet":"x402 payments","source":"x402.org","published_at":"2026-05-19"}]
- caveat_objects: []
- evidence_health: recorded
- route_state: verified/proven

No 5-run benchmark artifact generated.
No benchmark recorded claim.
No winner claim.
