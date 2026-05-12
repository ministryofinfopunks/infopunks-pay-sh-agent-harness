# infopunks-pay-sh-agent-harness

Minimal TypeScript/Node.js harness showing one thing: an agent can query **Infopunks Radar** before spending through **Pay.sh**, then log machine-readable proof of the decision.

> [!IMPORTANT]
> This is a minimal demo harness. It demonstrates integration shape and decision logging, but real adoption still requires external agent usage against live systems.

## Known live proof

The current live proof path is:

```txt
intent -> live Radar preflight -> StableCrypto selected -> Pay.sh CLI execution -> live SOL/USD response
```

Proven route:

- Provider: `merit-systems-stablecrypto-market-data`
- Endpoint: `https://stablecrypto.dev/api/coingecko/price`
- Execution mode: `pay_cli`
- Result example: `{"solana":{"usd":95.33}}`

Proof artifacts are kept in:

- `proofs/`
- `live-proofs/`
- `benchmark-results/live-market-data/`

Caveat: this is one market-data route, not a broad Pay.sh benchmark and not proof of Radar superiority over naive routing.
The 30-trial live repeatability benchmark selected and executed this same StableCrypto route successfully in all 30 trials in the latest local run.

## Live Radar Preflight Integration

When `RADAR_API_BASE_URL` is set (current value: `https://infopunks-pay-sh-radar.onrender.com`), the harness calls the live machine-callable Radar endpoint:

- `POST {RADAR_API_BASE_URL}/v1/preflight`

If the live preflight call fails or times out, the harness falls back to local mock routing logic.
When live Radar is configured, `demo:compare` and `benchmark` intentionally omit `candidateProviders` in preflight calls unless candidates are known to come from the same live catalog source.

### Required env for live Radar

```bash
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com
RADAR_API_TIMEOUT_MS=15000
```

Optional related env:

- `MIN_TRUST_SCORE` (default `70`)
- `RADAR_API_TIMEOUT_MS` (default `15000`)
- `REQUEST_TIMEOUT_MS` (optional legacy fallback when `RADAR_API_TIMEOUT_MS` is unset)

### Curl example

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

## Radar modes

- `live`: backend preflight decision came from `POST /v1/preflight`.
- `mock`: no `RADAR_API_BASE_URL`; local mock Radar data/router used.
- `fallback`: live preflight configured but unavailable; local router used.

`demo:compare` and `benchmark` prefer backend preflight decisions when available, and automatically fall back to local routing otherwise.
Live Radar preflight can be verified before live Pay.sh execution exists, but outcome comparisons are only meaningful when both naive and Radar paths use the same catalog/execution source.

## Live Pay.sh execution status

- Radar preflight is live-capable today via `RADAR_API_BASE_URL`.
- Pay.sh execution is env-gated and only attempted when `LIVE_PAYSH_EXECUTION=true`.
- Benchmark outcome proof requires `LIVE_PAYSH_EXECUTION=true` and real provider execution calls.
- Never commit live secrets (API keys/tokens) to git.

## Live market-data execution demo

Live Radar preflight is working today. Live Pay.sh execution is optional and strictly env-gated.
If `LIVE_PAYSH_EXECUTION=true` and `PAYSH_EXECUTION_URL` are not both configured, the demo will honestly skip execution and record that caveat in proof output.

This demo uses the proven StableCrypto market-data route. In the first successful run, Radar selected `merit-systems-stablecrypto-market-data`, the harness executed the provider through Pay.sh CLI, and StableCrypto returned live SOL/USD data.
This proves one Radar-selected Pay.sh route is executable end-to-end. It does not prove Radar outperforms naive routing yet.

Run preflight-only demo:

```bash
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com \
RADAR_API_TIMEOUT_MS=15000 \
npm run demo:live-market-data
```

Run with optional live Pay.sh execution over plain HTTP:

```bash
LIVE_PAYSH_EXECUTION=true \
PAYSH_EXECUTION_URL=<your-pay-sh-gateway-endpoint> \
PAYSH_EXECUTION_METHOD=POST \
PAYSH_EXECUTION_BODY_JSON='<json-body>' \
MARKET_DATA_MAX_LATENCY_MS=3000 \
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com \
RADAR_API_TIMEOUT_MS=15000 \
npm run demo:live-market-data
```

### Proven StableCrypto endpoint

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

Latency caveat for CLI mode: `PAYSH_EXECUTION_MODE=pay_cli` latency includes CLI process startup, payment flow, wallet interaction, and network overhead. Do not interpret it as raw provider latency.

## Live market-data benchmark

Run repeated live Radar preflight + Pay.sh CLI execution trials for the stablecrypto market-data route:

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

`LIVE_MARKET_DATA_TRIALS` can be used instead of `--trials`.

Artifacts are written to:

- `benchmark-results/live-market-data/latest.json`
- `benchmark-results/live-market-data/latest.csv`
- `benchmark-results/live-market-data/summary.md`

