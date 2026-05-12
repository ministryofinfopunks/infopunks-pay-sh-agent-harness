import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { callRadarPreflight, RadarPreflightInput } from "./radarClient";

const DEFAULT_TRIALS = 30;
const DEFAULT_MARKET_DATA_MIN_TRUST_SCORE = 70;
const DEFAULT_MARKET_DATA_MAX_LATENCY_MS = 3000;
const DEFAULT_MARKET_DATA_MAX_COST_USD = 0.05;
const RESULTS_DIR = path.resolve(process.cwd(), "benchmark-results", "live-market-data");

interface LiveMarketDataBenchmarkTrial {
  trialId: number;
  timestamp: string;
  radarDecision: string;
  selectedProvider: string | null;
  selectedProviderDetails: Record<string, unknown> | null;
  executionMode: "live_pay_sh" | "live_pay_sh_cli" | "skipped";
  executionSuccess: boolean;
  exitCode: number | null;
  executionLatencyMs: number | null;
  cliTotalLatencyMs: number | null;
  parsedJsonAvailable: boolean;
  responsePreview: string;
  errorReason: string | null;
  settlementReference: string | null;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return defaultValue;
  }
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getTrialsFromArgsOrEnv(): number {
  const arg = process.argv.find((entry) => entry.startsWith("--trials="));
  const fromArg = arg ? Number(arg.slice("--trials=".length)) : undefined;
  const fromEnv = process.env.LIVE_MARKET_DATA_TRIALS ? Number(process.env.LIVE_MARKET_DATA_TRIALS) : undefined;
  const value = fromArg ?? fromEnv ?? DEFAULT_TRIALS;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_TRIALS;
}

function toCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  }
  return sorted[midpoint];
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function main(): Promise<void> {
  const trials = getTrialsFromArgsOrEnv();
  const intent = "get crypto market data";
  const category = "finance";
  const constraints = {
    minTrustScore: getEnvNumber("MARKET_DATA_MIN_TRUST_SCORE", DEFAULT_MARKET_DATA_MIN_TRUST_SCORE),
    maxLatencyMs: getEnvNumber("MARKET_DATA_MAX_LATENCY_MS", DEFAULT_MARKET_DATA_MAX_LATENCY_MS),
    maxCostUsd: getEnvNumber("MARKET_DATA_MAX_COST_USD", DEFAULT_MARKET_DATA_MAX_COST_USD),
  };

  console.log("\n=== Live Market-Data Benchmark ===");
  console.log(`Trials: ${trials}`);
  console.log(`Constraints: ${JSON.stringify(constraints)}`);

  const benchmarkTrials: LiveMarketDataBenchmarkTrial[] = [];

  for (let trialId = 1; trialId <= trials; trialId += 1) {
    const timestamp = new Date().toISOString();
    const preflightRequest: RadarPreflightInput = { intent, category, constraints };
    const preflight = await callRadarPreflight(preflightRequest);
    const radarDecision = preflight.decision?.decision ?? "route_blocked";
    const selectedProvider = preflight.decision?.selectedProvider ?? null;
    const selectedProviderDetails = preflight.decision?.selectedProviderDetails ?? null;

    if (radarDecision !== "route_approved" || !selectedProvider) {
      const blockedTrial: LiveMarketDataBenchmarkTrial = {
        trialId,
        timestamp,
        radarDecision,
        selectedProvider,
        selectedProviderDetails,
        executionMode: "skipped",
        executionSuccess: false,
        exitCode: null,
        executionLatencyMs: null,
        cliTotalLatencyMs: null,
        parsedJsonAvailable: false,
        responsePreview: "",
        errorReason: preflight.decision?.blockReason ?? preflight.fallbackReason ?? "route_blocked",
        settlementReference: null,
      };
      benchmarkTrials.push(blockedTrial);
      console.log(
        `[trial ${trialId}/${trials}] blocked: ${blockedTrial.errorReason ?? "route_blocked"}`,
      );
      continue;
    }

    const execution = await executeLivePayShCall({
      providerId: selectedProvider,
      intent,
      endpointUrl: process.env.PAYSH_EXECUTION_URL,
    });

    const executedTrial: LiveMarketDataBenchmarkTrial = {
      trialId,
      timestamp,
      radarDecision,
      selectedProvider,
      selectedProviderDetails,
      executionMode: execution.mode,
      executionSuccess: execution.success,
      exitCode: execution.exitCode ?? null,
      executionLatencyMs: execution.latencyMs,
      cliTotalLatencyMs: execution.mode === "live_pay_sh_cli" ? execution.latencyMs : null,
      parsedJsonAvailable: execution.parsedJsonAvailable,
      responsePreview: execution.responsePreview,
      errorReason: execution.errorReason ?? null,
      settlementReference: execution.settlementReference,
    };
    benchmarkTrials.push(executedTrial);
    console.log(
      `[trial ${trialId}/${trials}] approved: provider=${selectedProvider} mode=${execution.mode} success=${execution.success}`,
    );
  }

  const routeApprovedCount = benchmarkTrials.filter((trial) => trial.radarDecision === "route_approved").length;
  const routeBlockedCount = benchmarkTrials.length - routeApprovedCount;
  const executionAttemptedCount = routeApprovedCount;
  const executionSuccessCount = benchmarkTrials.filter((trial) => trial.executionSuccess).length;
  const executionFailureCount = executionAttemptedCount - executionSuccessCount;
  const parsedJsonSuccessCount = benchmarkTrials.filter((trial) => trial.parsedJsonAvailable).length;
  const latencies = benchmarkTrials
    .map((trial) => trial.executionLatencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const uniqueSelectedProviders = Array.from(
    new Set(benchmarkTrials.map((trial) => trial.selectedProvider).filter((value): value is string => Boolean(value))),
  );

  const summary = {
    totalTrials: benchmarkTrials.length,
    routeApprovedCount,
    routeBlockedCount,
    executionAttemptedCount,
    executionSuccessCount,
    executionFailureCount,
    parsedJsonSuccessCount,
    avgExecutionLatencyMs: round(average(latencies), 2),
    medianExecutionLatencyMs: round(median(latencies), 2),
    minExecutionLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
    maxExecutionLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
    uniqueSelectedProviders,
    caveat:
      "This benchmark demonstrates repeatability of one Radar-selected route, not naive-vs-Radar superiority.",
  };

  await mkdir(RESULTS_DIR, { recursive: true });

  const jsonPath = path.join(RESULTS_DIR, "latest.json");
  const csvPath = path.join(RESULTS_DIR, "latest.csv");
  const summaryPath = path.join(RESULTS_DIR, "summary.md");

  const csvHeader = [
    "trialId",
    "timestamp",
    "radarDecision",
    "selectedProvider",
    "selectedProviderDetails",
    "executionMode",
    "executionSuccess",
    "exitCode",
    "executionLatencyMs",
    "cliTotalLatencyMs",
    "parsedJsonAvailable",
    "responsePreview",
    "errorReason",
    "settlementReference",
  ].join(",");
  const csvRows = benchmarkTrials.map((trial) =>
    [
      trial.trialId,
      trial.timestamp,
      trial.radarDecision,
      trial.selectedProvider ?? "",
      JSON.stringify(trial.selectedProviderDetails ?? {}),
      trial.executionMode,
      trial.executionSuccess,
      trial.exitCode ?? "",
      trial.executionLatencyMs ?? "",
      trial.cliTotalLatencyMs ?? "",
      trial.parsedJsonAvailable,
      trial.responsePreview,
      trial.errorReason ?? "",
      trial.settlementReference ?? "",
    ]
      .map((cell) => toCsvCell(cell))
      .join(","),
  );

  const summaryMarkdown = [
    "# Live Market-Data Benchmark Summary",
    "",
    `- total trials: ${summary.totalTrials}`,
    `- route approved count: ${summary.routeApprovedCount}`,
    `- route blocked count: ${summary.routeBlockedCount}`,
    `- execution attempted count: ${summary.executionAttemptedCount}`,
    `- execution success count: ${summary.executionSuccessCount}`,
    `- execution failure count: ${summary.executionFailureCount}`,
    `- parsed JSON success count: ${summary.parsedJsonSuccessCount}`,
    `- avg execution latency: ${summary.avgExecutionLatencyMs}ms`,
    `- median execution latency: ${summary.medianExecutionLatencyMs}ms`,
    `- min execution latency: ${summary.minExecutionLatencyMs}ms`,
    `- max execution latency: ${summary.maxExecutionLatencyMs}ms`,
    `- unique selected providers: ${summary.uniqueSelectedProviders.join(", ") || "none"}`,
    `- caveat: ${summary.caveat}`,
    "",
  ].join("\n");

  await writeFile(jsonPath, `${JSON.stringify({ summary, trials: benchmarkTrials }, null, 2)}\n`, "utf8");
  await writeFile(csvPath, `${csvHeader}\n${csvRows.join("\n")}\n`, "utf8");
  await writeFile(summaryPath, summaryMarkdown, "utf8");

  console.log("\nResults written:");
  console.log(`- ${jsonPath}`);
  console.log(`- ${csvPath}`);
  console.log(`- ${summaryPath}`);
}

main().catch((error) => {
  console.error("benchmark:live-market-data failed", error);
  process.exitCode = 1;
});
