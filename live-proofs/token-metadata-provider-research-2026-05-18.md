# Token Metadata Provider Research (2026-05-18)

Scope: provider metadata discovery only. No paid execution.
Benchmark intent: token metadata (identity/descriptive fields, not pure price/search/pool routes).
Canonical metadata input candidate considered: SOL on solana with mint/token address So11111111111111111111111111111111111111112 when endpoint shape supports address input.
No benchmark readiness claim.
No winner claim.

## Providers Reviewed
- merit-systems/stablecrypto/market-data (StableCrypto)
- paysponge/coingecko (CoinGecko Onchain DEX API)

## Candidate Endpoints Found
- merit-systems/stablecrypto/market-data POST https://stablecrypto.dev/api/alchemy/token/token-metadata
- paysponge/coingecko GET https://pro-api.coingecko.com/api/v3/x402/onchain/networks/{network}/tokens/{address}

## Rejected/Non-Clean Endpoints
- merit-systems/stablecrypto/market-data: POST https://stablecrypto.dev/api/alchemy/node/rpc (not_relevant)
- merit-systems/stablecrypto/market-data: POST https://stablecrypto.dev/api/alchemy/portfolio/nft-collections (not_relevant)
- merit-systems/stablecrypto/market-data: POST https://stablecrypto.dev/api/alchemy/portfolio/nfts (not_relevant)
- merit-systems/stablecrypto/market-data: POST https://stablecrypto.dev/api/alchemy/portfolio/token-balances (needs_docs_review)
- merit-systems/stablecrypto/market-data: POST https://stablecrypto.dev/api/alchemy/portfolio/tokens (needs_docs_review)
- merit-systems/stablecrypto/market-data: POST https://stablecrypto.dev/api/alchemy/prices/by-address (price_only)
- paysponge/coingecko: GET https://pro-api.coingecko.com/api/v3/x402/onchain/networks/{network}/trending_pools (pool_only)
- paysponge/coingecko: GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools (search_only)
- paysponge/coingecko: GET https://pro-api.coingecko.com/api/v3/x402/onchain/simple/networks/{network}/token_price/{addresses} (price_only)
- paysponge/coingecko: GET https://pro-api.coingecko.com/api/v3/x402/simple/price (price_only)

## Classification Table

| provider_id | provider_name | category | service_url | catalog description/use cases | candidate endpoint | method | request shape | why it may be token metadata | uncertainty / missing information | classification | canonical input candidate | docs URL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| merit-systems/stablecrypto/market-data | StableCrypto | finance | https://stablecrypto.dev | Access crypto market and on-chain data through CoinGecko, DefiLlama, Alchemy, and Etherscan. Covers prices, DEX pools, DeFi TVL, yields, bridges, treasuries, token balances, transactions, contracts, logs, gas, and Ethereum stats. Use for crypto prices, market charts, DeFi analytics, TVL and yield research, DEX pool data, wallet token balances, Ethereum transfers, contract metadata, gas estimates, bridge volume, stablecoin supply, treasury holdings, and blockchain monitoring. | https://stablecrypto.dev/api/alchemy/token/token-metadata | POST | {"contractAddress":"So11111111111111111111111111111111111111112","network":"solana"} | Endpoint path/description indicates token identity metadata fields (name/symbol/address/network/decimals or metadata attributes). | Response schema and method/request compatibility are still unproven without execution. | clean_candidate_possible | {"network":"solana","contractAddress":"So11111111111111111111111111111111111111112"} | https://stablecrypto.dev/openapi.json |
| paysponge/coingecko | CoinGecko Onchain DEX API | finance | https://pro-api.coingecko.com/api/v3/x402/onchain | Query CoinGecko onchain DEX market data through x402 for token prices, token detail lookup, trending pools on a network, and pool/token search. Use for onchain token pricing, token detail enrichment, trending-pool discovery on a network, and search across GeckoTerminal market data. | https://pro-api.coingecko.com/api/v3/x402/onchain/networks/{network}/tokens/{address} | GET | {"symbol":"SOL","network":"solana","token_address":"So11111111111111111111111111111111111111112"} | Endpoint path/description indicates token identity metadata fields (name/symbol/address/network/decimals or metadata attributes). | Response schema and method/request compatibility are still unproven without execution. | clean_candidate_possible | {"symbol":"SOL","network":"solana","token_address":"So11111111111111111111111111111111111111112"} | https://github.com/solana-foundation/pay-skills/blob/main/providers/paysponge/coingecko/PAY.md |

Strict caveat: candidate discovery evidence only. Token metadata semantics still require endpoint/method/request-shape verification before any benchmark use.
No paid execution performed by this research task.
