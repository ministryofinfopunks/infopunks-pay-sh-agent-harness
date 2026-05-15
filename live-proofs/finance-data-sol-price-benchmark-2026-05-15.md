# SOL Price Benchmark Artifact

- benchmark_id: finance-data-sol-price
- intent: get SOL price
- generated_at: 2026-05-15T19:19:09.156Z
- winner_claimed: false

| provider_id | route | success | status_code | latency_ms | extracted_price_usd | extraction_path | normalization_confidence | proof_reference |
|---|---|---:|---:|---:|---:|---|---|---|
| merit-systems-stablecrypto-market-data | POST https://stablecrypto.dev/api/coingecko/price | false |  | 0 |  | solana.usd | failed | live-proofs/stablecrypto-harness-pay-cli-2026-05-12.md |
| paysponge-coingecko | GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL | false |  | 0 |  | data[0].attributes.base_token_price_usd | failed | live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md |

- notes: Prices are comparable but no route winner is claimed until benchmark criteria are finalized.
