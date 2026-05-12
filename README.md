# Infopunks Pay.sh Agent Harness

**Query Infopunks Radar before an agent spends through Pay.sh. Route, execute, and write proof logs.**

Current proof:
- Live Radar preflight works
- StableCrypto selected from live Pay.sh catalog
- Pay.sh CLI execution works
- 30/30 live StableCrypto benchmark succeeded in latest local run
- Not yet a naive-vs-Radar superiority benchmark

## 60-second start

```bash
git clone https://github.com/ministryofinfopunks/infopunks-pay-sh-agent-harness.git
cd infopunks-pay-sh-agent-harness
npm install
cp .env.example .env
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com npm run demo:compare
```

For the live StableCrypto route, install/setup Pay.sh CLI first, then run the live command below.

Pay.sh CLI sanity check:

```bash
pay --sandbox curl https://debugger.pay.sh/mpp/quote/AAPL
```

## Run the proven live route

```bash
PAYSH_EXECUTION_MODE=pay_cli \
LIVE_PAYSH_EXECUTION=true \
PAYSH_EXECUTION_URL=https://stablecrypto.dev/api/coingecko/price \
PAYSH_EXECUTION_METHOD=POST \
PAYSH_EXECUTION_BODY_JSON='{"ids":["solana"],"vs_currencies":["usd"]}' \
MARKET_DATA_MAX_LATENCY_MS=3000 \
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com \
RADAR_API_TIMEOUT_MS=15000 \
npm run demo:live-market-data
```

Expected:
- Radar decision: `route_approved`
- selected provider: `merit-systems-stablecrypto-market-data`
- execution mode: `live_pay_sh_cli`
- response preview like `{"solana":{"usd":...}}`

## Run the live benchmark

```bash
PAYSH_EXECUTION_MODE=pay_cli \
LIVE_PAYSH_EXECUTION=true \
PAYSH_EXECUTION_URL=https://stablecrypto.dev/api/coingecko/price \
PAYSH_EXECUTION_METHOD=POST \
PAYSH_EXECUTION_BODY_JSON='{"ids":["solana"],"vs_currencies":["usd"]}' \
MARKET_DATA_MAX_LATENCY_MS=3000 \
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com \
RADAR_API_TIMEOUT_MS=15000 \
npm run benchmark:live-market-data -- --trials=30
```

`LIVE_MARKET_DATA_TRIALS=30` can be used instead of `-- --trials=30`.

Artifacts:
- `benchmark-results/live-market-data/latest.json`
- `benchmark-results/live-market-data/latest.csv`
- `benchmark-results/live-market-data/summary.md`

This measures repeatability of one Radar-selected route, not superiority versus naive routing.

## Stress test this

Clone it and try to break:
- bad intents
- tighter latency constraints
- missing Pay.sh CLI
- invalid JSON body
- `route_blocked` cases
- concurrent benchmark runs
- different Pay.sh providers
- degraded endpoints
- no `RADAR_API_BASE_URL` fallback mode

Open issues or tag `@carbonsheikh` with terminal output/proof logs.

## Drop into an agent

```ts
import { callRadarPreflight } from "./src";

const route = await callRadarPreflight({
  intent: "get crypto market data",
  category: "finance",
  constraints: { minTrustScore: 70, maxLatencyMs: 3000, maxCostUsd: 0.05 }
});

if (route.decision !== "route_approved") throw new Error("No safe Pay.sh route");
```

Agent integration examples:
- `examples/openai-tool-schema.json`
- `examples/langchain-tool.ts`
- `examples/live-market-data-agent.ts`

Run local examples:

```bash
npx ts-node examples/live-market-data-agent.ts
npx ts-node examples/langchain-tool.ts
```

`examples/langchain-tool.ts` requires:

```bash
npm install @langchain/core zod
```

npm publish has not been performed yet. Local imports/examples are available now. Planned package name: `@infopunks/pay-sh-harness`.

## What this proves

- Agents can query live Infopunks Radar before attempting a Pay.sh call.
- Radar can select a live Pay.sh provider from the live catalog.
- The harness can execute the StableCrypto route through Pay.sh CLI.
- The live market-data route has been run repeatedly.
- Proof logs can capture preflight + execution metadata.

## What this does not prove

- Radar beats naive routing.
- Lower cost/failure/latency versus naive selection.
- Multi-provider or multi-intent reliability.
- External adoption.
- Production SLA.
- Full transaction/settlement-reference capture inside the harness.

## Live Radar Preflight Integration

