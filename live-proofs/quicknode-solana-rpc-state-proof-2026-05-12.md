# QuickNode Solana RPC State-Access Proof (2026-05-12)

This proof upgrades QuickNode validation from route-health only into state-access coverage.

## Manual verification examples

### getHealth

```bash
pay curl https://x402.quicknode.com/solana-mainnet \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth","params":[]}'
```

Result:

```json
{"jsonrpc":"2.0","id":1,"result":"ok"}
```

### getBalance

```bash
pay curl https://x402.quicknode.com/solana-mainnet \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["11111111111111111111111111111111"]}'
```

Result: successful JSON-RPC balance response with `result.value` and `result.context.slot`.

## Benchmark coverage note

The live RPC benchmark now includes `getSlot` per trial in addition to `getHealth` and `getBalance`.

## Caveat

This demonstrates executable JSON-RPC coverage and on-chain state-access/freshness signals for QuickNode through Pay CLI.
It does not by itself prove broad routing superiority versus alternative providers.
