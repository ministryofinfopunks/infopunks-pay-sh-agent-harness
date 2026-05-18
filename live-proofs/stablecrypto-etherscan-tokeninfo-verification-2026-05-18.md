# StableCrypto Etherscan TokenInfo Verification

- generated_at: 2026-05-18
- provider_id: merit-systems/stablecrypto/market-data
- benchmark_id: finance-data-token-metadata
- route_tested: https://stablecrypto.dev/api/etherscan/token/tokeninfo
- method: POST
- request_body: {"chainid":1,"contractaddress":"0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"}
- input_token_address: 0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 (USDC on Ethereum mainnet)

## Request Body Evidence
- source: provider OpenAPI (`https://stablecrypto.dev/openapi.json`)
- schema summary for `POST /api/etherscan/token/tokeninfo`:
  - required: `chainid` (number), `contractaddress` (string)
- selected body shape uses `chainid=1` with a known ERC-20 contract address.

## Unpaid Probe Result
- paid_execution_attempted: false
- command: `curl -i -sS -X POST https://stablecrypto.dev/api/etherscan/token/tokeninfo -H 'Content-Type: application/json' -H 'Accept: application/json' --data '{"chainid":1,"contractaddress":"0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"}'`
- status_code: 402
- status_evidence: Direct unpaid HTTP probe returned `HTTP/2 402` with `payment-required`, `www-authenticate`, and `x-matched-path: /api/etherscan/token/tokeninfo`.
- payment_required_challenge_observed: true

## Paid Execution Result
- paid_execution_attempted: true
- execution_transport: pay_cli via harness `executeLivePayShCall` (`LIVE_PAYSH_EXECUTION=true`, `PAYSH_EXECUTION_MODE=pay_cli`)
- command_shape: `pay curl 'https://stablecrypto.dev/api/etherscan/token/tokeninfo' -X POST -H "Content-Type: application/json" -d '{"chainid":1,"contractaddress":"0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"}'`
- cli_exit_code: 0
- status_code: null
- status_evidence: pay_cli exit code `0`; CLI returned parseable JSON body and did not expose an HTTP status line.
- response_preview: {"success":false,"error":"NOTOK"}

## Metadata Fields Observed
- name: false
- symbol: false
- contract address / token address: false
- chain/network: false
- decimals: false
- image/logo: false

## Final Classification
- classification: rejected
- rationale: Paid execution returned non-metadata error payload (`success:false`, `error:"NOTOK"`) instead of token metadata fields.

## Comparable Proven Routes Check
- creates_two_proven_comparable_token_metadata_routes: false
- reason: This route did not produce a proven metadata payload; only PaySponge CoinGecko token-metadata route currently has proven paid metadata evidence.

## Caveats
- Unpaid behavior confirms route gating and match, not paid payload semantics.
- pay_cli can hide HTTP status; status evidence is based on CLI exit code + parseable response body.
- No benchmark artifacts were created, Radar was not modified, no benchmark readiness claim is made, and no winner claim is made.
