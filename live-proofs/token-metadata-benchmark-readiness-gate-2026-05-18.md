# Token Metadata Benchmark Readiness Gate (2026-05-18)

## Benchmark
- benchmark_id: `finance-data-token-metadata`
- gate_date: `2026-05-18`
- benchmark_artifact_created: `false`
- radar_modified: `false`
- winner_claimed: `false`

## Canonical Benchmark Intent
`return token metadata for Wrapped SOL on Solana`

## Canonical Asset
- name: `Wrapped SOL`
- symbol: `SOL`
- network: `solana`
- address: `So11111111111111111111111111111111111111112`
- stablecrypto_source_id: `wrapped-solana`

## Routes Considered
1. PaySponge CoinGecko token metadata route
   - `GET /x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112`
2. StableCrypto CoinGecko coin route
   - `POST /api/coingecko/coin`
   - canonical request body: `{"id":"wrapped-solana"}`

## Evidence References
- `live-proofs/paysponge-coingecko-token-metadata-verification-2026-05-18.md`
- `live-proofs/stablecrypto-wrapped-sol-coin-id-verification-2026-05-18.md`
- `live-proofs/token-metadata-normalization-adapter-proof-2026-05-18.md`
- `live-proofs/token-metadata-comparability-check-2026-05-18.md`

## Normalized Output Schema
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

## Gate Checks
1. both routes verified/proven: `pass`
- PaySponge proven on canonical Solana mint route for Wrapped SOL.
- StableCrypto proven on canonical coin-id route with `id=wrapped-solana`, including Solana contract address and decimals.

2. both map to same canonical asset: `pass`
- PaySponge token address: `So11111111111111111111111111111111111111112`.
- StableCrypto extracted `detail_platforms.solana.contract_address`: `So11111111111111111111111111111111111111112`.
- StableCrypto extracted `detail_platforms.solana.decimal_place`: `9`.

3. enough overlapping metadata fields: `pass`
- Overlap confirmed across: `name`, `symbol`, `address`, `network`, `decimals`, `image_url`, `source_id`.
- Deterministic normalization mapping is defined for both routes.

4. no winner inferred: `pass`
- This gate only assesses readiness to benchmark and does not infer or claim route superiority.

## Readiness Decision
- benchmark_ready: `true`

## Caveats
- Paid `pay` CLI evidence relies on successful execution and parseable payloads; paid HTTP status lines are not always surfaced.
- StableCrypto canonical mapping must stay locked to `id=wrapped-solana` for this benchmark intent.
- This artifact is a gate decision only; it is not a benchmark run artifact.

## Recommended Next Step
Run 5-run normalized token metadata benchmark.
