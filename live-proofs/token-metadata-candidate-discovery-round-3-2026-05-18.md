# Token Metadata Candidate Discovery Round 3 (2026-05-18)

## Summary
- Scope: round-3 candidate discovery for `finance-data-token-metadata`.
- Existing constraints respected: did not retest rejected `POST /api/alchemy/token/token-metadata` and `POST /api/etherscan/token/tokeninfo` as viable targets.
- Outcome: one fresh route reached `verified/proven` from paid evidence: `POST https://stablecrypto.dev/api/coingecko/coin`.
- No benchmark artifacts were created. Radar was not modified.

## Current Lane State
- Previously proven route: `paysponge/coingecko` `GET /x402/onchain/networks/{network}/tokens/{address}`.
- Previously rejected routes:
  - `POST https://stablecrypto.dev/api/alchemy/token/token-metadata`
  - `POST https://stablecrypto.dev/api/etherscan/token/tokeninfo`
- Round-3 adds one new proven metadata-capable route (`stablecrypto /api/coingecko/coin`), but strict benchmark comparability still needs normalization policy decisions.

## Candidates Inspected
| provider | provider_id if known | route | method | input_shape | expected_metadata_fields | unpaid_402_confirmed | paid_attempted | metadata_payload_observed | current_state | blocker | next_step |
|---|---|---|---|---|---|---|---|---|---|---|---|
| StableCrypto | `merit-systems/stablecrypto/market-data` | `https://stablecrypto.dev/api/coingecko/coin` | POST | `{"id":"usd-coin"}` | `name,symbol,contract/platform addresses,chain map,decimals,image` | true | true | true | `verified/proven` | not yet normalized to single-network token-address query | define canonical extraction profile (target chain + address + decimals + image) |
| StableCrypto | `merit-systems/stablecrypto/market-data` | `https://stablecrypto.dev/api/coingecko/history` | POST | `{"id":"solana","date":"17-05-2026"}` | historical coin snapshot with possible metadata envelope | true | false | false | `candidate/unproven` | mixed historical semantics; unclear clean metadata extraction | run one controlled paid probe only if historical endpoint is still considered in-lane |
| StableCrypto | `merit-systems/stablecrypto/market-data` | `https://stablecrypto.dev/api/coingecko/onchain/pool/info` | POST | `{"network":"solana","address":"<pool>"}` | pool metadata (may include token refs) | true | false | false | `rejected/pool-only` | route intent is pool metadata, not token identity lookup | keep excluded from token-metadata lane |
| StableCrypto | `merit-systems/stablecrypto/market-data` | `https://stablecrypto.dev/api/coingecko/onchain/search` | POST | `{"query":"SOL"}` | search results | true | false | false | `rejected/search-only` | route intent is discovery/search | keep excluded from token-metadata lane |
| StableCrypto | `merit-systems/stablecrypto/market-data` | `https://stablecrypto.dev/api/etherscan/contract/getsourcecode` | POST | `{"chainid":1,"address":"0xA0b8..."}` | contract verification/source metadata | true | false | false | `rejected/non-metadata` | contract-source semantics, not token identity metadata | keep excluded from token-metadata lane |

## Routes Tested
Unpaid probes (`curl -i -sS`) were executed for:
1. `POST /api/coingecko/coin`
2. `POST /api/coingecko/history`
3. `POST /api/coingecko/onchain/pool/info`
4. `POST /api/coingecko/onchain/search`
5. `POST /api/etherscan/contract/getsourcecode`

Paid probe (`pay curl`) executed for:
1. `POST /api/coingecko/coin`

## Unpaid Probe Results
- All 5 tested routes returned `HTTP/2 402`.
- All 5 included `payment-required` and `www-authenticate` challenge behavior.
- All 5 included matching `x-matched-path` headers for the probed route.

## Paid Execution Results
- Route: `POST https://stablecrypto.dev/api/coingecko/coin`
- Input: `{"id":"usd-coin","localization":false,"tickers":false,"market_data":false,"community_data":false,"developer_data":false,"sparkline":false}`
- Result: pay CLI exit code `0`, parseable JSON payload returned.
- Observed payload includes token identity metadata and multi-chain platform details.

## Metadata Fields Observed
From paid payload on `coingecko/coin`:
- `name`: observed (`"USDC"`)
- `symbol`: observed (`"usdc"`)
- `address / mint / contract address`: observed (`contract_address`, `platforms`, `detail_platforms.*.contract_address`)
- `chain / network`: observed (`platforms` keys and `detail_platforms` keys)
- `decimals`: observed (`detail_platforms.*.decimal_place`)
- `image/logo`: observed (`image.thumb`, `image.small`, `image.large`)

## Rejected Candidates and Why
- `POST /api/coingecko/onchain/pool/info` -> `rejected/pool-only` (pool endpoint semantics)
- `POST /api/coingecko/onchain/search` -> `rejected/search-only` (search/discovery semantics)
- `POST /api/etherscan/contract/getsourcecode` -> `rejected/non-metadata` (contract source/verification semantics)

## Strongest Next Verification Target
- `POST https://stablecrypto.dev/api/coingecko/history`
- Reason: already `402`-verified and metadata-adjacent; could validate whether historical payload can be normalized into token identity metadata without heavy market-data noise.

## Whether Any Second Route Became Verified/Proven
- Yes: `POST https://stablecrypto.dev/api/coingecko/coin` is now `verified/proven` for metadata field presence.

## Explicit Caveats
- `coingecko/coin` is coin-ID driven and multi-chain; it is not the same query shape as the proven PaySponge token-address route.
- Strict benchmark comparability is not automatically established until normalization rules define canonical chain/address selection and extraction parity.
- This document does not claim benchmark readiness, winner status, or Radar changes.
