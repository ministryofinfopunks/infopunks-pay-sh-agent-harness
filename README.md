# infopunks-pay-sh-agent-harness

Minimal TypeScript/Node.js harness showing one thing: an agent can query **Infopunks Radar** before spending through **Pay.sh**, then log machine-readable proof of the decision.

> [!IMPORTANT]
> This is a minimal demo harness. It demonstrates integration shape and decision logging, but real adoption still requires external agent usage against live systems.

## Live Radar Preflight Integration

When `RADAR_API_BASE_URL` is set, the harness calls the live machine-callable Radar endpoint:

- `POST {RADAR_API_BASE_URL}/v1/preflight`

If the live preflight call fails or times out, the harness falls back to local mock routing logic.

### Required env for live Radar

```bash
RADAR_API_BASE_URL=https://your-radar-url
```

Optional related env:

- `MIN_TRUST_SCORE` (default `70`)
- `REQUEST_TIMEOUT_MS` (default `2500`)

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

## Benchmark mode

`demo:compare` proves the routing shape for a single naive-vs-Radar decision.

Benchmark mode measures whether Radar-assisted routing produces better outcomes across repeated trials.

The execution layer in this harness is still simulated unless live execution is implemented.

This still does not prove live Pay.sh execution outcomes.

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
- `PAYSH_API_BASE_URL` (optional): live Pay.sh catalog API base URL.
- `MIN_TRUST_SCORE` (default `70`): routing threshold.
- `REQUEST_TIMEOUT_MS` (default `2500`): external request timeout.

If base URLs are unset or unavailable, the harness falls back to clearly labeled mock/fallback behavior.

## Scripts

- `npm run demo:route`: single Radar-assisted route decision + proof log.
- `npm run demo:compare`: naive catalog route vs Radar-assisted route + proof log.
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
