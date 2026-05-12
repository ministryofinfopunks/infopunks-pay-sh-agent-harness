# Solana Trending Pools 10-Trial Radar Win Proof

Date: 2026-05-12
Profile: solana_trending_pools
Intent: get trending Solana DEX pools
Trials: 10

Result:
- Naive provider: merit-systems-stablecrypto-market-data
- Radar provider: paysponge-coingecko
- Outcome: 10/10 radar_win
- Fit: 10/10 radar_better_fit

Why it matters:
Naive endpoint-map order selected StableCrypto simple price.
Radar selected PaySponge CoinGecko trending pools, matching the requested DEX pools intent.

Caveat:
This is a narrow routing-fit proof for one intent/profile. It is not broad proof that Radar improves all Pay.sh outcomes, latency, cost, or reliability.

Artifacts:
- benchmark-results/live-head-to-head/latest.json
- benchmark-results/live-head-to-head/latest.csv
- benchmark-results/live-head-to-head/summary.md
