import { radarPreflightAndExecute } from "../src";

async function run(): Promise<void> {
  const liveExecutionEnabled = process.env.LIVE_PAYSH_EXECUTION === "true";

  const result = await radarPreflightAndExecute({
    intent: "research latest Solana agent payments",
    category: "ai_ml",
    constraints: {
      minTrustScore: 70,
      maxLatencyMs: 5000,
      maxCostUsd: 0.1,
    },
    execution: {
      enabled: liveExecutionEnabled,
      endpointUrl: "https://pplx.x402.paysponge.com/search",
      method: "POST",
      body: {
        query: "latest Solana agent payments",
        max_results: 1,
      },
    },
    proof: {
      enabled: true,
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => {
  console.error("research-agent failed", error);
  process.exitCode = 1;
});
