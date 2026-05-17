# Token Search Second Route Discovery (2026-05-17)

Scope: unpaid route discovery/probing only for benchmark_intent `token search`.
No benchmark readiness claim.
No winner claim.

## Candidate Probe Results

- provider_id: paysponge-coingecko
- provider_name: CoinGecko Onchain DEX API
- endpoint_url: https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/trending_pools
- method: GET
- request_shape: {}
- status_code: 402
- payment_required_challenge_appears: true
- content_type: application/json; charset=utf-8
- safe_response_summary: {"error":"Payment required","message":"Payment is required to access this resource"}
- classification: rejected
- reason: Does not match token-search route patterns.

- provider_id: merit-systems-stableenrich-enrichment
- provider_name: merit-systems-stableenrich-enrichment
- endpoint_url: https://stableenrich.dev/api/exa/search
- method: POST
- request_shape: {"query":"latest Solana agent payments"}
- status_code: 402
- payment_required_challenge_appears: true
- content_type: application/json
- safe_response_summary: Empty response body.
- classification: clean_candidate
- reason: Query/symbol/name style search input detected without known token/pool address requirement.

- provider_id: paysponge-coingecko
- provider_name: CoinGecko Onchain DEX API
- endpoint_url: https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL
- method: GET
- request_shape: {"query":"SOL"}
- status_code: 402
- payment_required_challenge_appears: true
- content_type: application/json; charset=utf-8
- safe_response_summary: {"error":"Payment required","message":"Payment is required to access this resource"}
- classification: clean_candidate
- reason: Query/symbol/name style search input detected without known token/pool address requirement. This is the already-proven first route, not a second comparable route.

- provider_id: paysponge-coingecko
- provider_name: CoinGecko Onchain DEX API
- endpoint_url: https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112
- method: GET
- request_shape: {"network":"solana","token_address":"So11111111111111111111111111111111111111112"}
- status_code: 402
- payment_required_challenge_appears: true
- content_type: application/json; charset=utf-8
- safe_response_summary: {"error":"Payment required","message":"Payment is required to access this resource"}
- classification: search_adjacent
- reason: Token detail/lookup path uses known token address semantics; not clean query search.

- provider_id: paysponge-coingecko
- provider_name: CoinGecko Onchain DEX API
- endpoint_url: https://pro-api.coingecko.com/api/v3/x402/onchain/search/tokens?query=SOL
- method: GET
- request_shape: {"query":"SOL"}
- status_code: 401
- payment_required_challenge_appears: false
- content_type: application/json; charset=utf-8
- safe_response_summary: {"status":{"timestamp":"2026-05-17T01:39:44.892+00:00","error_code":10002,"error_message":"API Key Missing. Please make sure you're using the right authentication method. For Pro API, please visit: https://docs.coingecko.com/reference/authentication. For Public/Demo API, please v
- classification: clean_candidate
- reason: Query/symbol/name style search input detected without known token/pool address requirement.

## Clean Candidates
- merit-systems-stableenrich-enrichment https://stableenrich.dev/api/exa/search
- paysponge-coingecko https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL
- paysponge-coingecko https://pro-api.coingecko.com/api/v3/x402/onchain/search/tokens?query=SOL

## Search-Adjacent Candidates
- paysponge-coingecko https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112

## Lookup-Only Candidates
- none

## Rejected Paths
- paysponge-coingecko https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/trending_pools (Does not match token-search route patterns.)

At least one clean second candidate route exists, but this report does not claim benchmark readiness.