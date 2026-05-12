# Infopunks Pay.sh Agent Harness

**Query Infopunks Radar before an agent spends through Pay.sh. Route, execute, and write proof logs.**

Current proof:
- Live Radar preflight works
- StableCrypto selected from live Pay.sh catalog
- Pay.sh CLI execution works
- 30/30 live StableCrypto benchmark succeeded in latest local run
- Not yet a naive-vs-Radar superiority benchmark

## Stress test this now

Fast path:

```bash
git clone https://github.com/ministryofinfopunks/infopunks-pay-sh-agent-harness.git
cd infopunks-pay-sh-agent-harness
npm install
cp .env.example .env
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com npm run demo:compare
```

Hammer the proven live route after Pay.sh CLI is installed and configured:

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

Expected: Radar selects `merit-systems-stablecrypto-market-data`, Pay.sh CLI executes the route, and benchmark artifacts are written under `benchmark-results/live-market-data/`.

Caveat: this proves repeatability of one live Radar-selected route, not superiority versus naive routing.

Break it without live payments:

```bash
npm run demo:route
npm run demo:compare
npm run benchmark -- --trials=50
```

Use this when Pay.sh CLI is not configured. These paths exercise routing, fallback behavior, proof logging, and benchmark scaffolding without live payment execution.

## Tested runtime

Tested locally with:
- Node.js 20+
- TypeScript
- Pay.sh CLI for live execution mode

## Package status

Not published to npm yet.

Planned package name:

`@infopunks/pay-sh-harness`

Local imports work today through `src/index.ts`.

## How to break it

Try:
- set `MARKET_DATA_MAX_LATENCY_MS=50` and confirm Radar blocks the route
- unset `RADAR_API_BASE_URL` and confirm mock/fallback mode is clearly labeled
- set an invalid `PAYSH_EXECUTION_BODY_JSON` and confirm execution fails safely
- run `benchmark:live-market-data` with `--trials=100`
- run concurrent benchmark processes and look for proof/artifact collisions
- test bad intents like `"execute payout"` or `"generate image"` against the finance route
- point `PAYSH_EXECUTION_URL` at a broken endpoint
- try a second Pay.sh provider and add an endpoint mapping

Open an issue with terminal output, proof logs, and the command that broke it.

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

## OpenAI tool copy-paste

```ts
const infopunksRadarPreflightTool = {
  name: "infopunks_radar_preflight",
  description: "Check Infopunks Radar before selecting a Pay.sh provider route.",
  parameters: {
    type: "object",
    properties: {
      intent: { type: "string" },
      category: { type: "string" },
      minTrustScore: { type: "number" },
      maxLatencyMs: { type: "number" },
      maxCostUsd: { type: "number" }
    },
    required: ["intent"]
  }
};
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

## Live naive-vs-Radar benchmark

This benchmark compares:
- naive endpoint-map selection
- Radar-selected provider from live `/v1/preflight`

Current scope:
- only executable providers present in the local endpoint map are run
- market-data route only (`intent="get crypto market data"`, `category="finance"`)

Interpretation:
- if both strategies select StableCrypto, that is repeatability evidence, not superiority evidence
- if both strategies select the same provider, the benchmark reports repeatability_same_provider and does not count it as superiority evidence
- possible outcomes:
  - `repeatability_same_provider`: both selected the same executable provider
  - `radar_route_blocked`: Radar intentionally refused a route under configured policy constraints
  - `invalid_missing_endpoint`: Radar approved a provider route, but that provider is not executable in the local endpoint map
- superiority requires more executable provider mappings with different reliability/cost/latency profiles

Run:

```bash
PAYSH_EXECUTION_MODE=pay_cli \
LIVE_PAYSH_EXECUTION=true \
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com \
RADAR_API_TIMEOUT_MS=15000 \
npm run benchmark:live-head-to-head -- --trials=30
```

Artifacts:
- `benchmark-results/live-head-to-head/latest.json`
- `benchmark-results/live-head-to-head/latest.csv`
- `benchmark-results/live-head-to-head/summary.md`

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
- `npm run benchmark:live-head-to-head`: repeated live naive endpoint-map selection vs Radar-selected provider benchmark for executable market-data mappings.
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

## Contribute

Clone it. Break it. Ship agents with it.

Useful contributions:
- additional Pay.sh provider endpoint mappings
- naive-vs-Radar live benchmarks
- concurrency stress tests
- OpenAI / LangChain / Cursor agent integrations
- better settlement-reference capture
- cleaner package export surface

Open issues with:
- command run
- terminal output
- proof log path
- expected vs actual behavior

Tag `@carbonsheikh` with results.
