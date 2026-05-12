import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { callRadarPreflight, RadarPreflightInput } from "./radarClient";

const DEFAULT_TRIALS = 30;
const DEFAULT_MARKET_DATA_MIN_TRUST_SCORE = 70;
const DEFAULT_MARKET_DATA_MAX_LATENCY_MS = 3000;
const DEFAULT_MARKET_DATA_MAX_COST_USD = 0.05;
const DEFAULT_INTENT = "get crypto market data";
const DEFAULT_CATEGORY = "finance";
const RESULTS_DIR = path.resolve(process.cwd(), "benchmark-results", "live-head-to-head");

type ComparisonOutcome =
  | "radar_win"
  | "naive_win"
  | "tie"
  | "repeatability_same_provider"
  | "radar_route_blocked"
  | "invalid_missing_endpoint"
  | "invalid_execution_skipped";

interface EndpointMapping {
  providerId: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  category: string;
  capabilities: string[];
}

const endpointMap: EndpointMapping[] = [
  {
    providerId: "merit-systems-stablecrypto-market-data",
    url: "https://stablecrypto.dev/api/coingecko/price",
    method: "POST",
    body: { ids: ["solana"], vs_currencies: ["usd"] },
    category: "finance",
    capabilities: ["market_data", "pricing"],
  },
];

interface HeadToHeadTrial {
  trialId: number;
  timestamp: string;
  intent: string;
  category: string;
  constraints: {
    minTrustScore: number;
    maxLatencyMs: number;
    maxCostUsd: number;
  };
  naiveProvider: string | null;
  radarProvider: string | null;
  providersSame: boolean;
  naiveSelectionSource: "endpoint_map_order";
  naiveExecutionMode: string;
  radarExecutionMode: string;
  naiveSuccess: boolean;
  radarSuccess: boolean;
  naiveExitCode: number | null;
  radarExitCode: number | null;
  naiveParsedJsonAvailable: boolean;
  radarParsedJsonAvailable: boolean;
  naiveExecutionLatencyMs: number | null;
  radarExecutionLatencyMs: number | null;
  naiveResponsePreview: string;
  radarResponsePreview: string;
  naiveErrorReason: string | null;
  radarErrorReason: string | null;
  radarDecision: string;
  radarSelectedProviderDetails: Record<string, unknown> | null;
  radarBlockReason: string | null;
  radarCategoryMatch: boolean | null;
  radarCapabilityMatch: boolean | null;
  radarRequiredCapabilities: string[];
  radarRejectionSummary: string | null;
  radarConsideredProvidersRejected: string[];
  comparisonOutcome: ComparisonOutcome;
  naiveEndpointMapped: boolean;
  radarEndpointMapped: boolean;
  naiveExecutionAttempted: boolean;
  radarExecutionAttempted: boolean;
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
  const value = fromArg ?? DEFAULT_TRIALS;
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

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function findNaiveProvider(intent: string, category: string): EndpointMapping | null {
  const loweredIntent = intent.toLowerCase();
  const intentLooksLikeMarketData =
    loweredIntent.includes("market") || loweredIntent.includes("price") || loweredIntent.includes("crypto");
  return (
    endpointMap.find(
      (provider) =>
        provider.category.toLowerCase() === category.toLowerCase() &&
        provider.capabilities.some((capability) => capability === "market_data" || capability === "pricing") &&
        intentLooksLikeMarketData,
    ) ?? null
  );
}

async function executeProvider(provider: EndpointMapping | null, intent: string) {
  if (!provider) {
    return {
      success: false,
      mode: "skipped",
      exitCode: null,
      parsedJsonAvailable: false,
      latencyMs: null,
      responsePreview: "",
      errorReason: "missing_endpoint_mapping",
    };
  }

  const result = await executeLivePayShCall({
    providerId: provider.providerId,
    intent,
    endpointUrl: provider.url,
    method: provider.method,
    body: provider.body,
  });

  return {
    success: result.success,
    mode: result.mode,
    exitCode: result.exitCode ?? null,
    parsedJsonAvailable: result.parsedJsonAvailable,
    latencyMs: result.latencyMs,
    responsePreview: result.responsePreview,
    errorReason: result.errorReason ?? null,
  };
}

function normalizeErrorReason(value: string | null): string | null {
  if (!value) {
    return null;
  }
  if (value === "live_pay_sh_execution_disabled" || value === "missing_live_pay_sh_execution_config" || value === "pay_cli_missing") {
    return "invalid_execution_skipped";
  }
  return value;
}

function toRejectionSummary(details: Record<string, unknown> | null): string | null {
  if (!details) {
    return null;
  }
  const value = details.rejectionSummary;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toRejectedProviders(details: Record<string, unknown> | null, fallback: string[]): string[] {
  if (!details) {
    return fallback.slice(0, 5);
  }
  const raw = details.consideredProvidersRejected;
  if (!Array.isArray(raw)) {
    return fallback.slice(0, 5);
  }
  const rejected = raw
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (typeof entry === "object" && entry !== null) {
        const record = entry as Record<string, unknown>;
        if (typeof record.providerId === "string") {
          return record.providerId;
        }
        if (typeof record.id === "string") {
          return record.id;
        }
      }
      return null;
    })
    .filter((entry): entry is string => Boolean(entry));
  return rejected.slice(0, 5);
}

