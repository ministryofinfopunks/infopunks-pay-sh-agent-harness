# infopunks-pay-sh-agent-harness

Minimal TypeScript/Node.js demo harness showing how an autonomous agent can query **Infopunks Radar** before making a **Pay.sh** provider/API decision.

This is intentionally small and runnable in under 2 minutes.

## Architecture

- **Pay.sh** is the payment/catalog layer (provider list and payment execution surface).
- **Infopunks Radar** is the pre-flight intelligence layer (trust/signal/degradation/latency inputs).
- The agent asks Radar first, then routes deterministically.
- This harness demonstrates pre-flight intelligence usage, not dashboarding.

## Install

```bash
npm install
cp .env.example .env
npm run demo:route
npm run demo:compare
```

## Environment Setup

`.env` values:

- `RADAR_API_BASE_URL` (optional): base URL for live Radar API.
- `PAYSH_API_BASE_URL` (optional): base URL for live Pay.sh provider/catalog API.
- `MIN_TRUST_SCORE` (default `70`): routing threshold.
- `REQUEST_TIMEOUT_MS` (default `2500`): external call timeout.

If either base URL is unset or unavailable, the harness falls back to clearly labeled mock data.

## Scripts

- `npm run demo:route` runs one Radar-assisted route decision and writes proof log JSON.
- `npm run demo:compare` compares naive catalog choice vs Radar-assisted route and writes proof log JSON.
- `npm run typecheck` runs TypeScript type checks.
- `npm run build` compiles to `dist/`.

## Routing Policy

Deterministic rules in `src/router.ts`:

1. Reject provider if `trustScore < MIN_TRUST_SCORE`.
2. Reject provider if degradation flag is active.
3. Among remaining candidates, prefer higher `signalScore`.
4. If `signalScore` is tied, prefer lower `latencyMs`.
5. Return selected provider plus rejected providers with explicit reasons.

## Sample Output

`npm run demo:route`

```text
=== Radar-Assisted Route Decision ===
Intent: send payout to a verified provider
Catalog mode: mock
Catalog note: PAYSH_API_BASE_URL not set. Using mock Pay.sh provider catalog.
Radar mode: mock
Radar note: RADAR_API_BASE_URL not set. Using mock Radar signals.
Selected provider:
- Pay.sh Delta Node (paysh-delta) | trust=85 signal=88 latency=105ms
Rejected providers:
- Pay.sh Beta Node (paysh-beta): trustScoreBelowMin(62<70)
- Pay.sh Gamma Node (paysh-gamma): degradationFlagActive
- Pay.sh Alpha Node (paysh-alpha): notTopRanked, higherLatencyOnTie(140>105)
```

`npm run demo:compare`

```text
=== Naive vs Radar-Assisted Comparison ===
Intent: select provider for a payout request
Naive catalog selection: Pay.sh Beta Node (paysh-beta)
Radar-assisted selection: Pay.sh Delta Node (paysh-delta)
Did Radar improve route? yes
Reason: Radar changed the route because the naive provider failed trust/degradation policy checks.
```

## Proof Logs

Each run writes a JSON proof file to `./proofs/*.json`.

Proof schema includes:

- `timestamp`
- `userIntent`
- `candidateProviders`
- `selectedProvider`
- `rejectedProviders`
- `radarSignalsUsed`
- `routingPolicy`
- `simulatedOrLiveResult`
- `latencyMs`
- `success`

`demo:compare` also includes a `comparison` block for naive vs Radar outcomes.

## What this proves

- An autonomous agent can call Radar as a pre-flight intelligence layer before provider execution.
- Deterministic routing can enforce trust/degradation policy and still optimize by signal/latency.
- Every decision can be auditable via machine-readable proof logs.
- The architecture is cleanly split so mock clients can be replaced by live API clients.

## What this does not prove yet

- Real-world provider execution reliability or settlement outcomes.
- Production-grade SLA behavior under live traffic.
- Correctness of live external schemas/endpoints without integration validation.
- End-to-end value without real external API usage and empirical measurement.

## Repository Layout

- `src/radarClient.ts` Radar intelligence client with fallback behavior.
- `src/payShClient.ts` Pay.sh provider catalog client with mock fallback.
- `src/router.ts` deterministic policy routing.
- `src/proofLog.ts` proof writer to `./proofs`.
- `src/demoRoute.ts` single route decision demo.
- `src/demoCompare.ts` naive vs Radar comparison demo.

## Notes

- No secrets are committed.
- Use environment variables for runtime configuration.
- Mock payloads are intentionally explicit to make live-client replacement straightforward.
