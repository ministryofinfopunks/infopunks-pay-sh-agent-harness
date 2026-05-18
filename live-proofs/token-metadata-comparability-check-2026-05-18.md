# Token Metadata Comparability Check (2026-05-18)

## 1. Summary
Two routes are both metadata-capable, but they are not yet strictly equivalent for a normalized benchmark run because the current proven inputs identify assets differently:
- PaySponge route is proven on a network + token-address identity (`solana` + `So111...`).
- StableCrypto route is proven on a CoinGecko coin-id identity (`id: "usd-coin"`).

Result: comparability is **partially_comparable** and benchmark-ready is **false**.

## 2. Routes Compared
1. PaySponge CoinGecko
   - `GET https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112`
2. StableCrypto CoinGecko coin
   - `POST https://stablecrypto.dev/api/coingecko/coin`
   - Verified round-3 request body:
     - `{"id":"usd-coin","localization":false,"tickers":false,"market_data":false,"community_data":false,"developer_data":false,"sparkline":false}`

## 3. Canonical Asset Selected
Selected canonical target for strict comparability: **Wrapped SOL on Solana**.

Reason:
- Preferred by policy if both routes can represent it.
- PaySponge route is already proven directly on Wrapped SOL mint (`So111...`).
- StableCrypto `coingecko/coin` is coin-id keyed and can be mapped conceptually to Wrapped SOL via CoinGecko id, but this exact id-level execution is not yet proven in the current evidence set.

## 4. Input Compatibility Analysis
| Input mode | PaySponge CoinGecko (`/onchain/networks/{network}/tokens/{address}`) | StableCrypto CoinGecko coin (`/api/coingecko/coin`) | Compatibility |
|---|---|---|---|
| network + token address | Native required shape (`network`, `address` in path) | Not native; requires coin-id first then chain/address extraction from payload | Partial (adapter required) |
| coin id | Not native in route input | Native required shape (`id`) | Partial (reverse mapping required) |
| contract address | Native as token address path param | Not input-native for this route; appears in output metadata | Partial |
| symbol | Not direct input for this proven route | Not direct input for this proven route | Weak |
| chain | Native (`network`) | Indirect via platform/chain subfields in output | Partial |

Conclusion on inputs: same asset identity intent is possible, but **query shape is not equivalent without a normalization adapter** (`coin_id <-> network+address`).

## 5. Output Field Overlap Table
| Normalized field | PaySponge observed | StableCrypto observed | Overlap quality |
|---|---|---|---|
| `name` | yes (`Wrapped SOL`) | yes (`USDC` in proven round-3 run) | strong |
| `symbol` | yes (`SOL`) | yes (`usdc`) | strong |
| `address` | yes (`data.attributes.address`) | yes (`detail_platforms.*.contract_address` / `platforms`) | strong (with chain selection rule) |
| `network` | yes (route network + id prefix) | yes (platform keys) | strong (with canonical chain rule) |
| `decimals` | yes (`data.attributes.decimals`) | yes (`detail_platforms.*.decimal_place`) | strong |
| `image_url` | yes (`data.attributes.image_url`) | yes (`image.thumb/small/large`) | strong |
| `source_id` | possible (`coingecko_id` when present in attributes) | yes (`id`) | medium (PaySponge may be optional) |

## 6. Proposed Normalized Schema
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

Feasible normalization rules:
- For PaySponge:
  - `address = data.attributes.address ?? null`
  - `network = <path network> ?? null`
  - `decimals = data.attributes.decimals ?? null`
  - `image_url = data.attributes.image_url ?? null`
  - `source_id = data.attributes.coingecko_id ?? null`
- For StableCrypto (`coingecko/coin`):
  - Choose one canonical chain (e.g., `solana`), then:
  - `address = detail_platforms[chain].contract_address ?? platforms[chain] ?? null`
  - `network = chain`
  - `decimals = detail_platforms[chain].decimal_place ?? null`
  - `image_url = image.large ?? image.small ?? image.thumb ?? null`
  - `source_id = id ?? null`

## 7. Comparability Classification
**partially_comparable**

Why:
- Both routes can emit overlapping token metadata fields.
- But proven runs currently do not share the same asset identity query shape or canonical asset proof.
- Deterministic identity normalization is still required before fair benchmark execution.

## 8. Benchmark-Ready
**false**

## 9. Caveats
- Current StableCrypto proven run is `id: "usd-coin"`, while PaySponge proven run is Wrapped SOL mint on Solana.
- No shared canonical-asset paid proof pair is present yet.
- Chain/address selection policy for multi-chain coin payloads must be fixed before benchmarking.
- This check does not run any 5-run benchmark, does not create benchmark artifacts, does not modify Radar, and does not claim a winner.

## 10. Recommended Next Step
Run one normalization-gating step before benchmarking:
1. Prove StableCrypto `POST /api/coingecko/coin` on the canonical Wrapped SOL coin id (or another agreed canonical id), then extract `solana` chain fields using a fixed adapter.
2. Lock the adapter contract (`coin_id -> canonical network/address`) in the lane docs.
3. If that passes, proceed to the **5-run normalized token metadata benchmark**.
