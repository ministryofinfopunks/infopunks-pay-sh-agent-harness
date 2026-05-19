# Data Web Search Results Benchmark Artifact

- benchmark_id: data-web-search-results
- category: web-search
- intent: search the web for the same query and return normalized search results
- generated_at: 2026-05-19T07:13:36.813Z
- canonical_input: {"query":"x402 agent payments","limit":5}
- canonical_input_hash: 4450c155e3267e4f7889be725d5c59346eaa84949a36809cbaa737fa76fb2f5d
- winner_status: no_clear_winner
- winner_claimed: false

## Route Summaries

- route_name: StableEnrich Exa Search
  provider_id: merit-systems/stableenrich/enrichment
  endpoint: https://stableenrich.dev/api/exa/search
  method: POST
- route_name: Perplexity Search
  provider_id: paysponge/perplexity
  endpoint: https://pplx.x402.paysponge.com/search
  method: POST

## Aggregate Metrics

| route_name | provider_id | attempted_runs | successful_runs | success_rate | search_success_rate | result_detection_rate | title_detection_rate | url_detection_rate | snippet_detection_rate | source_detection_rate | published_at_detection_rate | median_result_count | median_latency_ms | p95_latency_ms | evidence_health |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| StableEnrich Exa Search | merit-systems/stableenrich/enrichment | 5 | 5 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 5 | 4319 | 4509 | caveated |
| Perplexity Search | paysponge/perplexity | 5 | 5 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 5 | 5233 | 5705 | caveated |

## Run-Level Summaries

| run_number | route_name | paid_execution_succeeded | execution_transport | cli_exit_code | status_code | status_evidence | latency_ms | result_count | search_success | evidence_health |
|---:|---|---:|---|---:|---:|---|---:|---:|---:|---|
| 1 | StableEnrich Exa Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 4319 | 0.007 | true | caveated |
| 1 | Perplexity Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 4931 | 5 | true | caveated |
| 2 | StableEnrich Exa Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 3991 | 0.007 | true | caveated |
| 2 | Perplexity Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 5705 | 5 | true | caveated |
| 3 | StableEnrich Exa Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 4486 | 0.007 | true | caveated |
| 3 | Perplexity Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 5468 | 5 | true | caveated |
| 4 | StableEnrich Exa Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 4130 | 0.007 | true | caveated |
| 4 | Perplexity Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 5221 | 5 | true | caveated |
| 5 | StableEnrich Exa Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 4509 | 0.007 | true | caveated |
| 5 | Perplexity Search | true | pay_cli | 0 |  | pay_cli_exit_0_status_unavailable | 5233 | 5 | true | caveated |

## Structured Caveats

### StableEnrich Exa Search
- code: published_at_missing; occurrences: 5; highest_severity: warning
- code: query_unconfirmed; occurrences: 5; highest_severity: warning
- code: result_snippet_missing; occurrences: 5; highest_severity: warning
- code: result_title_missing; occurrences: 5; highest_severity: warning
- code: status_code_unavailable; occurrences: 5; highest_severity: warning
### Perplexity Search
- code: published_at_missing; occurrences: 5; highest_severity: warning
- code: query_unconfirmed; occurrences: 5; highest_severity: warning
- code: result_count_missing; occurrences: 5; highest_severity: warning
- code: status_code_unavailable; occurrences: 5; highest_severity: warning

No winner is claimed.
No route superiority is inferred.

