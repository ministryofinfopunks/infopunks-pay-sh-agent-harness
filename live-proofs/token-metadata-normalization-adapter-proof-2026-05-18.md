# Token Metadata Normalization Adapter Proof (2026-05-18)

## Canonical Asset
```json
{
  "name": "Wrapped SOL",
  "network": "solana",
  "address": "So11111111111111111111111111111111111111112",
  "symbol": "SOL"
}
```

## Compared Routes
1. PaySponge
   - `GET /x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112`
2. StableCrypto
   - `POST /api/coingecko/coin`
   - Request shape (verified round 3):
   ```json
   {
     "id": "<coin-id>",
     "localization": false,
     "tickers": false,
     "market_data": false,
     "community_data": false,
     "developer_data": false,
     "sparkline": false
   }
   ```

## Target Normalized Output
```json
{
  "name": "...",
  "symbol": "...",
  "address": "So11111111111111111111111111111111111111112",
  "network": "solana",
  "decimals": 9,
  "image_url": "...",
  "source_id": "..."
}
```

## PaySponge Normalized Output Fields
Deterministic extraction from proven Wrapped SOL run:
- `name = data.attributes.name`
- `symbol = data.attributes.symbol`
- `address = data.attributes.address`
- `network = "solana"` (fixed by route path segment)
- `decimals = data.attributes.decimals`
- `image_url = data.attributes.image_url`
- `source_id = data.attributes.coingecko_id ?? null`

Observed values from proven run:
- `name = "Wrapped SOL"`
- `symbol = "SOL"`
- `address = "So11111111111111111111111111111111111111112"`
- `network = "solana"`
- `decimals = 9`
- `image_url = present`
- `source_id = optional`

## StableCrypto Normalized Output Fields
Deterministic extraction rules from verified `coingecko/coin` payload shape:
- `name = name ?? null`
- `symbol = symbol ? symbol.toUpperCase() : null`
- `address = detail_platforms.solana.contract_address ?? platforms.solana ?? null`
- `network = address ? "solana" : null`
- `decimals = detail_platforms.solana.decimal_place ?? null`
- `image_url = image.large ?? image.small ?? image.thumb ?? null`
- `source_id = id ?? null`

This mapping is deterministic **only if** the selected coin-id payload includes a `solana` platform entry with contract address and decimals.

## Deterministic Extraction Rules (Adapter Contract)
1. Input to adapter:
   - PaySponge raw payload for canonical mint route.
   - StableCrypto raw payload for coin-id route.
2. StableCrypto chain lock:
   - Always select `solana` key from `detail_platforms` first, fallback to `platforms`.
3. Address lock:
   - Require extracted `address === "So11111111111111111111111111111111111111112"`.
4. Decimal lock:
   - Require extracted `decimals === 9`.
5. Symbol normalization:
   - Uppercase output symbol.
6. Acceptance:
   - Mark StableCrypto normalized pass only when rules 2-5 all pass.

## Missing Fields / Evidence Gaps
- Missing paid proof for StableCrypto `coingecko/coin` on a Wrapped SOL-specific coin-id.
- Missing proven `source_id` value for the canonical Wrapped SOL identity under StableCrypto.
- Missing proven evidence that StableCrypto coin-id payload for Wrapped SOL deterministically yields `solana` contract address `So111...11112` with `decimals = 9`.

## Ambiguity Risks
- Coin-id ambiguity: wrong id can return a different asset while still matching schema.
- Multi-chain ambiguity: a coin-id payload can include many chains; adapter must force `solana` only.
- Native-vs-wrapped ambiguity: some coin-ids may represent native SOL semantics rather than SPL wrapped mint identity.

## Final Normalization Classification
`normalization_partial`

Rationale:
- Deterministic adapter rules are defined.
- PaySponge side is proven on canonical Wrapped SOL mint.
- StableCrypto side is schema-proven but not yet canonical-asset-proven for Wrapped SOL coin-id output.

## Benchmark-Ready Decision
`benchmark-ready: false`

Reason:
Deterministic mapping to canonical Wrapped SOL identity is not yet proven end-to-end for StableCrypto on the required coin-id input.

## Recommended Next Step
Run one controlled paid proof for StableCrypto `POST /api/coingecko/coin` using the agreed Wrapped SOL coin-id, then apply the adapter contract above. If address/decimals/source-id lock passes deterministically, upgrade classification to `normalization_ready` and run the 5-run benchmark next.
