# Token Metadata Provider Research (2026-05-18)

## 1. Summary
- Scope: provider discovery and evidence classification for `finance-data-token-metadata` only.
- Paid execution: not attempted.
- Radar state changes: none.
- Result: 5 candidate routes documented (2 `verified/unproven`, 3 rejected by semantics).
- Token metadata intent target: endpoint should return token identity/descriptor fields (name, symbol, chain/network, contract/mint address, decimals, optional logo/tags).

## 2. Candidate Table

| provider | provider_id if known | category | service_url | candidate_route | method | input_shape | expected_metadata_fields | evidence_source | current_state | blocker | next_step |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CoinGecko Onchain DEX API | `paysponge/coingecko` | finance | `https://pro-api.coingecko.com/api/v3/x402/onchain` | `https://pro-api.coingecko.com/api/v3/x402/onchain/networks/{network}/tokens/{address}` | GET | path params: `network`, `address` (example: `solana`, `So11111111111111111111111111111111111111112`) | `name`, `symbol`, `network`, `address`, `decimals`, optional image/market attributes | Pay skills detail metadata + unpaid probe (`402`) | `verified/unproven` | Paid response body not yet observed for field confirmation | Run one controlled paid probe and extract field presence map |
| StableCrypto (Alchemy proxy) | `merit-systems/stablecrypto/market-data` | finance | `https://stablecrypto.dev` | `https://stablecrypto.dev/api/alchemy/token/token-metadata` | POST | JSON body: `{"network":"solana","contractAddress":"So11111111111111111111111111111111111111112"}` | `name`, `symbol`, `network`, `contractAddress`, `decimals`, optional logo/metadata | Pay skills detail metadata + unpaid probe (`402`) | `verified/unproven` | Paid response body not yet observed for field confirmation | Run one controlled paid probe and extract field presence map |
| CoinGecko Onchain DEX API | `paysponge/coingecko` | finance | `https://pro-api.coingecko.com/api/v3/x402/onchain` | `https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL` | GET | query param: `query` | search results (not canonical token metadata object) | Pay skills detail + unpaid probe (`402`) | `rejected/search-only` | Route semantics are discovery/search, not clean metadata lookup | Keep excluded from metadata lane |
| CoinGecko Onchain DEX API | `paysponge/coingecko` | finance | `https://pro-api.coingecko.com/api/v3/x402/onchain` | `https://pro-api.coingecko.com/api/v3/x402/onchain/simple/networks/{network}/token_price/{addresses}` | GET | path params: `network`, `addresses` | price snapshot fields | Pay skills detail + unpaid probe (`402`) | `rejected/price-only` | Price-only endpoint by documented semantics | Keep excluded from metadata lane |
| StableCrypto (Alchemy proxy) | `merit-systems/stablecrypto/market-data` | finance | `https://stablecrypto.dev` | `https://stablecrypto.dev/api/alchemy/prices/by-address` | POST | JSON body with token addresses | price fields | Pay skills detail + unpaid probe (`402`) | `rejected/price-only` | Price-only endpoint by documented semantics | Keep excluded from metadata lane |

## 3. Provider-by-Provider Evidence

### A. `paysponge/coingecko`
- Catalog/detail evidence:
  - Endpoint listed: `GET x402/onchain/networks/{network}/tokens/{address}` with description `Token Data by Token Address`.
  - Other listed endpoints include search/pools, token_price, trending_pools.
- Unpaid probes (2026-05-18):
  - `GET https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112`
  - Status: `402`
  - Body: `{"error":"Payment required","message":"Payment is required to access this resource"}`
  - 402 challenge exists: yes
  - Route semantics confirmed: metadata-intent path/method confirmed from provider detail + route shape; payload fields unproven without paid body.
  - Classification: `verified/unproven`.
- Unpaid probe (rejected/search-only):
  - `GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL`
  - Status: `402`; challenge exists: yes; semantics: search/pool discovery, not clean token metadata.
- Unpaid probe (rejected/price-only):
  - `GET https://pro-api.coingecko.com/api/v3/x402/onchain/simple/networks/solana/token_price/So11111111111111111111111111111111111111112`
  - Status: `402`; challenge exists: yes; semantics: price-only.

### B. `merit-systems/stablecrypto/market-data`
- Catalog/detail evidence:
  - Endpoint listed: `POST api/alchemy/token/token-metadata` with description `Get metadata for a token contract`.
  - Also lists `api/alchemy/prices/by-address` and other non-metadata token endpoints.
- Unpaid probe (candidate):
  - `POST https://stablecrypto.dev/api/alchemy/token/token-metadata`
  - Request body: `{"network":"solana","contractAddress":"So11111111111111111111111111111111111111112"}`
  - Status: `402`
  - Response body observed: empty in probe capture; `content-type: application/json`
  - 402 challenge exists: yes
  - Route semantics confirmed: metadata-intent path/method/body shape confirmed from provider detail + probe.
  - Classification: `verified/unproven`.
- Unpaid probe (rejected/price-only):
  - `POST https://stablecrypto.dev/api/alchemy/prices/by-address`
  - Request body: `{"network":"solana","addresses":["So11111111111111111111111111111111111111112"]}`
  - Status: `402`; challenge exists: yes; semantics: price-only.

## 4. Classification Per Candidate
- `paysponge/coingecko` token-data-by-address: `verified/unproven`
- `merit-systems/stablecrypto/market-data` token-metadata: `verified/unproven`
- `paysponge/coingecko` search/pools: `rejected/search-only`
- `paysponge/coingecko` token_price: `rejected/price-only`
- `merit-systems/stablecrypto/market-data` prices/by-address: `rejected/price-only`

## 5. Recommended Next Probes
1. Controlled paid probe for `paysponge/coingecko` token metadata route with SOL mint to confirm actual response fields (`name`, `symbol`, `network`, `address`, `decimals`, optional image/tags).
2. Controlled paid probe for `stablecrypto` token metadata route with the same canonical input, then compare field coverage and normalization friction.
3. Add parser-only assertion helper test for metadata field presence classification if route response samples are captured (no Radar modifications).

## 6. Explicit Caveats
- This artifact does not claim benchmark-ready status.
- This artifact does not claim a winner.
- No executable route mapping changes were committed in this task.
- No benchmark artifacts/metrics were generated.
- `402` only proves unpaid gate/payment requirement and route reachability; it does not prove post-payment payload quality.
