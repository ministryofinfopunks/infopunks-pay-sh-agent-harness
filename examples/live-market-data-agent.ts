import "dotenv/config";
import { callRadarPreflight, executeLivePayShCall } from "../src";

async function runLiveMarketDataAgent(): Promise<void> {
  const intent = "get crypto market data";

  console.log("Intent:", intent);

  const preflight = await callRadarPreflight({
    intent,
    category: "finance",
    constraints: {
      minTrustScore: 70,
      maxLatencyMs: 3000,
      maxCostUsd: 0.05,
    },
  });

  console.log("Radar preflight:", JSON.stringify(preflight, null, 2));

  const routeApproved = preflight.decision?.decision === "route_approved";
  const selectedProvider = preflight.decision?.selectedProvider ?? null;

  if (!routeApproved || !selectedProvider) {
    console.log("Route not approved. Skipping Pay.sh CLI mode execution.");
    return;
  }

  const execution = await executeLivePayShCall({
    providerId: selectedProvider,
    intent,
    endpointUrl: process.env.PAYSH_EXECUTION_URL,
  });

  console.log("Pay.sh execution result:", JSON.stringify(execution, null, 2));
}

void runLiveMarketDataAgent();
