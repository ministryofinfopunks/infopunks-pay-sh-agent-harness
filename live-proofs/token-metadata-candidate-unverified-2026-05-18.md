# Token Metadata Candidate Verification (Unpaid)

- generated_at: 2026-05-18T07:40:44.332Z
- benchmark_id: finance-data-token-metadata
- category: finance/data
- benchmark_intent: token metadata
- benchmark_recorded: false
- winner_status: not_evaluated
- winner_claimed: false
- paid_execution_attempted: false
- proof_reference: live-proofs/token-metadata-candidate-unverified-2026-05-18.md

| provider_id | provider_name | method | endpoint | request_shape | status_code | content_type | payment_required_challenge_appears | response_shape_classified | metadata_fields_detected | token_metadata_semantics_detected | classification | reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| paysponge-coingecko | PaySponge CoinGecko | GET | https://pro-api.coingecko.com/api/v3/x402/onchain/tokens/solana/So11111111111111111111111111111111111111112 | {"network":"solana","address":"So11111111111111111111111111111111111111112","symbol":"SOL"} | 401 | application/json; charset=utf-8 | false | unknown | none | false | candidate_unverified | Unpaid evidence did not sufficiently establish token metadata route semantics. |
| merit-systems-stablecrypto-market-data | StableCrypto | GET | https://stablecrypto.dev/api/coingecko/onchain/tokens/solana/So11111111111111111111111111111111111111112 | {"network":"solana","address":"So11111111111111111111111111111111111111112","symbol":"SOL"} | 404 | text/html; charset=utf-8 | false | non_json_text | none | false | candidate_unverified | Route returned 404; token metadata semantics cannot be verified from unpaid evidence. |

No benchmark-ready claim.
No winner claim.