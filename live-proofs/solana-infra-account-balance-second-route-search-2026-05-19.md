# Solana Infra Account Balance Second Route Search (2026-05-19)

## Scope
- benchmark_intent: `solana-infra-account-balance`
- canonical_address: `11111111111111111111111111111111`
- known_route_baseline: `https://x402.quicknode.com/solana-mainnet/` (`getBalance`)
- constraints_applied:
  - unpaid probes only
  - no paid execution
  - exclude EVM-only balance routes
  - exclude token-price/token-metadata/token-only balance/portfolio-only/history-only/NFT-only routes

## Re-inspection Performed
- Re-inspected: `~/.config/pay/skills/detail/*.json`
- Broader search terms applied: `solana`, `rpc`, `getBalance`, `getAccountInfo`, `account`, `balance`, `wallet`, `lamports`, `native balance`
- Also inspected generic RPC metadata that might support Solana JSON-RPC semantics.

## Candidate 1
- provider: `merit-systems/stablecrypto/market-data`
- endpoint: `https://stablecrypto.dev/api/alchemy/node/rpc`
- method: `POST`
- request shape:
```json
{
  "network": "eth-mainnet",
  "method": "eth_getBalance",
  "params": ["0x0000000000000000000000000000000000000000", "latest"]
}
```
- unpaid status evidence:
  - `curl -i https://stablecrypto.dev/api/alchemy/node/rpc ...` returned `HTTP/2 402`
  - `x-matched-path: /api/alchemy/node/rpc`
- payment challenge detected:
  - yes (`payment-required` + `www-authenticate` headers present)
- native SOL balance semantic fit:
  - weak / no
  - challenge payload schema and route description specify Ethereum-oriented JSON-RPC usage (`eth_blockNumber`, `eth_getBalance`) and requires a `network` slug exampled as `eth-mainnet`/`base-mainnet`.
  - no explicit Solana method contract (`getBalance`, `getAccountInfo`) or lamports semantics advertised.
- caveat_objects:
  - `{"code":"evm_semantics_primary","severity":"warning","affects_core_semantics":true,"detail":"Published route contract is Ethereum-oriented (eth_* methods), not explicit Solana lamports/account semantics."}`
  - `{"code":"solana_method_unproven","severity":"warning","affects_core_semantics":true,"detail":"No unpaid proof that Solana JSON-RPC methods are accepted and normalized through this route."}`
- conclusion: `rejected`

## Candidate 2
- provider: `helius` (catalog lookup by local pay skills snapshot)
- endpoint: `n/a`
- method: `n/a`
- request shape: `n/a`
- unpaid status evidence:
  - no Helius provider or endpoint discovered in `~/.config/pay/skills/skills-*.json` or `~/.config/pay/skills/detail/*.json`.
- payment challenge detected:
  - not testable (no route found)
- native SOL balance semantic fit:
  - unknown (no route present in catalog snapshot)
- caveat_objects:
  - `{"code":"provider_not_in_catalog_snapshot","severity":"warning","affects_core_semantics":true,"detail":"No Helius provider route found in local Pay skills catalog snapshot."}`
- conclusion: `rejected`

## Candidate 3
- provider: `allium` (catalog lookup by local pay skills snapshot)
- endpoint: `n/a`
- method: `n/a`
- request shape: `n/a`
- unpaid status evidence:
  - no Allium provider or endpoint discovered in `~/.config/pay/skills/skills-*.json` or `~/.config/pay/skills/detail/*.json`.
- payment challenge detected:
  - not testable (no route found)
- native SOL balance semantic fit:
  - unknown (no route present in catalog snapshot)
- caveat_objects:
  - `{"code":"provider_not_in_catalog_snapshot","severity":"warning","affects_core_semantics":true,"detail":"No Allium provider route found in local Pay skills catalog snapshot."}`
- conclusion: `rejected`

## Net Result
- A second comparable paid route for `solana-infra-account-balance` (native SOL lamports/account semantics) was **not found** in the current local Pay catalog snapshot.
- Only QuickNode currently remains the known comparable route in this environment snapshot.
