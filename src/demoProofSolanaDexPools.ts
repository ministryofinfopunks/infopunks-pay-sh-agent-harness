import "dotenv/config";
import { runLiveHeadToHeadBenchmark } from "./demoLiveHeadToHeadBenchmark";

const DEFAULT_TRIALS = 3;

function getTrialsFromArgs(): number {
  const arg = process.argv.find((entry) => entry.startsWith("--trials="));
  const parsed = arg ? Number(arg.slice("--trials=".length)) : DEFAULT_TRIALS;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TRIALS;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

async function main(): Promise<void> {
  const result = await runLiveHeadToHeadBenchmark({
    profileName: "solana_trending_pools",
    trials: getTrialsFromArgs(),
  });

  const radarBetterFitWins = result.summary.outputShapeFitWins.radar_better_fit ?? 0;

  console.log("\n=== Solana DEX Pools Routing-Fit Proof Summary ===");
  console.log(`naive provider: ${formatList(result.summary.uniqueNaiveProviders)}`);
  console.log(`Radar provider: ${formatList(result.summary.uniqueRadarProviders)}`);
  console.log(`radar wins: ${result.summary.radarWins}/${result.summary.totalTrials}`);
  console.log(`output-shape fit wins: ${radarBetterFitWins}/${result.summary.totalTrials}`);
  console.log("artifact paths:");
  console.log(`- ${result.reportPaths.jsonPath}`);
  console.log(`- ${result.reportPaths.csvPath}`);
  console.log(`- ${result.reportPaths.summaryPath}`);
}

main().catch((error) => {
  console.error("proof:solana-dex-pools failed", error);
  process.exitCode = 1;
});
