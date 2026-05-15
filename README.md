# Infopunks Pay.sh Agent Harness

> **Infopunks Pay.sh Agent Harness v0.4.2**  
> **10+ verified Pay.sh CLI routes across 8 providers.**  
> **Extended Radar diagnostics: 60/60 expected-provider successes.**

Pay.sh is the spend rail.  
Radar is the intelligence layer.  
This harness is the proof adapter.

Install from GitHub:

```bash
npm install github:ministryofinfopunks/infopunks-pay-sh-agent-harness#v0.4.2
```

Pinned reference examples:

```bash
npm install github:ministryofinfopunks/infopunks-pay-sh-agent-harness#main
npm install github:ministryofinfopunks/infopunks-pay-sh-agent-harness#v0.4.2
```

## Verified Providers

| Category | Provider | Verified route/output shape | Status | Notes |
| --- | --- | --- | --- | --- |
| Finance / simple price | StableCrypto | `simple_price` | `verified_pay_cli_success` | Verified through Pay.sh CLI |
| Finance / trending pools | PaySponge CoinGecko | `trending_pools` | `verified_pay_cli_success` | Verified through Pay.sh CLI |
| Compute / Solana RPC | QuickNode | `getHealth` / `json_rpc_health` | `verified_pay_cli_success` | Verified through Pay.sh CLI |
| Compute / Solana RPC | QuickNode | `getBalance` / `json_rpc_balance` | `verified_pay_cli_success` | Verified through Pay.sh CLI |
| Compute / Solana RPC | QuickNode | `getSlot` / `json_rpc_slot` | `verified_pay_cli_success` | Verified through Pay.sh CLI |
| AI research | PaySponge Perplexity | `research_answer` | `verified_pay_cli_success` | Verified through Pay.sh CLI |
| Vision | Google Vision | `image_labels` | `verified_pay_cli_success` | Verified through Pay.sh CLI |
| Maps | Google Places | `places_search` | `verified_pay_cli_success` | Verified through Pay.sh CLI |
| Messaging / inbox | AgentMail | `agent_inbox` | `verified_pay_cli_success` | Read-only inbox list |
| Messaging / SMS status | Textbelt | `sms_status` | `verified_pay_cli_success` | Status check route |

Diagnostic profiles route to a subset of these routes; the verified mapping inventory is broader than the diagnostic profile list.

## How Agents Use This

```text
Intent
  ↓
Radar preflight
  ↓
Verified provider route
  ↓
Pay.sh execution
  ↓
Proof log
  ↓
Agent answer/action
```

- Intent: the agent states what it needs and in which category.
- Radar preflight: Radar scores candidates and returns routing guidance.
- Verified provider route: the harness selects a mapped, validated endpoint shape.
- Pay.sh execution: the harness executes via Pay.sh when live mode is enabled.
- Proof log: execution and verification metadata are persisted for traceability.
- Agent answer/action: the agent returns a response grounded in proofed execution.

## Copy-Paste Agent Example

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
  proof: { enabled: true },
  maxRetries: 2,
  logger: (event) => console.log("[infopunks-harness]", event)
});

if (!result.success) {
  console.log(result.skippedExecutionReason ?? result.executionResult?.errorReason);
}
```

`LIVE_PAYSH_EXECUTION=true` is required for real Pay.sh execution.  
When live execution is not enabled, execution is safely skipped according to harness configuration (`executionMode` and env settings).

## Real Agent Loop Demo

```bash
npm run demo:agent-loop -- --flow=research
npm run demo:agent-loop -- --flow=market
npm run demo:agent-loop -- --flow=rpc
LIVE_PAYSH_EXECUTION=true PAYSH_EXECUTION_MODE=pay_cli npm run demo:agent-loop -- --flow=all
```

This demo shows the harness as an agent-side preflight + execution + proof adapter.

## Generated Proof Log Example

See [examples/proof-log.example.json](/Users/ahdilm/Documents/infopunks-pay-sh-agent-harness/examples/proof-log.example.json) for a sanitized sample.

## Commands

| Command | Description |
| --- | --- |
| `npm run typecheck` | Run TypeScript type checks (`tsc --noEmit`) |
| `npm test` | Run the Node test suite in `src/*.test.ts` |
| `npm run build` | Build TypeScript output into `dist` |
| `npm run mappings:status` | Print mapping verification inventory/status |
| `npm run verify:mapping` | Verify one mapping route and output-shape result |
| `npm run benchmark:multi-category` | Run multi-category routing benchmark script |
| `npm run diagnose:radar-preflight` | Run Radar preflight diagnostics script |

## Diagnostics Snapshot

Current v0.4.1/v0.4.2 extended Radar diagnostics:

- 60/60 expected-provider successes
- 0 timeouts
- 0 no_candidates
- 0 route blocks
- 0 wrong providers

These diagnostics measure live Radar preflight behavior. They do not execute Pay.sh calls.

## Current Verified Coverage

- Finance: StableCrypto simple price, PaySponge CoinGecko trending pools
- Compute: QuickNode Solana RPC (`getHealth`, `getBalance`, `getSlot`)
- AI research: PaySponge Perplexity search
- Vision: Google Vision labels
- Maps: Google Places search
- Messaging: AgentMail inbox list, Textbelt SMS status

## Verify a Candidate Mapping

Use the verification helper to distinguish:
- x402 challenge exists (`verified_402`)
- paid execution succeeds with expected shape (`verified_pay_cli_success`)

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

## Package Status

- GitHub-distributed.
- npm publishing intentionally deferred during supply-chain monitoring/validation.
- Ready for agent integration.
- Live Radar availability is measured separately by diagnostics.
- No production SLA is claimed.

## Public API

- `radarPreflightAndExecute(input)`: run preflight, route selection, optional execution, and optional proof logging.
- `callRadarPreflight(input)`: run Radar preflight directly.
- `executeLivePayShCall(input)`: execute a selected Pay.sh provider call.
- `routeProvider(...)`: local router with provider metadata and Radar signals.
- `saveProofLog(...)`: save proof records for preflight/execution outcomes.