When `RADAR_API_BASE_URL` is set (current value: `https://infopunks-pay-sh-radar.onrender.com`), the harness calls:
- `POST {RADAR_API_BASE_URL}/v1/preflight`

If live preflight fails or times out, the harness falls back to local routing logic.

Example:

```bash
curl -X POST "$RADAR_API_BASE_URL/v1/preflight" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "intent": "get crypto market data",
    "category": "finance",
    "constraints": {
      "minTrustScore": 70,
      "maxLatencyMs": 3000,
      "maxCostUsd": 0.05
    }
  }'
```

Direct backend version:

```bash
curl -X POST "https://infopunks-pay-sh-radar.onrender.com/v1/preflight" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "intent": "get crypto market data",
    "category": "finance",
    "constraints": {
      "minTrustScore": 70,
      "maxLatencyMs": 3000,
      "maxCostUsd": 0.05
    }
  }'
```

Modes:
- `live`: decision came from backend preflight.
- `mock`: no `RADAR_API_BASE_URL`; local mock router used.
- `fallback`: live preflight configured but unavailable; local router used.

## Environment Setup

`.env` values:

- `RADAR_API_BASE_URL` (optional): live Radar API base URL (`https://infopunks-pay-sh-radar.onrender.com`).
- `RADAR_API_TIMEOUT_MS` (default `15000`): Radar API request timeout.
- `PAYSH_API_BASE_URL` (optional): experimental catalog API override. Not required for the proven StableCrypto execution demo.
- `LIVE_PAYSH_EXECUTION` (optional): set to `true` to attempt live Pay.sh execution.
- `PAYSH_EXECUTION_URL` (optional unless live execution enabled): full URL for one live execution endpoint.
- `PAYSH_EXECUTION_MODE` (default `http`): execution mode (`http` or `pay_cli`).
- `PAYSH_EXECUTION_METHOD` (optional): HTTP method for execution call (default `GET`).
- `PAYSH_EXECUTION_BODY_JSON` (optional): JSON request body for live execution.
- `PAYSH_EXECUTION_HEADERS_JSON` (optional): JSON object of extra request headers for live execution.
- `PAYSH_AUTH_HEADER` (optional): auth header name for execution call.
- `PAYSH_AUTH_VALUE` (optional): auth header value for execution call.
- `MIN_TRUST_SCORE` (default `70`): routing threshold.
- `REQUEST_TIMEOUT_MS` (optional legacy fallback when `RADAR_API_TIMEOUT_MS` is unset): external request timeout.

## Simulated benchmark mode

```bash
npm run benchmark
BENCHMARK_TRIALS=50 npm run benchmark
npm run benchmark -- --trials=50
```

This is a measurement scaffold. Results are simulated unless live execution is explicitly configured.

## Scripts

- `npm run demo:route`: single Radar-assisted route decision + proof log.
- `npm run demo:compare`: naive catalog route vs Radar-assisted route + proof log.
- `npm run demo:live-market-data`: Radar preflight plus optional single-provider live Pay.sh execution demo + proof log.
- `npm run benchmark:live-market-data`: repeated live market-data route benchmark + JSON/CSV/Markdown reports.
- `npm run benchmark`: repeated naive vs Radar benchmark + JSON/CSV/Markdown reports.
- `npm run typecheck`: TypeScript typecheck.
- `npm run build`: compile to `dist/`.

## Proof log fields

- `radarApiUsed`
- `radarEndpoint`
- `radarDecision`
- `radarDataMode`
- `radarSource`
- `fallbackReason` (when applicable)
- `catalogMode` (`mock | live | fallback`)
- `radarMode` (`live | mock | fallback`)
- `comparisonValidity` (`valid_simulated_same_catalog | invalid_mixed_catalogs | live_preflight_only`)
- `candidateProviderSource` (`mock | live | omitted`)

## Latency semantics

- `latencyMs`: legacy execution latency field.
- `executionLatencyMs`: explicit execution-latency field.
- `cliTotalLatencyMs`: populated in `pay_cli` mode.
- `radarProviderLatencyMs`: provider telemetry latency from Radar.
- `providerReportedLatencyMs`: `null` unless provider response includes timing.

## Repository Layout

- `src/radarClient.ts`: Radar intelligence client + live preflight + fallback.
- `src/payShClient.ts`: Pay.sh catalog client + mock fallback.
- `src/router.ts`: deterministic local routing policy.
- `src/proofLog.ts`: JSON proof writer.
- `src/demoRoute.ts`: single decision demo.
- `src/demoCompare.ts`: naive vs Radar demo.
- `src/benchmarkRunner.ts`: benchmark orchestration.
