# StableCrypto Token Search Route Verification (Unpaid)

- generated_at: 2026-05-17T02:08:49.684Z
- provider_id: merit-systems/stablecrypto/market-data
- benchmark_intent: token search
- candidate endpoint: https://stablecrypto.dev/api/coingecko/onchain/search
- methods tested: GET, POST
- query terms tested: SOL, ETH, BTC
- paid_execution_attempted: false
- final mapping_status: verified
- final execution_evidence_status: unproven
- response shape classification: verified_semantics
- proof_source: infopunks-pay-sh-agent-harness
- proof_reference: live-proofs/stablecrypto-token-search-verified-unproven-2026-05-17.md
- verified_at: 2026-05-17
- notes: Endpoint path, method, request shape, token-search intent, and unpaid route challenge/behavior verified. Paid execution not attempted. Not benchmark-ready.

## Probe Evidence

| method | endpoint | request_shape | query_term | status_code | content_type | payment_required_challenge_appears | classification | reason | safe_response_summary |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | https://stablecrypto.dev/api/coingecko/onchain/search | querystring:?query=<TERM> | SOL | 405 | null | false | rejected | Route behavior did not confirm token-search semantics for this probe. | empty body |
| GET | https://stablecrypto.dev/api/coingecko/onchain/search | querystring:?query=<TERM> | ETH | 405 | null | false | rejected | Route behavior did not confirm token-search semantics for this probe. | empty body |
| GET | https://stablecrypto.dev/api/coingecko/onchain/search | querystring:?query=<TERM> | BTC | 405 | null | false | rejected | Route behavior did not confirm token-search semantics for this probe. | empty body |
| POST | https://stablecrypto.dev/api/coingecko/onchain/search | json:{"query":"<TERM>"} | SOL | 402 | application/json | true | verified_semantics | Unpaid payment-required challenge observed for this method/request shape. | empty body |
| POST | https://stablecrypto.dev/api/coingecko/onchain/search | json:{"query":"<TERM>"} | ETH | 402 | application/json | true | verified_semantics | Unpaid payment-required challenge observed for this method/request shape. | empty body |
| POST | https://stablecrypto.dev/api/coingecko/onchain/search | json:{"query":"<TERM>"} | BTC | 402 | application/json | true | verified_semantics | Unpaid payment-required challenge observed for this method/request shape. | empty body |

No benchmark-ready claim.
No winner claim.
