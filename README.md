# Infopunks Pay.sh Agent Harness

> **v0.3.2 — Hardened Agent Harness**  
> Retries + logger + tests + CI + collision-resistant proof logs.  
> Multi-category verified across finance, compute, AI research, vision, maps, and messaging.

**Radar preflight + Pay.sh execution + proof logs in one function for agents.**

- Pay.sh is the spend rail.
- Radar is the intelligence layer.
- This harness is the proof adapter between them.
- Agents call Radar before spending through Pay.sh.

## Current verified coverage

- finance: StableCrypto, PaySponge CoinGecko
- compute: QuickNode Solana RPC
- AI research: PaySponge Perplexity
- vision: Google Vision
- maps: Google Places
- messaging: AgentMail, Textbelt

## Install from GitHub

```bash
npm install github:ministryofinfopunks/infopunks-pay-sh-agent-harness#v0.3.2
```

Pinned branch/tag examples:

```bash
npm install github:ministryofinfopunks/infopunks-pay-sh-agent-harness#main
npm install github:ministryofinfopunks/infopunks-pay-sh-agent-harness#v0.3.2
```

Tarball fallback:

```bash
npm install https://github.com/ministryofinfopunks/infopunks-pay-sh-agent-harness/archive/main.tar.gz
```

## What's new in v0.3.2

- Retry support for Radar preflight and Pay.sh execution.
- Optional structured logger hook.
- Stronger core-path harness tests.
- Collision-resistant proof-log naming via `randomUUID`.
- CI via GitHub Actions.
- Harness-aware OpenAI tool schema.
- Non-finance Perplexity research agent example.

Retry behavior:
- Default `maxRetries: 2`.
- Backoff: `500ms`, then `1500ms`.
- Retries timeout/network/unavailable-style failures.
- Does not retry explicit Radar `route_blocked` decisions.

## Drop into an agent

```ts
import { radarPreflightAndExecute } from "@infopunks/pay-sh-harness";

const result = await radarPreflightAndExecute({
  intent: "get trending Solana DEX pools",
  category: "finance",
  constraints: {
    minTrustScore: 70,
    maxLatencyMs: 3000,
    maxCostUsd: 0.05
  },
  execution: {
    endpointUrl: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/trending_pools",
    method: "GET"
  },
  proof: { enabled: true },
  maxRetries: 2,
  logger: (event) => console.log("[infopunks-harness]", event)
});

if (!result.success) {
  console.log(result.skippedExecutionReason ?? result.executionResult?.errorReason);
}
```

## Quickstart: non-finance research (Perplexity)

```ts
import { radarPreflightAndExecute } from "@infopunks/pay-sh-harness";

const result = await radarPreflightAndExecute({
  intent: "research latest Solana agent payments",
  category: "ai_ml",
  execution: {
    endpointUrl: "https://pplx.x402.paysponge.com/search",
    method: "POST",
    body: {
      query: "latest Solana agent payments",
      max_results: 1
    }
  },
  proof: { enabled: true }
});
```

Live execution only happens when `LIVE_PAYSH_EXECUTION=true`.

## Usage variants

Preflight only / no live execution:

```ts
const result = await radarPreflightAndExecute({
  intent: "get crypto market data",
  category: "finance",
  executionMode: "preflight_only",
  proof: { enabled: true }
});
```

Live Pay.sh CLI execution through env vars:

```bash
PAYSH_EXECUTION_MODE=pay_cli \
LIVE_PAYSH_EXECUTION=true \
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com \
npm run demo:live-market-data
```

Proof logging disabled:

```ts
const result = await radarPreflightAndExecute({
  intent: "get crypto market data",
  category: "finance",
  proof: { enabled: false }
});
```

Handling `radar_preflight_unavailable`:

```ts
if (!result.preflightResult.available && result.preflightResult.fallbackReason === "radar_preflight_unavailable") {
  console.log("Radar unavailable, local router fallback used.");
}
```

Checking `executionResult.success`:

```ts
if (result.executionResult?.success) {
  console.log("Pay.sh execution succeeded");
} else {
  console.log(result.executionResult?.errorReason ?? result.skippedExecutionReason);
}
```

## Tests & CI

- Core tests live alongside source as `src/*.test.ts`.
- Run them with `npm test`.
- CI runs typecheck, tests, and build on push/PR using GitHub Actions.
- [CI workflow](.github/workflows/ci.yml)

Coverage examples include:
- preflight-only / execution disabled
- proof disabled
- Radar unavailable fallback/local-router path
- `route_blocked` no execution
- execution exception safe failure
- approved route + execution success
- retry success after first failed Radar attempt
- logger events + swallowed logger throw
- proof filename collision safety
- provider verification application-success checks
- multi-category benchmark classification
- Radar preflight diagnostics classification

## Real agent examples

- [examples/research-agent.ts](examples/research-agent.ts)
- [examples/live-market-data-agent.ts](examples/live-market-data-agent.ts)
- [examples/openai-tool-schema.json](examples/openai-tool-schema.json)

These examples show the harness as an agent-side preflight + execution + proof adapter, not just a benchmark script.

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Run test suite |
| `npm run typecheck` | Run TypeScript type checks |
| `npm run build` | Build package |
| `npm run benchmark:multi-category` | Run multi-category routing benchmark |
| `npm run diagnose:radar-preflight` | Run Radar preflight diagnostics |
| `npm run mappings:status` | Inspect provider mapping verification status |

