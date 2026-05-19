# Solana Infra Account Balance Candidate Research (2026-05-19)

## Proposed benchmark
- `benchmark_id`: `solana-infra-account-balance`
- `category`: `solana-infra`
- `intent`: fetch native SOL balance for the same public Solana address

## Canonical input
```json
{
  "network": "solana",
  "address": "11111111111111111111111111111111"
}
```

## Required normalized fields
- `address`
- `network`
- `balance_lamports`
- `balance_sol`
- `status_evidence`
- `raw_status_code`

## Metadata sources inspected
1. Local Pay.sh detail metadata: `~/.config/pay/skills/detail/*.json` (33 files)
2. Catalog search helper (for live provider presence):
   - `pay skills search "solana rpc" --json`
   - `pay skills search quicknode --json`
   - `pay skills search helius --json`
   - `pay skills search alchemy --json`
   - `pay skills search allium --json`

## Scope filters applied
Excluded semantics: token price, token metadata, token-balance-only APIs, transaction history, portfolio-only summaries, NFT lookup, risk/label-only endpoints.

## Candidate evaluations

### Candidate 1
- provider: `quicknode/rpc`
- endpoint: `https://x402.quicknode.com/solana-mainnet/`
- method: `POST`
- request shape:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getBalance",
  "params": ["11111111111111111111111111111111"]
}
```
- canonical input used:
```json
{
  "network": "solana",
  "address": "11111111111111111111111111111111"
}
```
- unpaid status evidence: unpaid probe returned `HTTP/2 402` with `payment-required` header and x402 challenge body for the exact Solana mainnet route.
- payment challenge detected: `true`
- semantic fit:
  - address accepted: `yes` (shape compatible with `params[0]=<solana_address>`)
  - network/solana context clear: `yes` (`/solana-mainnet/` route)
  - native balance/lamports expected: `yes` (`getBalance` JSON-RPC method returns lamports semantics)
- caveat_objects:
  - `{"type":"paid_not_executed","detail":"No paid call performed; response payload not observed in this run."}`
  - `{"type":"catalog_snapshot_gap","detail":"quicknode/rpc not present in local detail/*.json snapshot; discovered via live pay skills search."}`
- conclusion:
  - candidate/unproven
  - verified/unproven

### Candidate 2
- provider: `quicknode/rpc`
- endpoint: `https://x402.quicknode.com/solana-mainnet/`
- method: `POST`
- request shape:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getAccountInfo",
  "params": [
    "11111111111111111111111111111111",
    { "encoding": "base64" }
  ]
}
```
- canonical input used:
```json
{
  "network": "solana",
  "address": "11111111111111111111111111111111"
}
```
- unpaid status evidence: unpaid probe returned `HTTP/2 402` with `payment-required` header and x402 challenge body.
- payment challenge detected: `true`
- semantic fit:
  - address accepted: `yes`
  - network/solana context clear: `yes`
  - native balance/lamports expected: `yes` (`getAccountInfo.result.value.lamports` when executed)
- caveat_objects:
  - `{"type":"paid_not_executed","detail":"No paid call performed; account payload not observed."}`
  - `{"type":"secondary_semantics","detail":"Primary benchmark intent is direct native balance fetch; getAccountInfo is broader account state."}`
- conclusion:
  - candidate/unproven
  - verified/unproven

### Candidate 3
- provider: `quicknode/rpc`
- endpoint: `https://x402.quicknode.com/solana-mainnet/`
- method: `GET`
- request shape: no body
- canonical input used:
```json
{
  "network": "solana",
  "address": "11111111111111111111111111111111"
}
```
- unpaid status evidence: `GET` also returns `HTTP/2 402` payment challenge; does not prove JSON-RPC method correctness for balance retrieval.
- payment challenge detected: `true`
- semantic fit:
  - address accepted: `no`
  - network/solana context clear: `yes`
  - native balance/lamports expected: `no`
- caveat_objects:
  - `{"type":"method_mismatch","detail":"Route is JSON-RPC; benchmark requires POST body with getBalance/getAccountInfo semantics."}`
- conclusion:
  - rejected

### Candidate class check: Helius
- provider: `helius` (class)
- endpoint: none discovered in current catalog metadata
- method: n/a
- request shape: n/a
- canonical input used:
```json
{
  "network": "solana",
  "address": "11111111111111111111111111111111"
}
```
- unpaid status evidence: `pay skills search helius --json` returned `[]`.
- payment challenge detected: `false` (no route found to probe)
- semantic fit:
  - address accepted: `unknown`
  - network/solana context clear: `unknown`
  - native balance/lamports expected: `unknown`
- caveat_objects:
  - `{"type":"catalog_absent","detail":"No Helius service discovered in current Pay catalog search."}`
- conclusion:
  - rejected

### Candidate class check: Allium
- provider: `allium` (class)
- endpoint: none discovered in current catalog metadata
- method: n/a
- request shape: n/a
- canonical input used:
```json
{
  "network": "solana",
  "address": "11111111111111111111111111111111"
}
```
- unpaid status evidence: `pay skills search allium --json` returned `[]`.
- payment challenge detected: `false` (no route found to probe)
- semantic fit:
  - address accepted: `unknown`
  - network/solana context clear: `unknown`
  - native balance/lamports expected: `unknown`
- caveat_objects:
  - `{"type":"catalog_absent","detail":"No Allium service discovered in current Pay catalog search."}`
- conclusion:
  - rejected

### Candidate class check: Alchemy (Solana-infra comparability)
- provider: `merit-systems/stablecrypto/market-data` (Alchemy-labeled routes in catalog)
- endpoint: `https://stablecrypto.dev/api/alchemy/node/rpc`
- method: `POST`
- request shape: generic EVM JSON-RPC passthrough (`eth_*` documented in metadata)
- canonical input used:
```json
{
  "network": "solana",
  "address": "11111111111111111111111111111111"
}
```
- unpaid status evidence: catalog metadata describes Ethereum JSON-RPC semantics, not Solana JSON-RPC methods.
- payment challenge detected: `unproven` (not probed here due semantic mismatch)
- semantic fit:
  - address accepted: `no` (expects EVM methods/address semantics)
  - network/solana context clear: `no`
  - native balance/lamports expected: `no`
- caveat_objects:
  - `{"type":"semantic_mismatch","detail":"Alchemy route in current catalog is EVM-focused and not comparable to Solana native lamports benchmark intent."}`
- conclusion:
  - rejected

## Summary
- Viable lane candidates found now: QuickNode Solana RPC (`getBalance`, `getAccountInfo`) as `candidate/unproven` and `verified/unproven` under unpaid-only probing.
- Helius and Allium classes are currently absent from discovered catalog results.
- Alchemy-labeled catalog routes currently surfaced are not Solana-native comparable for this benchmark intent.
- No paid execution was performed.
- No benchmark artifact was created.
- Benchmark was not marked recorded.
