# Token Metadata Candidate Discovery Round 2 (2026-05-18)

## Summary
- Scope: second discovery round for `finance-data-token-metadata` using Pay.sh catalog/provider metadata and unpaid probes.
- Existing state respected: `paysponge/coingecko` token-metadata route remains previously verified/proven; `stablecrypto` Alchemy `token-metadata` route remains rejected due to paid non-metadata error payload.
- Round-2 outcome: identified 5 new route candidates (all from `merit-systems/stablecrypto/market-data`) not previously rejected by route.
- No benchmark artifacts created. Radar scaffold unchanged.
- No benchmark-readiness or winner claim made.

## Candidates Inspected
| candidate_route | provider | why considered | classification |
|---|---|---|---|
| `POST https://stablecrypto.dev/api/etherscan/token/tokeninfo` | `merit-systems/stablecrypto/market-data` | Endpoint description explicitly indicates token identity fields (`name`, `symbol`, `decimals`) | `verified/unproven` |
| `POST https://stablecrypto.dev/api/coingecko/coin` | `merit-systems/stablecrypto/market-data` | Endpoint description indicates detailed coin metadata | `candidate/unproven` |
| `POST https://stablecrypto.dev/api/coingecko/history` | `merit-systems/stablecrypto/market-data` | Historical coin snapshot may include metadata envelope | `candidate/unproven` |
| `POST https://stablecrypto.dev/api/alchemy/token/token-allowance` | `merit-systems/stablecrypto/market-data` | Token-related Alchemy route discovered in same cluster | `rejected/non-metadata` |
| `POST https://stablecrypto.dev/api/alchemy/token/token-balances` | `merit-systems/stablecrypto/market-data` | Token-related Alchemy route discovered in same cluster | `rejected/non-metadata` |

## Routes Tested
Unpaid probes executed with `curl -i -sS` and JSON body samples.

1. `POST /api/etherscan/token/tokeninfo`
- Unpaid behavior: `HTTP/2 402`
- `x-matched-path`: `/api/etherscan/token/tokeninfo`
- `payment-required.resource.description`: `Token name, symbol, decimals, and holders`

2. `POST /api/coingecko/coin`
- Unpaid behavior: `HTTP/2 402`
- `x-matched-path`: `/api/coingecko/coin`
- `payment-required.resource.description`: `Get detailed coin metadata and market data`

3. `POST /api/coingecko/history`
- Unpaid behavior: `HTTP/2 402`
- `x-matched-path`: `/api/coingecko/history`
- `payment-required.resource.description`: `Get historical snapshot of coin data on a specific date`

4. `POST /api/alchemy/token/token-allowance`
- Unpaid behavior: `HTTP/2 402`
- `x-matched-path`: `/api/alchemy/token/token-allowance`
- `payment-required.resource.description`: `Get token allowance for owner/spender pair`

5. `POST /api/alchemy/token/token-balances`
- Unpaid behavior: `HTTP/2 402`
- `x-matched-path`: `/api/alchemy/token/token-balances`
- `payment-required.resource.description`: `Get token balances for an address`

## Paid Execution Result (if attempted)
- No paid execution attempted in this round.
- Reason: round objective was safe candidate discovery and unpaid verification only.

## Metadata Fields Observed (if any)
- Direct response metadata fields were not observed (all probes were unpaid and returned `402` challenge only).
- Metadata signals available from route descriptors:
  - `tokeninfo`: explicit `name`, `symbol`, `decimals` (+ holders metric)
  - `coingecko/coin`: generic coin metadata semantics (likely identity + descriptive fields)
  - `coingecko/history`: mixed historical snapshot semantics; metadata presence unclear without paid payload

## Rejected Candidates And Why
- `POST /api/alchemy/token/token-allowance` -> `rejected/non-metadata`
  - Reason: allowance authorization state, not token identity/descriptor metadata.
- `POST /api/alchemy/token/token-balances` -> `rejected/non-metadata`
  - Reason: wallet balance inventory, not token metadata lookup semantics.

## Strongest Next Verification Target
- `POST https://stablecrypto.dev/api/etherscan/token/tokeninfo`
- Why strongest next target:
  - Unpaid probe verified route exists and is gated (`402` with matched path).
  - Route description explicitly names token metadata fields (`name`, `symbol`, `decimals`).
  - Lower ambiguity than `coingecko/history` and less mixed payload surface than `coingecko/coin` market-data blend.

## Caveats
- `402` challenge confirms gated route presence and declared intent, not final paid payload shape.
- StableCrypto already has one rejected metadata route (`/api/alchemy/token/token-metadata`) due to paid non-metadata error payload; route-level validation must remain independent.
- This artifact does not alter Radar or benchmark status and does not assert benchmark readiness.
