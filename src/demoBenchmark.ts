import "dotenv/config";
import { runBenchmark } from "./benchmarkRunner";

function parseTrialsArg(): string | undefined {
  const raw = process.argv.slice(2);
  const namedArg = raw.find((entry) => entry.startsWith("--trials="));
  if (namedArg) {
    return namedArg.split("=")[1];
  }
  return raw[0];
}

async function main(): Promise<void> {
  const result = await runBenchmark({ trialsArg: parseTrialsArg(), mode: "simulated" });

  const preflightMode = result.summary.comparisonValidity === "live_preflight_only" ? "live" : "mock-or-fallback";

  console.log("\n=== Naive vs Radar Benchmark ===");
  console.log(`Trials: ${result.summary.totalTrials}`);
  console.log(`Preflight mode: ${preflightMode}`);
  console.log(`Execution mode: ${result.summary.executionMode ?? "simulated"}`);
  console.log(`Live execution configured: ${result.summary.liveExecutionConfigured}`);
  console.log(`Pay.sh execution skipped count: ${result.summary.liveExecutionSkippedCount}`);
  console.log(`Naive success rate: ${(result.summary.naiveSuccessRate * 100).toFixed(2)}%`);
  console.log(`Radar success rate: ${(result.summary.radarSuccessRate * 100).toFixed(2)}%`);
  console.log(
    `Average latency (ms): naive=${result.summary.naiveAvgLatencyMs}, radar=${result.summary.radarAvgLatencyMs}`,
  );
  console.log(`Average cost (USD): naive=${result.summary.naiveAvgCostUsd}, radar=${result.summary.radarAvgCostUsd}`);
  console.log(
    `Average quality: naive=${result.summary.naiveAvgQualityScore}, radar=${result.summary.radarAvgQualityScore}`,
  );
  console.log(`Comparison validity: ${result.summary.comparisonValidity ?? "valid_simulated_same_catalog"}`);
  if (result.summary.comparisonValidity === "live_preflight_only") {
    console.log("Live preflight verified. Outcome benchmark requires live Pay.sh catalog/execution.");
  } else {
    console.log(
      `Radar wins / naive wins / ties: ${result.summary.radarWinCount} / ${result.summary.naiveWinCount} / ${result.summary.tieCount}`,
    );
    console.log(`Radar avoided failure count: ${result.summary.radarAvoidedFailureCount}`);
  }
  console.log(`Report JSON: ${result.reportPaths.jsonPath}`);
  console.log(`Report CSV: ${result.reportPaths.csvPath}`);
  console.log(`Report Summary: ${result.reportPaths.summaryPath}\n`);
}

main().catch((error) => {
  console.error("benchmark failed", error);
  process.exitCode = 1;
});
