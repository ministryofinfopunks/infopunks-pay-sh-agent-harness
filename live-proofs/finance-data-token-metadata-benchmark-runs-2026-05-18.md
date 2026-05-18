# Finance Data Token Metadata Benchmark Runs (2026-05-18)

- benchmark_id: `finance-data-token-metadata`
- benchmark_intent: `Return token metadata for Wrapped SOL on Solana`
- generated_at: `2026-05-18T09:06:44.534Z`

## Canonical Asset
- name: `Wrapped SOL`
- network: `solana`
- address: `So11111111111111111111111111111111111111112`
- symbol: `SOL`
- decimals: `9`

## Routes Compared
1. `PaySponge CoinGecko`
- method: `GET`
- route: `https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112`

2. `StableCrypto CoinGecko coin`
- method: `POST`
- route: `https://stablecrypto.dev/api/coingecko/coin`
- body: `{"id":"wrapped-solana"}`

## Normalization Schema
```json
{
  "name": "string | null",
  "symbol": "string | null",
  "address": "string | null",
  "network": "string | null",
  "decimals": "number | null",
  "image_url": "string | null",
  "source_id": "string | null"
}
```

## 5-Run Results
| route_id | run_number | success | cli_exit_code | status_code | status_evidence | latency_ms | normalized_metadata_detected | canonical_address_match | canonical_network_match | canonical_decimals_match |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| paysponge-coingecko-onchain-token | 1 | true | 0 | null | pay_cli exit code 0 and parsed response body | 10307 | true | true | false | true |
| paysponge-coingecko-onchain-token | 2 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5159 | true | true | false | true |
| paysponge-coingecko-onchain-token | 3 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5827 | true | true | false | true |
| paysponge-coingecko-onchain-token | 4 | true | 0 | null | pay_cli exit code 0 and parsed response body | 7305 | true | true | false | true |
| paysponge-coingecko-onchain-token | 5 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5659 | true | true | false | true |
| stablecrypto-coingecko-coin | 1 | true | 0 | null | pay_cli exit code 0 and parsed response body | 4800 | true | true | true | true |
| stablecrypto-coingecko-coin | 2 | true | 0 | null | pay_cli exit code 0 and parsed response body | 4393 | true | true | true | true |
| stablecrypto-coingecko-coin | 3 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5004 | true | true | true | true |
| stablecrypto-coingecko-coin | 4 | true | 0 | null | pay_cli exit code 0 and parsed response body | 4982 | true | true | true | true |
| stablecrypto-coingecko-coin | 5 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5107 | true | true | true | true |

## Aggregate Metrics
| provider_id | route_id | success_count | failure_count | median_latency_ms | p95_latency_ms | normalized_metadata_detection_rate | canonical_address_match_rate | canonical_network_match_rate | canonical_decimals_match_rate | status_code | status_evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| paysponge-coingecko | paysponge-coingecko-onchain-token | 5 | 0 | 5827 | 10307 | 1.0 | 1.0 | 0.0 | 1.0 | null | pay_cli exit code 0 and parsed response body |
| merit-systems-stablecrypto-market-data | stablecrypto-coingecko-coin | 5 | 0 | 4982 | 5107 | 1.0 | 1.0 | 1.0 | 1.0 | null | pay_cli exit code 0 and parsed response body |

## Winner
- winner_status: `no_clear_winner`
- winner_claimed: `false`

## Caveats
- `pay_cli` did not expose explicit HTTP status in these runs (`status_code: null` throughout), so status evidence is based on cli exit code plus parsed body availability.
- No HTTP `200` is inferred or claimed from `pay_cli` output.
- For PaySponge route, normalized `network` field was not present in extracted payload path during these runs, reducing canonical network match rate despite canonical address/decimals match.
- This benchmark run did not modify Radar.

## Next Radar Ingestion Recommendation
- Ingest this artifact as benchmark evidence for `finance-data-token-metadata` with `benchmark_recorded` eligible to become `true` after Radar ingestion references this file.
- Preserve `winner_status: no_clear_winner` and `winner_claimed: false` until explicit scoring policy is defined.
