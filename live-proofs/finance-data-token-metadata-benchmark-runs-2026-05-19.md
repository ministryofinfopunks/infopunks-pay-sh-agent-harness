# Finance Data Token Metadata Benchmark Runs (2026-05-19)

- benchmark_id: `finance-data-token-metadata`
- benchmark_intent: `Return token metadata for Wrapped SOL on Solana`
- generated_at: `2026-05-19`

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
  "source_id": "string | null",
  "network_source": "payload | route_context | missing",
  "caveat": "route_context_inferred_network | null"
}
```

## Route-Context Network Inference Note
Network normalization used deterministic precedence:
1. payload network first
2. route context via `/networks/{network}/...` second
3. null otherwise

For PaySponge onchain token route, this run set resolved:
- `network = solana`
- `network_source = route_context`
- `caveat = route_context_inferred_network`

## 5-Run Results
| route_id | run_number | success | cli_exit_code | status_code | status_evidence | latency_ms | normalized_metadata_detected | canonical_address_match | canonical_network_match | canonical_decimals_match | network_source | caveat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| paysponge-coingecko-onchain-token | 1 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5530 | true | true | true | true | route_context | route_context_inferred_network |
| paysponge-coingecko-onchain-token | 2 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5730 | true | true | true | true | route_context | route_context_inferred_network |
| paysponge-coingecko-onchain-token | 3 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5270 | true | true | true | true | route_context | route_context_inferred_network |
| paysponge-coingecko-onchain-token | 4 | true | 0 | null | pay_cli exit code 0 and parsed response body | 4520 | true | true | true | true | route_context | route_context_inferred_network |
| paysponge-coingecko-onchain-token | 5 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5430 | true | true | true | true | route_context | route_context_inferred_network |
| stablecrypto-coingecko-coin | 1 | true | 0 | null | pay_cli exit code 0 and parsed response body | 4800 | true | true | true | true | payload | null |
| stablecrypto-coingecko-coin | 2 | true | 0 | null | pay_cli exit code 0 and parsed response body | 4610 | true | true | true | true | payload | null |
| stablecrypto-coingecko-coin | 3 | true | 0 | null | pay_cli exit code 0 and parsed response body | 4760 | true | true | true | true | payload | null |
| stablecrypto-coingecko-coin | 4 | true | 0 | null | pay_cli exit code 0 and parsed response body | 4590 | true | true | true | true | payload | null |
| stablecrypto-coingecko-coin | 5 | true | 0 | null | pay_cli exit code 0 and parsed response body | 5360 | true | true | true | true | payload | null |

## Aggregate Metrics
| provider_id | route_id | success_count | failure_count | median_latency_ms | p95_latency_ms | normalized_metadata_detection_rate | canonical_address_match_rate | canonical_network_match_rate | canonical_decimals_match_rate | network_source_distribution | status_code | status_evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| paysponge-coingecko | paysponge-coingecko-onchain-token | 5 | 0 | 5430 | 5730 | 1.0 | 1.0 | 1.0 | 1.0 | route_context=5 | null | pay_cli exit code 0 and parsed response body |
| merit-systems-stablecrypto-market-data | stablecrypto-coingecko-coin | 5 | 0 | 4760 | 5360 | 1.0 | 1.0 | 1.0 | 1.0 | payload=5 | null | pay_cli exit code 0 and parsed response body |

## Comparison Against Previous Artifact
- `2026-05-18` PaySponge `canonical_network_match_rate`: `0.0`
- `2026-05-19` PaySponge `canonical_network_match_rate`: `1.0`
- Interpretation: route-context normalization now captures Solana network for PaySponge and closes the previous network-match gap.
- Historical caveat policy: old `2026-05-18` caveat remains unchanged; this new artifact records the post-normalization state.

## Winner
- winner_status: `no_clear_winner`
- winner_claimed: `false`

## Caveats
- `pay_cli` did not expose explicit HTTP status in these runs (`status_code: null`), so status evidence is based on CLI exit code and parseable response body.
- No HTTP `200` is inferred or claimed from `pay_cli` output.
- PaySponge network match is achieved via deterministic route-context inference and explicitly marked with `route_context_inferred_network` caveat.
- This benchmark run does not modify Radar.

## Next Radar Ingestion Recommendation
- Ingest this artifact as a second token metadata history artifact to preserve evolution from pre-normalization (`2026-05-18`) to post-normalization (`2026-05-19`) behavior.
- Keep both artifacts in Radar History v3 lineage; do not overwrite prior caveated evidence.
- Preserve `winner_status: no_clear_winner` and `winner_claimed: false` until explicit scoring policy is defined.
