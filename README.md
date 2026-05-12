# infopunks-pay-sh-agent-harness

Minimal TypeScript/Node.js harness showing one thing: an agent can query **Infopunks Radar** before spending through **Pay.sh**, then log machine-readable proof of the decision.

> [!IMPORTANT]
> This is a minimal demo harness. It demonstrates integration shape and decision logging, but real adoption still requires external agent usage against live systems.

## Benchmark mode

`demo:compare` proves the routing shape for a single naive-vs-Radar decision.

Benchmark mode starts measuring whether Radar-assisted routing produces better outcomes across repeated trials.

The initial benchmark mode is simulated unless live execution is configured.

This still does not prove live Pay.sh value until real endpoint execution is added.

Simulated benchmark shows the measurement framework and expected policy behavior.

### Run benchmark

```bash
npm run benchmark
BENCHMARK_TRIALS=50 npm run benchmark
npm run benchmark -- --trials=50
```

### Sample benchmark output

```text
Naive success rate: 76.67%
Radar success rate: 100.00%
Average latency (ms): naive=111.47, radar=104.93
Average cost (USD): naive=0.005, radar=0.004778
Average quality: naive=72.26, radar=82.09
Radar wins / naive wins / ties: 26 / 0 / 4
```

## 30-second demo

```bash
npm install
cp .env.example .env
npm run demo:compare
```

You should immediately see whether naive catalog routing would have spent on a provider that Radar policy rejects.

## Why pre-flight matters

Payment agents should not call a provider just because it appears first in a catalog.

Pre-flight policy checks from Radar let the agent:

- reject low-trust providers,
- reject providers currently degraded,
- choose the best remaining route by signal quality and latency,
- leave an auditable proof record for each decision.

In this harness, **Pay.sh is the catalog/payment layer** and **Radar is the pre-flight intelligence layer**.

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

If base URLs are unset or unavailable, the harness falls back to clearly labeled mock data.

## Scripts

- `npm run demo:route`: single Radar-assisted route decision + proof log.
- `npm run demo:compare`: naive catalog route vs Radar-assisted route + proof log.
- `npm run benchmark`: repeated naive vs Radar benchmark + JSON/CSV/Markdown reports.
- `npm run typecheck`: TypeScript typecheck.
- `npm run build`: compile to `dist/`.

## Example Terminal Output (`npm run demo:compare`)

```text
=== Naive vs Radar-Assisted Comparison ===
Intent: select provider for a payout request
Pre-flight verdict: blocked/redirected spend before provider call
Naive catalog selection: Pay.sh Beta Node (paysh-beta)
Naive policy status: fails
Naive rejection reasons: trustScoreBelowMin(62<70)
Radar-assisted selection: Pay.sh Delta Node (paysh-delta)
Data mode: catalog=mock, radar=mock, result=simulated-or-fallback
Did Radar improve route? yes
Reason: Radar changed the route because the naive provider failed trust/degradation policy checks.
Proof log saved: /.../proofs/<timestamp>-demo-compare.json
Comparison latency: <n>ms
```

## Example Proof JSON Excerpt

```json
{
  "timestamp": "2026-05-12T07:05:12.190Z",
  "userIntent": "select provider for a payout request",
  "selectedProvider": {
    "id": "paysh-delta",
    "trustScore": 85,
    "degradationActive": false,
    "signalScore": 88,
    "latencyMs": 105
  },
  "rejectedProviders": [
    {
      "providerId": "paysh-beta",
      "reasons": ["trustScoreBelowMin(62<70)"]
    }
  ],
  "routingPolicy": [
    "reject trustScore < 70",
    "reject degradationFlagActive",
    "prefer higher signalScore",
    "tie-break by lower latencyMs"
  ],
  "simulatedOrLiveResult": "simulated-or-fallback",
  "success": true,
  "comparison": {
    "naiveSelectionPolicyStatus": "fails",
    "radarImprovedRoute": true
  }
}
```

## Routing Policy

Deterministic rules in `src/router.ts`:

1. Reject if `trustScore < MIN_TRUST_SCORE`.
2. Reject if degradation flag is active.
3. Prefer higher `signalScore`.
4. Tie-break by lower `latencyMs`.
5. Return selected provider plus rejected providers and reasons.

## What this proves

- Agents can query Radar before spending through Pay.sh.
- Pre-flight policy can block/redirect risky naive routes.
- Each decision can be logged as JSON proof (`./proofs/*.json`).
- Live API clients can replace mocks without changing routing logic.

## What this does not prove yet

- Real-world settlement outcomes.
- Production SLA behavior.
- Live schema compatibility without integration testing.
- Adoption or business impact without external agent usage.

## Repository Layout

- `src/radarClient.ts`: Radar intelligence client + fallback.
- `src/payShClient.ts`: Pay.sh catalog client + mock fallback.
- `src/router.ts`: deterministic routing policy.
- `src/proofLog.ts`: JSON proof writer.
- `src/demoRoute.ts`: single decision demo.
- `src/demoCompare.ts`: naive vs Radar demo.
