# StableCrypto Pay.sh CLI Live Execution Proof

Date: 2026-05-12
Provider: merit-systems-stablecrypto-market-data
Gateway: https://stablecrypto.dev/api/coingecko/price
Method: POST

Request:
```json
{"ids":["solana"],"vs_currencies":["usd"]}
```

Result:
```json
{"solana":{"usd":94.64}}
```

Proof chain:
1. Radar preflight selected StableCrypto.
2. Harness reached the x402 payment gate and captured a 402 payment challenge.
3. Pay.sh CLI executed the same endpoint successfully.
4. Provider returned live SOL/USD market data.

Caveat:
This is a single live execution proof, not a benchmark showing Radar improves outcomes.