## Advanced: preflight only

```ts
import { callRadarPreflight } from "@infopunks/pay-sh-harness";

const route = await callRadarPreflight({
  intent: "get crypto market data",
  category: "finance",
  constraints: { minTrustScore: 70, maxLatencyMs: 3000, maxCostUsd: 0.05 }
});

if (route.decision?.decision !== "route_approved") {
  throw new Error("No safe Pay.sh route");
}
```

## Public API

- `radarPreflightAndExecute(input)`: end-to-end helper that runs Radar preflight, routes (Radar or local fallback), optionally executes through Pay.sh, and optionally saves a proof log.
- `callRadarPreflight(input)`: run Radar preflight directly and inspect decision metadata.
- `executeLivePayShCall(input)`: execute a selected Pay.sh provider call through configured live execution mode.
- `routeProvider(...)`: local router using provider metadata and Radar signals.
- `saveProofLog(...)`: persist proof records for preflight/execution outcomes.

## Current live proof

Latest validation:

- 3/3 Radar wins in the dedicated `proof:solana-dex-pools` run.
- 9/9 Radar wins across valid approved comparisons in a 10-trial live head-to-head run.
- 1/10 trial was excluded as `radar_preflight_unavailable` due to Radar API timeout.
- Naive selected `merit-systems-stablecrypto-market-data` / StableCrypto simple price.
- Radar selected `paysponge-coingecko` / PaySponge CoinGecko trending pools.
- Both mapped providers execute through Pay.sh CLI.
- Caveat: this is routing-fit proof, not broad platform superiority.

Reproduce the Solana DEX pools routing-fit proof:

```bash
PAYSH_EXECUTION_MODE=pay_cli \
LIVE_PAYSH_EXECUTION=true \
RADAR_API_BASE_URL=https://infopunks-pay-sh-radar.onrender.com \
RADAR_API_TIMEOUT_MS=15000 \
npm run proof:solana-dex-pools
```

Inspect endpoint mapping status:

```bash
npm run mappings:status
```

## Verify a candidate mapping

Use the verification helper to distinguish:
- x402 challenge exists (`verified_402`)
- paid execution actually succeeds (`verified_pay_cli_success`)

StableCrypto example:

```bash
PAYSH_EXECUTION_MODE=pay_cli \
LIVE_PAYSH_EXECUTION=true \
VERIFY_PROVIDER_ID=merit-systems-stablecrypto-market-data \
VERIFY_ENDPOINT_MAPPING_ID=stablecrypto-coingecko-price \
VERIFY_LABEL="StableCrypto CoinGecko Price" \
VERIFY_ENDPOINT_URL=https://stablecrypto.dev/api/coingecko/price \
VERIFY_METHOD=POST \
VERIFY_BODY_JSON='{"ids":["solana"],"vs_currencies":["usd"]}' \
VERIFY_CATEGORY=finance \
VERIFY_CAPABILITIES='market_data,pricing' \
VERIFY_OUTPUT_SHAPE=simple_price \
npm run verify:mapping
```

402-only verification example (StableEnrich):

```bash
PAYSH_EXECUTION_MODE=pay_cli \
LIVE_PAYSH_EXECUTION=true \
VERIFY_PROVIDER_ID=merit-systems-stableenrich-enrichment \
VERIFY_ENDPOINT_MAPPING_ID=stableenrich-exa-search \
VERIFY_LABEL="StableEnrich Exa Web Search" \
VERIFY_ENDPOINT_URL=https://stableenrich.dev/api/exa/search \
VERIFY_METHOD=POST \
VERIFY_BODY_JSON='{"query":"latest Solana agent payments"}' \
VERIFY_CATEGORY=data \
VERIFY_CAPABILITIES='search,web_search,research,enrichment,data' \
VERIFY_OUTPUT_SHAPE=web_search_results \
npm run verify:mapping
```

Do not promote a mapping to `verified_pay_cli_success` unless this helper returns `success=true` and `parsedJsonAvailable=true`.

## Tested runtime

Tested locally with:
- Node.js 20+
- TypeScript
- Pay.sh CLI for live execution mode

## Package status

- GitHub-distributed.
- npm publishing intentionally deferred during supply-chain monitoring/validation.
- Ready for agent integration.
- Live Radar availability is measured separately by diagnostics.

## OpenAI tool copy-paste

```ts
const infopunksPayShHarnessTool = {
  name: "infopunks_pay_sh_harness",
  description: "Preflight Infopunks Radar, optionally execute a verified Pay.sh route, and write a proof log before agent spend.",
  parameters: {
    type: "object",
    properties: {
      intent: { type: "string" },
      category: { type: "string" },
      constraints: {
        type: "object",
        properties: {
          minTrustScore: { type: "number" },
          maxLatencyMs: { type: "number" },
          maxCostUsd: { type: "number" }
        }
      },
      execution: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          endpointUrl: { type: "string" },
          method: { type: "string" },
          body: {},
          headers: { type: "object", additionalProperties: { type: "string" } }
        }
      },
      proof: {
        type: "object",
        properties: {
          enabled: { type: "boolean" }
        }
      },
      maxRetries: { type: "number", minimum: 0 }
    },
    required: ["intent"]
  }
};
```
