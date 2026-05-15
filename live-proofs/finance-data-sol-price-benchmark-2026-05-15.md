# SOL Price Benchmark Artifact

- benchmark_id: finance-data-sol-price
- intent: get SOL price
- generated_at: 2026-05-15T19:26:14.110Z
- winner_claimed: false

| provider_id | route | success | transport | cli_exit_code | status_code | status_evidence | latency_ms | extracted_price_usd | extraction_path | normalization_confidence | proof_reference |
|---|---|---:|---|---:|---:|---|---:|---:|---|---|---|
| merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/price | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 6250 | 89.55 | solana.usd | high | live-proofs/stablecrypto-harness-pay-cli-2026-05-12.md |
| paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | true | pay_cli | 0 |  | pay_cli exit code 0 and parsed response body | 7502 | 89.76711861343956 | data[sol_usdc].attributes.base_token_price_usd | high | live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md |

- notes: Prices are comparable but no route winner is claimed until benchmark criteria are finalized. Price difference recorded. No winner claimed.