## Benchmark mode

`demo:compare` proves the routing shape for a single naive-vs-Radar decision.

Benchmark mode provides the measurement scaffold for repeated trials. The live market-data benchmark currently measures repeatability of one Radar-selected route. It does not yet prove Radar-assisted routing beats naive routing.

Pay.sh execution remains simulated unless live execution is explicitly enabled and configured.

This still does not prove live Pay.sh settlement outcomes when execution is skipped or simulated.
If the run mixes mock and live sources (for example, mock Pay.sh catalog with live Radar preflight), the harness marks benchmark validity as `live_preflight_only` and avoids reporting Radar vs naive wins as a real comparison.

### Run benchmark

```bash
npm run benchmark
BENCHMARK_TRIALS=50 npm run benchmark
npm run benchmark -- --trials=50
```

Benchmark writes local generated artifacts to `benchmark-results/latest.json`, `benchmark-results/latest.csv`, and `benchmark-results/summary.md`. These `latest` artifacts are git-ignored so repeated runs do not dirty the repo.
Live market-data benchmark artifacts are written under `benchmark-results/live-market-data/`.
The latest committed live repeatability summary is available at `benchmark-results/live-market-data/summary.md`.

## Install

```bash
npm install
cp .env.example .env
npm run demo:route
npm run demo:compare
```

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

If base URLs are unset or unavailable, the harness falls back to clearly labeled mock/fallback behavior.

## Use as an agent tool

This repo exposes two functions for local agent workflows:

- `callRadarPreflight` from `src/index.ts`
- `executeLivePayShCall` from `src/index.ts`

Once packaged, these can become the public import surface.

Example artifacts for agent adoption:

- `examples/openai-tool-schema.json`: OpenAI tool schema for Radar preflight.
- `examples/langchain-tool.ts`: LangChain tool wrapper that calls Radar preflight before selecting Pay.sh execution.
- `examples/live-market-data-agent.ts`: end-to-end agent flow:
  - set intent
  - call Radar preflight
  - if route is approved, execute Pay.sh (supports CLI mode via `PAYSH_EXECUTION_MODE=pay_cli`)

Run examples with `ts-node`:

```bash
npx ts-node examples/live-market-data-agent.ts
npx ts-node examples/langchain-tool.ts
```

`examples/langchain-tool.ts` uses `@langchain/core` and `zod`; install them before running:

```bash
npm install @langchain/core zod
```

Publication note: npm publish is intentionally not performed yet.

## Scripts

- `npm run demo:route`: single Radar-assisted route decision + proof log.
- `npm run demo:compare`: naive catalog route vs Radar-assisted route + proof log.
- `npm run demo:live-market-data`: Radar preflight plus optional single-provider live Pay.sh execution demo + proof log.
- `npm run benchmark:live-market-data`: repeated live market-data route benchmark + JSON/CSV/Markdown reports.
- `npm run benchmark`: repeated naive vs Radar benchmark + JSON/CSV/Markdown reports.
- `npm run typecheck`: TypeScript typecheck.
- `npm run build`: compile to `dist/`.

## Proof log fields

Proof logs include Radar-specific integration metadata:

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

Latency semantics:

- Legacy `latencyMs` is execution latency measured by the harness.
- `executionLatencyMs` is the explicit execution-latency field.
- `cliTotalLatencyMs` is populated in `pay_cli` mode and equals execution latency for that run.
- `radarProviderLatencyMs` comes from Radar-selected provider telemetry.
- `providerReportedLatencyMs` is `null` unless provider response includes timing.

## What this proves

- Agents can query live Infopunks Radar before attempting a Pay.sh call.
- Radar can select a live Pay.sh provider from the live catalog.
- The harness can execute a Radar-selected StableCrypto route through Pay.sh CLI.
- The StableCrypto route has returned live SOL/USD market data.
- The harness can write machine-readable proof logs for preflight and execution.
- The live market-data benchmark can repeatedly execute one Radar-selected route.

This proves repeatability for one narrow market-data route. It does not yet prove Radar improves outcomes versus naive routing.

## What this does not prove yet

- Radar superiority over naive routing.
- Lower failure rate, lower cost, or better latency versus naive provider selection.
- Multi-provider or multi-intent reliability.
- External builder adoption.
- Production SLA behavior.
- Full settlement/transaction-reference capture inside the harness.

## Repository Layout

- `src/radarClient.ts`: Radar intelligence client + live preflight + fallback.
- `src/payShClient.ts`: Pay.sh catalog client + mock fallback.
- `src/router.ts`: deterministic local routing policy.
- `src/proofLog.ts`: JSON proof writer.
- `src/demoRoute.ts`: single decision demo.
- `src/demoCompare.ts`: naive vs Radar demo.
- `src/benchmarkRunner.ts`: benchmark orchestration.
