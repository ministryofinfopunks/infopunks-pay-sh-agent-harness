# SOL Price Benchmark Artifact

- benchmark_id: finance-data-sol-price
- intent: get SOL price
- generated_at: 2026-05-16T07:42:42.271Z
- winner_claimed: false
- total_runs: 5

## Per-Run Route Results

| run_number | generated_at | provider_id | route | success | transport | cli_exit_code | status_code | status_evidence | latency_ms | extracted_price_usd | extraction_path | normalization_confidence | proof_reference |
|---:|---|---|---|---:|---|---:|---:|---|---:|---:|---|---|---|
| 1 | 2026-05-16T07:41:35.630Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/price | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 6469 | 87.57 | solana.usd | high | live-proofs/stablecrypto-harness-pay-cli-2026-05-12.md |
| 1 | 2026-05-16T07:41:35.630Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 7173 | 87.50332626375734 | data[sol_usdc].attributes.base_token_price_usd | high | live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md |
| 2 | 2026-05-16T07:41:49.275Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/price | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 5584 | 87.57 | solana.usd | high | live-proofs/stablecrypto-harness-pay-cli-2026-05-12.md |
| 2 | 2026-05-16T07:41:49.275Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 7761 | 87.50332626375734 | data[sol_usdc].attributes.base_token_price_usd | high | live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md |
| 3 | 2026-05-16T07:42:02.621Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/price | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 5928 | 87.57 | solana.usd | high | live-proofs/stablecrypto-harness-pay-cli-2026-05-12.md |
| 3 | 2026-05-16T07:42:02.621Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 7946 | 87.50332626375734 | data[sol_usdc].attributes.base_token_price_usd | high | live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md |
| 4 | 2026-05-16T07:42:16.495Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/price | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 5444 | 87.57 | solana.usd | high | live-proofs/stablecrypto-harness-pay-cli-2026-05-12.md |
| 4 | 2026-05-16T07:42:16.495Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 6751 | 87.50332626375734 | data[sol_usdc].attributes.base_token_price_usd | high | live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md |
| 5 | 2026-05-16T07:42:28.691Z | merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/price | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 5691 | 87.57 | solana.usd | high | live-proofs/stablecrypto-harness-pay-cli-2026-05-12.md |
| 5 | 2026-05-16T07:42:28.691Z | paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 7888 | 87.50629960363277 | data[sol_usdc].attributes.base_token_price_usd | high | live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md |

## Aggregate Metrics

| provider_id | success_rate | median_latency_ms | p95_latency_ms | average_price_usd | min_price_usd | max_price_usd | price_variance_percent | completed_runs | failed_runs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| merit-systems-stablecrypto-market-data | 1 | 5691 | 6469 | 87.57 | 87.57 | 87.57 | 0 | 5 | 0 |
| paysponge-coingecko | 1 | 7761 | 7946 | 87.50392093173244 | 87.50332626375734 | 87.50629960363277 | 0.0033979504504081403 | 5 | 0 |

- notes: Prices are comparable but no route winner is claimed until benchmark criteria are finalized. Price difference recorded. No winner claimed.
