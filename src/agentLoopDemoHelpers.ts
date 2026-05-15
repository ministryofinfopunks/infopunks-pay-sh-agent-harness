export type AgentLoopFlow = "research" | "market" | "rpc";
export type AgentLoopFlowArg = AgentLoopFlow | "all";

const FLOW_ARG_PREFIX = "--flow=";

export function parseFlowArg(argv: string[]): AgentLoopFlowArg {
  const direct = argv.find((arg) => arg.startsWith(FLOW_ARG_PREFIX));
  const spacedIndex = argv.findIndex((arg) => arg === "--flow");
  const rawValue = direct
    ? direct.slice(FLOW_ARG_PREFIX.length)
    : spacedIndex >= 0
    ? argv[spacedIndex + 1]
    : undefined;

  if (!rawValue) {
    return "all";
  }

  if (rawValue === "all" || rawValue === "research" || rawValue === "market" || rawValue === "rpc") {
    return rawValue;
  }

  throw new Error(`Unknown flow: ${rawValue}. Use one of: research, market, rpc, all.`);
}

export function expandFlowSelection(flow: AgentLoopFlowArg): AgentLoopFlow[] {
  if (flow === "all") {
    return ["research", "market", "rpc"];
  }
  return [flow];
}

export function isDryRunMode(env: NodeJS.ProcessEnv): boolean {
  return env.LIVE_PAYSH_EXECUTION !== "true";
}
