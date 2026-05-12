# infopunks-pay-sh-agent-harness

Minimal TypeScript/Node.js harness showing one thing: an agent can query **Infopunks Radar** before spending through **Pay.sh**, then log machine-readable proof of the decision.

> [!IMPORTANT]
> This is a minimal demo harness. It demonstrates integration shape and decision logging, but real adoption still requires external agent usage against live systems.

## Live Radar Preflight Integration

When `RADAR_API_BASE_URL` is set, the harness calls the live machine-callable Radar endpoint:

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
    "intent": "select provider for a payout request",
    "constraints": {
      "minTrustScore": 70,
      "maxLatencyMs": 250,
      "maxCostUsd": 0.01
    },
    "candidateProviders": ["paysh-alpha", "paysh-beta", "paysh-gamma", "paysh-delta"]
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

This is the first single-provider execution path for crypto/market-data style intent routing. It does not yet prove generalized Radar improvement across all providers or intents.

Run preflight-only demo:

```bash
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com \
RADAR_API_TIMEOUT_MS=15000 \
npm run demo:live-market-data
```

Run with optional live Pay.sh execution:

```bash
LIVE_PAYSH_EXECUTION=true \
PAYSH_EXECUTION_URL=<gateway-url-from-pay.sh> \
MARKET_DATA_MAX_LATENCY_MS=3000 \
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com \
RADAR_API_TIMEOUT_MS=15000 \
npm run demo:live-market-data
```

## Benchmark mode

`demo:compare` proves the routing shape for a single naive-vs-Radar decision.

Benchmark mode measures whether Radar-assisted routing produces better outcomes across repeated trials.

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

A committed example summary is kept at `benchmark-results/sample-summary.md`.

## Install

```bash
npm install
cp .env.example .env
npm run demo:route
npm run demo:compare
```

## Environment Setup

`.env` values:

- `RADAR_API_BASE_URL` (optional): live Radar API base URL.
- `RADAR_API_TIMEOUT_MS` (default `15000`): Radar API request timeout.
- `PAYSH_API_BASE_URL` (optional): live Pay.sh catalog API base URL.
- `LIVE_PAYSH_EXECUTION` (optional): set to `true` to attempt live Pay.sh execution.
- `PAYSH_EXECUTION_URL` (optional unless live execution enabled): full URL for one live execution endpoint.
- `PAYSH_EXECUTION_METHOD` (optional): HTTP method for execution call (default `GET`).
- `PAYSH_AUTH_HEADER` (optional): auth header name for execution call.
- `PAYSH_AUTH_VALUE` (optional): auth header value for execution call.
- `MIN_TRUST_SCORE` (default `70`): routing threshold.
- `REQUEST_TIMEOUT_MS` (optional legacy fallback when `RADAR_API_TIMEOUT_MS` is unset): external request timeout.

If base URLs are unset or unavailable, the harness falls back to clearly labeled mock/fallback behavior.

## Scripts

- `npm run demo:route`: single Radar-assisted route decision + proof log.
- `npm run demo:compare`: naive catalog route vs Radar-assisted route + proof log.
- `npm run demo:live-market-data`: Radar preflight plus optional single-provider live Pay.sh execution demo + proof log.
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

## What this proves

- Agents can query Radar before spending through Pay.sh.
- Pre-flight policy can block/redirect risky naive routes.
- Each decision can be logged as JSON proof (`./proofs/*.json`).
- Live API clients can replace mocks without changing overall harness flow.

## What this does not prove yet

- Real-world settlement outcomes.
- Production SLA behavior.
- Live schema compatibility without integration testing.
- Adoption or business impact without external agent usage.

## Repository Layout

- `src/radarClient.ts`: Radar intelligence client + live preflight + fallback.
- `src/payShClient.ts`: Pay.sh catalog client + mock fallback.
- `src/router.ts`: deterministic local routing policy.
- `src/proofLog.ts`: JSON proof writer.
- `src/demoRoute.ts`: single decision demo.
- `src/demoCompare.ts`: naive vs Radar demo.
- `src/benchmarkRunner.ts`: benchmark orchestration.
