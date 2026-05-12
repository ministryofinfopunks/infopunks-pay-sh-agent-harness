import "dotenv/config";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callRadarPreflight, executeLivePayShCall } from "../src";

const radarPreflightTool = new DynamicStructuredTool({
  name: "radar_preflight",
  description: "Call Infopunks Radar before selecting a Pay.sh provider.",
  schema: z.object({
    intent: z.string(),
    category: z.string().optional(),
    constraints: z
      .object({
        minTrustScore: z.number().optional(),
        maxLatencyMs: z.number().optional(),
        maxCostUsd: z.number().optional(),
      })
      .optional(),
    candidateProviders: z.array(z.string()).optional(),
  }),
  func: async (input) => {
    const result = await callRadarPreflight(input);
    return JSON.stringify(result);
  },
});

async function main(): Promise<void> {
  const intent = "get crypto market data";

  const preflightRaw = await radarPreflightTool.invoke({
    intent,
    category: "finance",
    constraints: {
      minTrustScore: 70,
      maxLatencyMs: 3000,
      maxCostUsd: 0.05,
    },
  });

  const preflight = JSON.parse(preflightRaw) as {
    decision?: {
      decision: string;
      selectedProvider: string | null;
    };
  };

  if (preflight.decision?.decision !== "route_approved" || !preflight.decision.selectedProvider) {
    console.log("Radar blocked routing. Skip Pay.sh execution.");
    console.log(preflightRaw);
    return;
  }

  const execution = await executeLivePayShCall({
    providerId: preflight.decision.selectedProvider,
    intent,
    endpointUrl: process.env.PAYSH_EXECUTION_URL,
  });

  console.log(
    JSON.stringify(
      {
        selectedProvider: preflight.decision.selectedProvider,
        mode: execution.mode,
        success: execution.success,
        latencyMs: execution.latencyMs,
      },
      null,
      2,
    ),
  );
}

void main();
