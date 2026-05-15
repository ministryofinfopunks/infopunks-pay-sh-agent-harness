import "dotenv/config";
import { radarPreflightAndExecute } from "../src";
import {
  AgentLoopFlow,
  expandFlowSelection,
  isDryRunMode,
  parseFlowArg,
} from "../src/agentLoopDemoHelpers";

interface DemoFlowConfig {
  flow: AgentLoopFlow;
  intent: string;
  category: string;
  expectedProvider: string;
  endpointUrl: string;
  method: "GET" | "POST";
  body?: unknown;
  outputShape: string;
  nextAction: string;
}

const FLOW_CONFIGS: Record<AgentLoopFlow, DemoFlowConfig> = {
  research: {
    flow: "research",
    intent: "research latest Solana agent payments",
    category: "ai_ml",
    expectedProvider: "PaySponge Perplexity",
    endpointUrl: "https://pplx.x402.paysponge.com/search",
    method: "POST",
    body: { query: "latest Solana agent payments", max_results: 1 },
    outputShape: "research_answer",
    nextAction: "Agent can use this as cited research context.",
  },
  market: {
    flow: "market",
    intent: "get trending Solana DEX pools",
    category: "finance",
    expectedProvider: "PaySponge CoinGecko",
    endpointUrl: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/trending_pools",
    method: "GET",
    outputShape: "trending_pools",
    nextAction: "Agent can use this to choose market-data source for Solana pools.",
  },
  rpc: {
    flow: "rpc",
    intent: "check Solana RPC health",
    category: "compute",
    expectedProvider: "QuickNode",
    endpointUrl: "https://x402.quicknode.com/solana-mainnet/",
    method: "POST",
    body: { jsonrpc: "2.0", id: 1, method: "getHealth", params: [] },
    outputShape: "json_rpc_health",
    nextAction: "Agent can use this to confirm Solana RPC health before chain action.",
  },
};

function sanitizePreview(value: string | undefined): string {
  if (!value) {
    return "n/a";
  }

  const compact = value.replace(/\s+/g, " ").slice(0, 280);
  const redacted = compact
    .replace(/("?(?:settlementReference|signature|paymentSignature|txHash)"?\s*[:=]\s*")([^"]+)(")/gi, "$1[redacted]$3")
    .replace(/\b(0x[a-fA-F0-9]{16,}|[A-Za-z0-9_-]{32,})\b/g, "[redacted-token]");

  return redacted;
}

function printSafeMode(config: DemoFlowConfig): void {
  console.log("Safe mode: live Pay.sh execution is disabled (LIVE_PAYSH_EXECUTION !== true).");
  console.log(`Would run intent: ${config.intent}`);
  console.log(`Would use category: ${config.category}`);
  console.log(`Expected provider: ${config.expectedProvider}`);
  console.log(`Would call: ${config.method} ${config.endpointUrl}`);
  console.log(`Body: ${config.body ? JSON.stringify(config.body) : "n/a"}`);
  console.log("Proof enabled: true");
  console.log(`Rerun live: LIVE_PAYSH_EXECUTION=true PAYSH_EXECUTION_MODE=pay_cli npm run demo:agent-loop -- --flow=${config.flow}`);
}

async function runFlow(flow: AgentLoopFlow, liveExecutionEnabled: boolean): Promise<void> {
  const config = FLOW_CONFIGS[flow];

  console.log(`\nFlow: ${config.flow}`);
  console.log(`Intent: ${config.intent}`);
  console.log(`Expected provider: ${config.expectedProvider}`);

  if (!liveExecutionEnabled) {
    printSafeMode(config);
    console.log("Selected provider: n/a");
    console.log("Route approved: false");
    console.log("Execution attempted: false");
    console.log("Execution success: false");
    console.log("Proof path: n/a");
    console.log("Response preview: n/a");
    console.log(`Next action: ${config.nextAction}`);
    return;
  }

  const result = await radarPreflightAndExecute({
    intent: config.intent,
    category: config.category,
    execution: {
      endpointUrl: config.endpointUrl,
      method: config.method,
      body: config.body,
    },
    proof: { enabled: true },
    maxRetries: 2,
    logger: (event) => console.log("[agent-loop]", JSON.stringify(event)),
  });

  const executionAttempted = Boolean(result.executionResult) || result.decision.approved;
  const selectedProvider =
    result.decision.selectedProviderId ?? result.routingResult?.selectedProvider?.name ?? "n/a";

  console.log(`Selected provider: ${selectedProvider}`);
  console.log(`Route approved: ${result.decision.approved}`);
  console.log(`Execution attempted: ${executionAttempted}`);
  console.log(`Execution success: ${result.success}`);
  console.log(`Proof path: ${result.proofPath ?? "n/a"}`);
  console.log(`Response preview: ${sanitizePreview(result.executionResult?.responsePreview)}`);
  console.log(`Next action: ${result.success ? config.nextAction : "Execution failed; investigate route/execution logs before agent action."}`);
  console.log(`Output shape: ${config.outputShape}`);
}

export async function runAgentLoopDemo(argv: string[]): Promise<void> {
  const flowArg = parseFlowArg(argv);
  const flows = expandFlowSelection(flowArg);
  const liveExecutionEnabled = !isDryRunMode(process.env);

  for (const flow of flows) {
    await runFlow(flow, liveExecutionEnabled);
  }
}

if (require.main === module) {
  runAgentLoopDemo(process.argv.slice(2)).catch((error) => {
    console.error("agent-loop-demo failed", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
