# StableCrypto Harness Pay.sh CLI Execution Proof

Date: 2026-05-12
Provider: merit-systems-stablecrypto-market-data
Gateway: https://stablecrypto.dev/api/coingecko/price
Execution mode: live_pay_sh_cli

Flow:
1. Harness sent intent to live Radar preflight.
2. Radar selected StableCrypto from the live Pay.sh catalog.
3. Harness executed `pay curl` through Pay.sh CLI.
4. StableCrypto returned live SOL/USD data.

Result:
```json
{"solana":{"usd":95.33}}
```

Proof log:
proofs/2026-05-12T12-53-28-422Z-demo-live-market-data.json

Important caveat:
This is one successful live route execution. It is not a benchmark showing Radar improves outcomes. CLI execution latency includes Pay.sh CLI/payment/wallet overhead and should not be read as raw provider latency.
