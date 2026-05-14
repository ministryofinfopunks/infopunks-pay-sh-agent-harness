# Infopunks Pay.sh Agent Harness

**Radar preflight + Pay.sh execution + proof logs in one function for agents.**

- Pay.sh is the spend rail.
- Radar is the intelligence layer.
- This harness is the proof adapter between them.
- Agents call Radar before spending through Pay.sh.

## Install from GitHub

```bash
npm install github:ministryofinfopunks/infopunks-pay-sh-agent-harness
```

Pinned branch/tag examples:

```bash
npm install github:ministryofinfopunks/infopunks-pay-sh-agent-harness#main
npm install github:ministryofinfopunks/infopunks-pay-sh-agent-harness#v0.1.1
```

Tarball fallback:

```bash
npm install https://github.com/ministryofinfopunks/infopunks-pay-sh-agent-harness/archive/main.tar.gz
```

## GitHub-only distribution notes

- `npm publish` is intentionally deferred during validation.
- The harness remains dependency-light.
- GitHub install keeps distribution narrower while proofs and provider mappings mature.
- npm release can come later after Trusted Publishing, provenance, and 2FA hardening.

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
  proof: {
    enabled: true
  }
});

if (!result.success) {
  console.log(result.skippedExecutionReason ?? result.executionResult?.errorReason);
}
```

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

- Package metadata is prepared.
- Public API is exported from `src/index.ts` and builds to `dist/index.js`.
- Not published to npm yet unless release has been completed.

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