async function main(): Promise<void> {
  const trials = getTrialsFromArgsOrEnv();
  const intent = DEFAULT_INTENT;
  const category = DEFAULT_CATEGORY;
  const constraints = {
    minTrustScore: getEnvNumber("MARKET_DATA_MIN_TRUST_SCORE", DEFAULT_MARKET_DATA_MIN_TRUST_SCORE),
    maxLatencyMs: getEnvNumber("MARKET_DATA_MAX_LATENCY_MS", DEFAULT_MARKET_DATA_MAX_LATENCY_MS),
    maxCostUsd: getEnvNumber("MARKET_DATA_MAX_COST_USD", DEFAULT_MARKET_DATA_MAX_COST_USD),
  };

  const liveEnabled = process.env.LIVE_PAYSH_EXECUTION === "true";
  const payMode = process.env.PAYSH_EXECUTION_MODE?.trim().toLowerCase() ?? "http";
  const canExecute = liveEnabled && payMode === "pay_cli";

  console.log("\n=== Live Naive-vs-Radar Head-to-Head Benchmark ===");
  console.log(`Trials: ${trials}`);
  console.log(`Intent: ${intent}`);
  console.log(`Category: ${category}`);
  console.log(`Constraints: ${JSON.stringify(constraints)}`);

  if (!canExecute) {
    console.log(
      "Execution guard: LIVE_PAYSH_EXECUTION=true and PAYSH_EXECUTION_MODE=pay_cli are both required for valid runs.",
    );
  }

  const benchmarkTrials: HeadToHeadTrial[] = [];

  for (let trialId = 1; trialId <= trials; trialId += 1) {
    const timestamp = new Date().toISOString();
    const preflightRequest: RadarPreflightInput = { intent, category, constraints };
    const preflight = await callRadarPreflight(preflightRequest);
    const radarDecision = preflight.decision?.decision ?? "route_blocked";
    const radarProvider = preflight.decision?.selectedProvider ?? null;
    const radarSelectedProviderDetails = preflight.decision?.selectedProviderDetails ?? null;
    const radarBlockReason = preflight.decision?.blockReason ?? preflight.fallbackReason ?? null;
    const radarCategoryMatch = preflight.decision?.categoryMatch ?? null;
    const radarCapabilityMatch = preflight.decision?.capabilityMatch ?? null;
    const radarRequiredCapabilities = preflight.decision?.requiredCapabilities ?? [];
    const radarRejectionSummary = toRejectionSummary(radarSelectedProviderDetails);
    const radarConsideredProvidersRejected = toRejectedProviders(
      radarSelectedProviderDetails,
      preflight.decision?.rejectedProviders ?? [],
    );

    const naiveProviderMapping = findNaiveProvider(intent, category);
    const naiveProvider = naiveProviderMapping?.providerId ?? null;
    const radarProviderMapping = endpointMap.find((mapping) => mapping.providerId === radarProvider) ?? null;

    const providersSame = Boolean(naiveProvider && radarProvider && naiveProvider === radarProvider);
    const naiveEndpointMapped = Boolean(naiveProviderMapping);
    const radarEndpointMapped = Boolean(radarProviderMapping);

    let naiveExecutionMode = "skipped";
    let radarExecutionMode = "skipped";
    let naiveSuccess = false;
    let radarSuccess = false;
    let naiveExitCode: number | null = null;
    let radarExitCode: number | null = null;
    let naiveParsedJsonAvailable = false;
    let radarParsedJsonAvailable = false;
    let naiveExecutionLatencyMs: number | null = null;
    let radarExecutionLatencyMs: number | null = null;
    let naiveResponsePreview = "";
    let radarResponsePreview = "";
    let naiveErrorReason: string | null = null;
    let radarErrorReason: string | null = null;
    let comparisonOutcome: ComparisonOutcome = "tie";
    let naiveExecutionAttempted = false;
    let radarExecutionAttempted = false;

    if (!canExecute) {
      naiveErrorReason = "invalid_execution_skipped";
      radarErrorReason = "invalid_execution_skipped";
      comparisonOutcome = "invalid_execution_skipped";
    } else if (radarDecision === "route_blocked") {
      const naiveRun = await executeProvider(naiveProviderMapping, intent);
      naiveExecutionAttempted = Boolean(naiveProviderMapping);
      naiveExecutionMode = naiveRun.mode;
      naiveSuccess = naiveRun.success;
      naiveExitCode = naiveRun.exitCode;
      naiveParsedJsonAvailable = naiveRun.parsedJsonAvailable;
      naiveExecutionLatencyMs = naiveRun.latencyMs;
      naiveResponsePreview = naiveRun.responsePreview;
      naiveErrorReason = normalizeErrorReason(naiveRun.errorReason);

      radarErrorReason = radarBlockReason || "radar_route_blocked";
      comparisonOutcome = "radar_route_blocked";
      radarExecutionMode = "skipped";
      radarExecutionAttempted = false;
    } else if (radarDecision === "route_approved" && radarProvider && !radarProviderMapping) {
      const naiveRun = await executeProvider(naiveProviderMapping, intent);
      naiveExecutionAttempted = Boolean(naiveProviderMapping);
      naiveExecutionMode = naiveRun.mode;
      naiveSuccess = naiveRun.success;
      naiveExitCode = naiveRun.exitCode;
      naiveParsedJsonAvailable = naiveRun.parsedJsonAvailable;
      naiveExecutionLatencyMs = naiveRun.latencyMs;
      naiveResponsePreview = naiveRun.responsePreview;
      naiveErrorReason = normalizeErrorReason(naiveRun.errorReason);

      radarErrorReason = "missing_endpoint_mapping";
      comparisonOutcome = "invalid_missing_endpoint";
    } else if (!radarProvider || !radarProviderMapping) {
      const naiveRun = await executeProvider(naiveProviderMapping, intent);
      naiveExecutionAttempted = Boolean(naiveProviderMapping);
      naiveExecutionMode = naiveRun.mode;
      naiveSuccess = naiveRun.success;
      naiveExitCode = naiveRun.exitCode;
      naiveParsedJsonAvailable = naiveRun.parsedJsonAvailable;
      naiveExecutionLatencyMs = naiveRun.latencyMs;
      naiveResponsePreview = naiveRun.responsePreview;
      naiveErrorReason = normalizeErrorReason(naiveRun.errorReason);

      radarErrorReason = radarBlockReason || "radar_route_blocked";
      comparisonOutcome = "radar_route_blocked";
      radarExecutionMode = "skipped";
      radarExecutionAttempted = false;
    } else {
      const naiveRun = await executeProvider(naiveProviderMapping, intent);
      const radarRun = await executeProvider(radarProviderMapping, intent);
      naiveExecutionAttempted = Boolean(naiveProviderMapping);
      radarExecutionAttempted = Boolean(radarProviderMapping);

      naiveExecutionMode = naiveRun.mode;
      radarExecutionMode = radarRun.mode;
      naiveSuccess = naiveRun.success;
      radarSuccess = radarRun.success;
      naiveExitCode = naiveRun.exitCode;
      radarExitCode = radarRun.exitCode;
      naiveParsedJsonAvailable = naiveRun.parsedJsonAvailable;
      radarParsedJsonAvailable = radarRun.parsedJsonAvailable;
      naiveExecutionLatencyMs = naiveRun.latencyMs;
      radarExecutionLatencyMs = radarRun.latencyMs;
      naiveResponsePreview = naiveRun.responsePreview;
      radarResponsePreview = radarRun.responsePreview;
      naiveErrorReason = normalizeErrorReason(naiveRun.errorReason);
      radarErrorReason = normalizeErrorReason(radarRun.errorReason);

      if (
        naiveErrorReason === "invalid_execution_skipped" ||
        radarErrorReason === "invalid_execution_skipped" ||
        naiveExecutionMode === "skipped" ||
        radarExecutionMode === "skipped"
      ) {
        comparisonOutcome = "invalid_execution_skipped";
      } else if (providersSame) {
        comparisonOutcome = "repeatability_same_provider";
      } else if (naiveSuccess && !radarSuccess) {
        comparisonOutcome = "naive_win";
      } else if (!naiveSuccess && radarSuccess) {
        comparisonOutcome = "radar_win";
      } else if ((naiveExecutionLatencyMs ?? Number.POSITIVE_INFINITY) < (radarExecutionLatencyMs ?? Number.POSITIVE_INFINITY)) {
        comparisonOutcome = "naive_win";
      } else if ((radarExecutionLatencyMs ?? Number.POSITIVE_INFINITY) < (naiveExecutionLatencyMs ?? Number.POSITIVE_INFINITY)) {
        comparisonOutcome = "radar_win";
      } else {
        comparisonOutcome = "tie";
      }
    }

    const trial: HeadToHeadTrial = {
      trialId,
      timestamp,
      intent,
      category,
      constraints,
      naiveProvider,
      radarProvider,
      providersSame,
      naiveSelectionSource: "endpoint_map_order",
      naiveExecutionMode,
      radarExecutionMode,
      naiveSuccess,
      radarSuccess,
      naiveExitCode,
      radarExitCode,
      naiveParsedJsonAvailable,
      radarParsedJsonAvailable,
      naiveExecutionLatencyMs,
      radarExecutionLatencyMs,
      naiveResponsePreview,
      radarResponsePreview,
      naiveErrorReason,
      radarErrorReason,
      radarDecision,
      radarSelectedProviderDetails,
      radarBlockReason,
      radarCategoryMatch,
      radarCapabilityMatch,
      radarRequiredCapabilities,
      radarRejectionSummary,
      radarConsideredProvidersRejected,
      comparisonOutcome,
      naiveEndpointMapped,
      radarEndpointMapped,
      naiveExecutionAttempted,
      radarExecutionAttempted,
    };

    benchmarkTrials.push(trial);
    console.log(
      `[trial ${trialId}/${trials}] naive=${naiveProvider ?? "none"} radar=${radarProvider ?? "none"} outcome=${comparisonOutcome}`,
    );
  }

  const validComparisons = benchmarkTrials.filter(
    (trial) =>
      !trial.providersSame &&
      trial.naiveEndpointMapped &&
      trial.radarEndpointMapped &&
      trial.naiveExecutionAttempted &&
      trial.radarExecutionAttempted &&
      trial.comparisonOutcome !== "radar_route_blocked" &&
      trial.comparisonOutcome !== "invalid_missing_endpoint" &&
      trial.comparisonOutcome !== "invalid_execution_skipped",
  );
  const invalidComparisons = benchmarkTrials.filter(
    (trial) =>
      trial.comparisonOutcome === "invalid_missing_endpoint" ||
      trial.comparisonOutcome === "radar_route_blocked" ||
      trial.comparisonOutcome === "invalid_execution_skipped",
  ).length;
  const repeatabilityCount = benchmarkTrials.filter(
    (trial) => trial.comparisonOutcome === "repeatability_same_provider",
  ).length;
  const radarWins = benchmarkTrials.filter((trial) => trial.comparisonOutcome === "radar_win").length;
  const naiveWins = benchmarkTrials.filter((trial) => trial.comparisonOutcome === "naive_win").length;
  const ties = benchmarkTrials.filter((trial) => trial.comparisonOutcome === "tie").length;

  const naiveLatencyValues = benchmarkTrials
    .map((trial) => trial.naiveExecutionLatencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const radarLatencyValues = benchmarkTrials
    .map((trial) => trial.radarExecutionLatencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const naiveSuccessRate = benchmarkTrials.length === 0 ? 0 : benchmarkTrials.filter((trial) => trial.naiveSuccess).length / benchmarkTrials.length;
  const radarSuccessRate = benchmarkTrials.length === 0 ? 0 : benchmarkTrials.filter((trial) => trial.radarSuccess).length / benchmarkTrials.length;
  const naiveParsedJsonRate =
    benchmarkTrials.length === 0 ? 0 : benchmarkTrials.filter((trial) => trial.naiveParsedJsonAvailable).length / benchmarkTrials.length;
  const radarParsedJsonRate =
    benchmarkTrials.length === 0 ? 0 : benchmarkTrials.filter((trial) => trial.radarParsedJsonAvailable).length / benchmarkTrials.length;
  const radarRouteBlockedCount = benchmarkTrials.filter((trial) => trial.radarDecision === "route_blocked").length;
  const radarRouteApprovedCount = benchmarkTrials.filter((trial) => trial.radarDecision === "route_approved").length;
  const radarMissingEndpointMappingCount = benchmarkTrials.filter(
    (trial) => trial.comparisonOutcome === "invalid_missing_endpoint",
  ).length;
  const radarExecutionAttemptedCount = benchmarkTrials.filter((trial) => trial.radarExecutionAttempted).length;
  const naiveExecutionAttemptedCount = benchmarkTrials.filter((trial) => trial.naiveExecutionAttempted).length;
  const radarExecutionSuccessRateAmongAttempted =
    radarExecutionAttemptedCount === 0
      ? 0
      : benchmarkTrials.filter((trial) => trial.radarExecutionAttempted && trial.radarSuccess).length / radarExecutionAttemptedCount;
  const naiveExecutionSuccessRateAmongAttempted =
    naiveExecutionAttemptedCount === 0
      ? 0
      : benchmarkTrials.filter((trial) => trial.naiveExecutionAttempted && trial.naiveSuccess).length / naiveExecutionAttemptedCount;

  const invalidReasons = benchmarkTrials.reduce<Record<string, number>>((acc, trial) => {
    if (trial.comparisonOutcome === "radar_route_blocked") {
      acc.radar_route_blocked = (acc.radar_route_blocked ?? 0) + 1;
    }
    if (trial.comparisonOutcome === "invalid_missing_endpoint") {
      acc.invalid_missing_endpoint = (acc.invalid_missing_endpoint ?? 0) + 1;
    }
    if (trial.comparisonOutcome === "invalid_execution_skipped") {
      acc.invalid_execution_skipped = (acc.invalid_execution_skipped ?? 0) + 1;
    }
    return acc;
  }, {});

  const summary = {
    totalTrials: benchmarkTrials.length,
    validHeadToHeadComparisonCount: validComparisons.length,
    superiorityEvidenceAvailable: validComparisons.length > 0,
    repeatabilitySameProviderCount: repeatabilityCount,
    invalidComparisonCount: invalidComparisons,
    radarRouteBlockedCount,
    radarRouteApprovedCount,
    radarMissingEndpointMappingCount,
    radarExecutionAttemptedCount,
    radarExecutionSuccessRateAmongAttempted: round(radarExecutionSuccessRateAmongAttempted * 100, 2),
    naiveExecutionAttemptedCount,
    naiveExecutionSuccessRateAmongAttempted: round(naiveExecutionSuccessRateAmongAttempted * 100, 2),
    naiveSuccessRate: round(naiveSuccessRate * 100, 2),
    radarSuccessRate: round(radarSuccessRate * 100, 2),
    naiveAvgLatencyMs: round(average(naiveLatencyValues), 2),
    radarAvgLatencyMs: round(average(radarLatencyValues), 2),
    naiveParsedJsonSuccessRate: round(naiveParsedJsonRate * 100, 2),
    radarParsedJsonSuccessRate: round(radarParsedJsonRate * 100, 2),
    radarWins,
    naiveWins,
    ties,
    repeatabilitySameProviderOutcomes: repeatabilityCount,
    invalidReasons,
    uniqueNaiveProviders: Array.from(new Set(benchmarkTrials.map((trial) => trial.naiveProvider).filter((value): value is string => Boolean(value)))),
    uniqueRadarProviders: Array.from(new Set(benchmarkTrials.map((trial) => trial.radarProvider).filter((value): value is string => Boolean(value)))),
    caveat:
      "Same-provider outcomes prove repeatability of an executable route, not Radar superiority. Radar superiority requires multiple executable providers with different reliability/cost/latency profiles.",
    latencyCaveat:
      "Latency differences in same-provider trials may reflect CLI/payment/session effects, not routing quality.",
  };

  await mkdir(RESULTS_DIR, { recursive: true });

  const jsonPath = path.join(RESULTS_DIR, "latest.json");
  const csvPath = path.join(RESULTS_DIR, "latest.csv");
  const summaryPath = path.join(RESULTS_DIR, "summary.md");

  const csvHeader = [
    "trialId",
    "timestamp",
    "intent",
    "category",
    "constraints",
    "naiveProvider",
    "radarProvider",
    "providersSame",
    "naiveSelectionSource",
    "naiveExecutionMode",
    "radarExecutionMode",
    "naiveSuccess",
    "radarSuccess",
    "naiveExitCode",
    "radarExitCode",
    "naiveParsedJsonAvailable",
    "radarParsedJsonAvailable",
    "naiveExecutionLatencyMs",
    "radarExecutionLatencyMs",
    "naiveResponsePreview",
    "radarResponsePreview",
    "naiveErrorReason",
    "radarErrorReason",
    "radarDecision",
    "radarSelectedProviderDetails",
    "radarBlockReason",
    "radarCategoryMatch",
    "radarCapabilityMatch",
    "radarRequiredCapabilities",
    "radarRejectionSummary",
    "radarConsideredProvidersRejected",
    "comparisonOutcome",
  ].join(",");

  const csvRows = benchmarkTrials.map((trial) =>
    [
      trial.trialId,
      trial.timestamp,
      trial.intent,
      trial.category,
      JSON.stringify(trial.constraints),
      trial.naiveProvider ?? "",
      trial.radarProvider ?? "",
      trial.providersSame,
      trial.naiveSelectionSource,
      trial.naiveExecutionMode,
      trial.radarExecutionMode,
      trial.naiveSuccess,
      trial.radarSuccess,
      trial.naiveExitCode ?? "",
      trial.radarExitCode ?? "",
      trial.naiveParsedJsonAvailable,
      trial.radarParsedJsonAvailable,
      trial.naiveExecutionLatencyMs ?? "",
      trial.radarExecutionLatencyMs ?? "",
      trial.naiveResponsePreview,
      trial.radarResponsePreview,
      trial.naiveErrorReason ?? "",
      trial.radarErrorReason ?? "",
      trial.radarDecision,
      JSON.stringify(trial.radarSelectedProviderDetails ?? {}),
      trial.radarBlockReason ?? "",
      trial.radarCategoryMatch ?? "",
      trial.radarCapabilityMatch ?? "",
      JSON.stringify(trial.radarRequiredCapabilities),
      trial.radarRejectionSummary ?? "",
      JSON.stringify(trial.radarConsideredProvidersRejected),
      trial.comparisonOutcome,
    ]
      .map((cell) => toCsvCell(cell))
      .join(","),
  );

  const summaryMarkdown = [
    "# Live Naive-vs-Radar Benchmark Summary",
    "",
    `- total trials: ${summary.totalTrials}`,
    `- valid head-to-head comparison count (different-provider superiority comparisons only): ${summary.validHeadToHeadComparisonCount}`,
    `- superiority evidence available: ${summary.superiorityEvidenceAvailable}`,
    `- repeatability same-provider count (both strategies selected the same executable provider): ${summary.repeatabilitySameProviderCount}`,
    `- invalid comparison count: ${summary.invalidComparisonCount}`,
    `- Radar route blocked count: ${summary.radarRouteBlockedCount}`,
    `- Radar route approved count: ${summary.radarRouteApprovedCount}`,
    `- Radar missing endpoint mapping count: ${summary.radarMissingEndpointMappingCount}`,
    `- Radar execution attempted count: ${summary.radarExecutionAttemptedCount}`,
    `- Radar execution success rate among attempted: ${summary.radarExecutionSuccessRateAmongAttempted}%`,
    `- naive execution attempted count: ${summary.naiveExecutionAttemptedCount}`,
    `- naive execution success rate among attempted: ${summary.naiveExecutionSuccessRateAmongAttempted}%`,
    `- naive success rate: ${summary.naiveSuccessRate}%`,
    `- radar success rate: ${summary.radarSuccessRate}%`,
    `- naive avg latency: ${summary.naiveAvgLatencyMs}ms`,
    `- radar avg latency: ${summary.radarAvgLatencyMs}ms`,
    `- parsed JSON success rates: naive=${summary.naiveParsedJsonSuccessRate}% radar=${summary.radarParsedJsonSuccessRate}%`,
    `- radar wins: ${summary.radarWins}`,
    `- naive wins: ${summary.naiveWins}`,
    `- ties: ${summary.ties}`,
    `- repeatability same-provider outcomes: ${summary.repeatabilitySameProviderOutcomes}`,
    `- invalid reasons: ${JSON.stringify(summary.invalidReasons)}`,
    "- `radar_route_blocked` means Radar intentionally refused execution under current policy constraints (not a missing endpoint mapping).",
    `- unique naive providers: ${summary.uniqueNaiveProviders.join(", ") || "none"}`,
    `- unique Radar providers: ${summary.uniqueRadarProviders.join(", ") || "none"}`,
    `- caveat: ${summary.caveat}`,
    `- caveat: ${summary.latencyCaveat}`,
    ...(!summary.superiorityEvidenceAvailable
      ? [
          "- warning: No superiority evidence available: naive and Radar selected the same executable provider in all comparable trials.",
        ]
      : []),
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
  console.error("benchmark:live-head-to-head failed", error);
  process.exitCode = 1;
});
