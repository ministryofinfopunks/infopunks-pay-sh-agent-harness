# QuickNode Solana RPC Pay CLI Proof (2026-05-12)

This note captures manual verification that QuickNode Solana RPC is executable through Pay CLI for harness endpoint mapping purposes.

## 1) getHealth

Command:

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

## 2) getBalance

Command:

```bash
pay curl https://x402.quicknode.com/solana-mainnet \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getBalance","params":["11111111111111111111111111111111"]}'
```

Result:

Successful JSON-RPC balance response returned.

## Caveat

This proves QuickNode executable mapping through Pay CLI for specific JSON-RPC calls (`getHealth`, `getBalance`).
It does not by itself prove broad routing superiority over other providers.
