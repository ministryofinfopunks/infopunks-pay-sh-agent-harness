import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BenchmarkSummary, BenchmarkTrial } from "./types";

const BENCHMARK_RESULTS_DIR = path.resolve(process.cwd(), "benchmark-results");

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildBenchmarkSummary(trials: BenchmarkTrial[]): BenchmarkSummary {
  const totalTrials = trials.length;
  const naiveSuccesses = trials.filter((trial) => trial.naive.success).length;
  const radarSuccesses = trials.filter((trial) => trial.radar.success).length;
  const hasMixedSources = trials.some(
    (trial) => trial.comparisonValidity && trial.comparisonValidity !== "valid_simulated_same_catalog",
  );
  const radarAvoidedFailureCount = hasMixedSources
    ? 0
    : trials.filter((trial) => trial.radarAvoidedFailure).length;
  const radarWinCount = hasMixedSources ? 0 : trials.filter((trial) => trial.winner === "radar").length;
  const naiveWinCount = hasMixedSources ? 0 : trials.filter((trial) => trial.winner === "naive").length;
  const tieCount = hasMixedSources ? 0 : trials.filter((trial) => trial.winner === "tie").length;

  return {
    totalTrials,
    naiveSuccessRate: round(totalTrials === 0 ? 0 : naiveSuccesses / totalTrials, 4),
    radarSuccessRate: round(totalTrials === 0 ? 0 : radarSuccesses / totalTrials, 4),
    naiveAvgLatencyMs: round(avg(trials.map((trial) => trial.naive.latencyMs)), 2),
    radarAvgLatencyMs: round(avg(trials.map((trial) => trial.radar.latencyMs)), 2),
    naiveAvgCostUsd: round(avg(trials.map((trial) => trial.naive.costUsd)), 6),
    radarAvgCostUsd: round(avg(trials.map((trial) => trial.radar.costUsd)), 6),
    naiveAvgQualityScore: round(avg(trials.map((trial) => trial.naive.qualityScore)), 2),
    radarAvgQualityScore: round(avg(trials.map((trial) => trial.radar.qualityScore)), 2),
    radarAvoidedFailureCount,
    radarWinCount,
    naiveWinCount,
    tieCount,
    comparisonValidity: hasMixedSources ? "live_preflight_only" : "valid_simulated_same_catalog",
  };
}

function trialsToCsv(trials: BenchmarkTrial[]): string {
  const header = [
    "trialNumber",
    "intent",
    "naiveProviderId",
    "radarProviderId",
    "naiveSuccess",
    "radarSuccess",
    "naiveLatencyMs",
    "radarLatencyMs",
    "naiveCostUsd",
    "radarCostUsd",
    "naiveQualityScore",
    "radarQualityScore",
    "radarAvoidedFailure",
    "winner",
    "comparisonValidity",
    "catalogMode",
    "radarMode",
    "candidateProviderSource",
  ];

  const rows = trials.map((trial) =>
    [
      trial.trialNumber,
      JSON.stringify(trial.intent),
      trial.naiveProviderId ?? "",
      trial.radarProviderId ?? "",
      trial.naive.success,
      trial.radar.success,
      trial.naive.latencyMs,
      trial.radar.latencyMs,
      trial.naive.costUsd,
      trial.radar.costUsd,
      trial.naive.qualityScore,
      trial.radar.qualityScore,
      trial.radarAvoidedFailure,
      trial.winner,
      trial.comparisonValidity ?? "",
      trial.catalogMode ?? "",
      trial.radarMode ?? "",
      trial.candidateProviderSource ?? "",
    ].join(","),
  );

  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

function summaryToMarkdown(summary: BenchmarkSummary): string {
  return [
    "# Benchmark Summary",
    "",
    "Simulated benchmark shows the measurement framework and expected policy behavior.",
    "",
    `- total trials: ${summary.totalTrials}`,
    `- naive success rate: ${summary.naiveSuccessRate}`,
    `- radar success rate: ${summary.radarSuccessRate}`,
    `- naive avg latency: ${summary.naiveAvgLatencyMs}ms`,
    `- radar avg latency: ${summary.radarAvgLatencyMs}ms`,
    `- naive avg cost: $${summary.naiveAvgCostUsd}`,
    `- radar avg cost: $${summary.radarAvgCostUsd}`,
    `- naive avg quality: ${summary.naiveAvgQualityScore}`,
    `- radar avg quality: ${summary.radarAvgQualityScore}`,
    `- comparison validity: ${summary.comparisonValidity ?? "valid_simulated_same_catalog"}`,
    hasLivePreflightOnly(summary)
      ? "- Live preflight verified. Outcome benchmark requires live Pay.sh catalog/execution."
      : `- radar avoided failure count: ${summary.radarAvoidedFailureCount}`,
    hasLivePreflightOnly(summary) ? "- radar wins / naive wins / ties: n/a" : `- radar win count: ${summary.radarWinCount}`,
    hasLivePreflightOnly(summary) ? "- benchmark outcome comparison: n/a" : `- naive win count: ${summary.naiveWinCount}`,
    hasLivePreflightOnly(summary) ? "- benchmark outcome comparison reason: mixed mock/live sources" : `- tie count: ${summary.tieCount}`,
    "",
  ].join("\n");
}

function hasLivePreflightOnly(summary: BenchmarkSummary): boolean {
  return summary.comparisonValidity === "live_preflight_only";
}

export interface BenchmarkReportPaths {
  jsonPath: string;
  csvPath: string;
  summaryPath: string;
}

export async function writeBenchmarkReport(
  trials: BenchmarkTrial[],
  summary: BenchmarkSummary,
): Promise<BenchmarkReportPaths> {
  await mkdir(BENCHMARK_RESULTS_DIR, { recursive: true });

  const jsonPath = path.join(BENCHMARK_RESULTS_DIR, "latest.json");
  const csvPath = path.join(BENCHMARK_RESULTS_DIR, "latest.csv");
  const summaryPath = path.join(BENCHMARK_RESULTS_DIR, "summary.md");

  await writeFile(jsonPath, `${JSON.stringify({ summary, trials }, null, 2)}\n`, "utf8");
  await writeFile(csvPath, trialsToCsv(trials), "utf8");
  await writeFile(summaryPath, summaryToMarkdown(summary), "utf8");

  return { jsonPath, csvPath, summaryPath };
}
