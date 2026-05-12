# StableCrypto 30-Trial Live Benchmark Proof

Date: 2026-05-12
Provider: merit-systems-stablecrypto-market-data
Execution mode: live_pay_sh_cli
Trials: 30

Flow:
1. Each trial called live Radar preflight.
2. Radar approved StableCrypto for crypto market-data intent.
3. Harness executed StableCrypto through Pay.sh CLI.
4. All trials returned successful live responses.

Result:
30/30 route approvals.
30/30 Pay.sh CLI executions succeeded.

Artifacts:
- benchmark-results/live-market-data/latest.json
- benchmark-results/live-market-data/latest.csv
- benchmark-results/live-market-data/summary.md

Caveat:
This proves repeatability of one Radar-selected live route. It does not prove Radar outperforms naive routing yet.
