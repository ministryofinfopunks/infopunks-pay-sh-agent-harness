# Finance Data Token Search Benchmark Artifact

- benchmark_id: finance-data-token-search
- intent: token search
- canonical_query: SOL
- generated_at: 2026-05-17T02:39:22.786Z
- total_runs: 5
- winner_claimed: false
- winner_status: no_clear_winner

## Per-Run Route Results

| run_number | generated_at | provider_id | route | success | execution_transport | cli_exit_code | status_code | status_evidence | latency_ms | canonical_query | token_search_result_detected | response_shape_classified | normalization_confidence | extraction_path | semantic_detection_path | proof_reference | error_summary |
|---:|---|---|---|---:|---|---:|---:|---|---:|---|---:|---|---|---|---|---|---|
| 1 | 2026-05-17T02:38:01.027Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/onchain/search | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 9946 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md |  |
| 1 | 2026-05-17T02:38:01.027Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 10545 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md |  |
| 2 | 2026-05-17T02:38:21.520Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/onchain/search | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 7987 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md |  |
| 2 | 2026-05-17T02:38:21.520Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 10463 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md |  |
| 3 | 2026-05-17T02:38:39.971Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/onchain/search | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 5782 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md |  |
| 3 | 2026-05-17T02:38:39.971Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 8023 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md |  |
| 4 | 2026-05-17T02:38:53.777Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/onchain/search | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 5153 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md |  |
| 4 | 2026-05-17T02:38:53.777Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 8533 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md |  |
| 5 | 2026-05-17T02:39:07.464Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/onchain/search | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 7048 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md |  |
| 5 | 2026-05-17T02:39:07.464Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 8272 | SOL | true | pool_search_results | high | data[].attributes | json_string_scan:data | live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md |  |

## Aggregate Metrics

| provider_id | success_rate | completed_runs | failed_runs | median_latency_ms | p95_latency_ms | token_search_detection_rate | dominant_response_shape | normalization_confidence_summary | paid_execution_success_count | status_evidence_summary |
|---|---:|---:|---:|---:|---:|---:|---|---|---:|---|
| merit-systems-stablecrypto-market-data | 1 | 5 | 0 | 7048 | 9946 | 1 | pool_search_results | high:5, medium:0, low:0, failed:0 | 5 | pay_cli exit code 0 and parsed response body |
| paysponge-coingecko | 1 | 5 | 0 | 8533 | 10545 | 1 | pool_search_results | high:5, medium:0, low:0, failed:0 | 5 | pay_cli exit code 0 and parsed response body |

## Proof References

- live-proofs/stablecrypto-token-search-paid-execution-2026-05-17.md
- live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md

## Notes

- Token-search benchmark recorded. No route winner is claimed. Scoring thresholds are not finalized.
- Token-search benchmark recorded. No route winner is claimed. Scoring thresholds are not finalized.
