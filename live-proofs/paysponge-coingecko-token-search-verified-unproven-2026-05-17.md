# PaySponge CoinGecko Token Search Verified/Unproven Proof

- provider_id: paysponge-coingecko
- benchmark_intent: token search
- endpoint: https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL
- method: GET
- request_shape_example: { "query": "SOL" }
- unpaid_probe_status: HTTP 402 challenge observed on unpaid probe
- unpaid_402_challenge_confirmed: true
- paid_execution_attempted: false
- mapping_status: verified
- execution_evidence_status: unproven
- response_shape_classification: Expected response shape classified. Paid response body not fetched in this verification pass.

## Expected Response Semantics

- search/pools endpoint.
- token/pool search result.
- SOL/USDC-like pool result expected when paid execution succeeds.

## Scope

No benchmark readiness claim.
No winner claim.
