import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { callRadarPreflight, RadarPreflightInput } from "./radarClient";
import { providerEndpointMap, ProviderEndpointMapping } from "./providerEndpointMap";
import { validateJsonRpcResponse } from "./jsonRpcValidator";

const DEFAULT_TRIALS = 30;
const DEFAULT_MARKET_DATA_MIN_TRUST_SCORE = 70;
const DEFAULT_MARKET_DATA_MAX_LATENCY_MS = 3000;
const DEFAULT_MARKET_DATA_MAX_COST_USD = 0.05;
const DEFAULT_SOLANA_RPC_MIN_TRUST_SCORE = 70;
const DEFAULT_SOLANA_RPC_MAX_LATENCY_MS = 5000;
const DEFAULT_SOLANA_RPC_MAX_COST_USD = 0.05;
const RESULTS_DIR = path.resolve(process.cwd(), "benchmark-results", "live-head-to-head");

export type ProfileName = "simple_price" | "solana_trending_pools" | "solana_rpc_health";

type ComparisonOutcome =
  | "radar_win"
  | "naive_win"
  | "tie"
  | "repeatability_same_provider"
  | "radar_route_blocked"
  | "invalid_missing_endpoint"
  | "invalid_unverified_execution_mapping"
  | "invalid_execution_skipped";

type OutputShapeFitOutcome = "radar_better_fit" | "naive_better_fit" | "both_fit" | "neither_fit" | "same_provider";
type WinReason = "better_output_shape_fit" | "execution_success" | "latency" | "tie_or_not_applicable";

interface BenchmarkIntentProfile {
  name: ProfileName;
  intent: string;
  category: string;
  expectedOutputShape: string;
  preferredCapabilities: string[];
  defaultConstraints: {
    minTrustScore: number;
    maxLatencyMs: number;
    maxCostUsd: number;
  };
}

const BENCHMARK_PROFILES: Record<ProfileName, BenchmarkIntentProfile> = {
  simple_price: {
    name: "simple_price",
    intent: "get crypto market data",
    category: "finance",
    expectedOutputShape: "simple_price",
    preferredCapabilities: ["market_data", "pricing"],
    defaultConstraints: {
      minTrustScore: DEFAULT_MARKET_DATA_MIN_TRUST_SCORE,
      maxLatencyMs: DEFAULT_MARKET_DATA_MAX_LATENCY_MS,
      maxCostUsd: DEFAULT_MARKET_DATA_MAX_COST_USD,
    },
  },
  solana_trending_pools: {
    name: "solana_trending_pools",
    intent: "get trending Solana DEX pools",
    category: "finance",
    expectedOutputShape: "trending_pools",
    preferredCapabilities: ["market_data", "dex_pools", "trending"],
    defaultConstraints: {
      minTrustScore: DEFAULT_MARKET_DATA_MIN_TRUST_SCORE,
      maxLatencyMs: DEFAULT_MARKET_DATA_MAX_LATENCY_MS,
      maxCostUsd: DEFAULT_MARKET_DATA_MAX_COST_USD,
    },
  },
  solana_rpc_health: {
    name: "solana_rpc_health",
    intent: "check Solana mainnet RPC health",
    category: "compute",
    expectedOutputShape: "json_rpc_health",
    preferredCapabilities: ["rpc", "blockchain", "solana", "onchain", "compute"],
    defaultConstraints: {
      minTrustScore: DEFAULT_SOLANA_RPC_MIN_TRUST_SCORE,
      maxLatencyMs: DEFAULT_SOLANA_RPC_MAX_LATENCY_MS,
      maxCostUsd: DEFAULT_SOLANA_RPC_MAX_COST_USD,
    },
  },
};

interface HeadToHeadTrial {
  trialId: number;
  timestamp: string;
  profile: ProfileName;
  intent: string;
  category: string;
  expectedOutputShape: string;
  constraints: {
    minTrustScore: number;
    maxLatencyMs: number;
    maxCostUsd: number;
  };
  naiveProvider: string | null;
  radarProvider: string | null;
  naiveEndpointMappingId: string | null;
  radarEndpointMappingId: string | null;
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
  errorClassification: string | null;
  radarDecision: string;
  radarSelectedProviderDetails: Record<string, unknown> | null;
  radarBlockReason: string | null;
  radarCategoryMatch: boolean | null;
  radarCapabilityMatch: boolean | null;
  radarRequiredCapabilities: string[];
  radarRejectionSummary: string | null;
  radarConsideredProvidersRejected: string[];
  comparisonOutcome: ComparisonOutcome;
  winReason: WinReason;
  naiveEndpointMapped: boolean;
  radarEndpointMapped: boolean;
  naiveEndpointMappingStatus: string | null;
  radarEndpointMappingStatus: string | null;
  naiveOutputShape: string | null;
  radarOutputShape: string | null;
  outputShapesSame: boolean;
  naiveOutputShapeMatchesExpected: boolean;
  radarOutputShapeMatchesExpected: boolean;
  outputShapeFitOutcome: OutputShapeFitOutcome;
  outputShapeCaveat: string | null;
  qualityComparisonAvailable: boolean;
  naiveExecutionAttempted: boolean;
  radarExecutionAttempted: boolean;
  naiveJsonRpcValid: boolean | null;
  radarJsonRpcValid: boolean | null;
  naiveJsonRpcMethod: string | null;
  radarJsonRpcMethod: string | null;
  naiveJsonRpcResultShapeValid: boolean | null;
  radarJsonRpcResultShapeValid: boolean | null;
  naiveSlot: number | null;
  radarSlot: number | null;
  naiveApiVersion: string | null;
  radarApiVersion: string | null;
  naiveValidationError: string | null;
  radarValidationError: string | null;
}

export interface LiveHeadToHeadBenchmarkSummary {
  profile: ProfileName;
  expectedOutputShape: string;
  totalTrials: number;
  radarWins: number;
  naiveWins: number;
  ties: number;
  outputShapeFitWins: Record<string, number>;
  uniqueNaiveProviders: string[];
  uniqueRadarProviders: string[];
}

export interface LiveHeadToHeadBenchmarkRunResult {
  summary: LiveHeadToHeadBenchmarkSummary;
  trials: HeadToHeadTrial[];
  reportPaths: {
    jsonPath: string;
    csvPath: string;
    summaryPath: string;
  };
}

function getEnvNumber(name: string, defaultValue: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return defaultValue;
  }
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getTrialsFromArgsOrEnv(defaultTrials = DEFAULT_TRIALS): number {
  const arg = process.argv.find((entry) => entry.startsWith("--trials="));
  const fromArg = arg ? Number(arg.slice("--trials=".length)) : undefined;
  const value = fromArg ?? defaultTrials;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : defaultTrials;
}

function getProfileFromArgsOrEnv(defaultProfile: ProfileName = "simple_price"): BenchmarkIntentProfile {
  const arg = process.argv.find((entry) => entry.startsWith("--profile="));
  const raw = (arg ? arg.slice("--profile=".length) : process.env.LIVE_HEAD_TO_HEAD_PROFILE ?? defaultProfile).trim();
  const profile = (raw in BENCHMARK_PROFILES ? raw : defaultProfile) as ProfileName;
  return BENCHMARK_PROFILES[profile];
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

function findNaiveProvider(category: string): ProviderEndpointMapping | null {
  return (
    providerEndpointMap.find(
      (provider) =>
        provider.category.toLowerCase() === category.toLowerCase() &&
        provider.status === "verified_pay_cli_success" &&
        provider.capabilities.some((capability) =>
          category.toLowerCase() === "compute" ? capability === "rpc" : capability === "market_data",
        ),
    ) ?? null
  );
}

function parseJsonOrNull(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function getJsonRpcMethod(mapping: ProviderEndpointMapping | null): string | null {
  const body = mapping?.body;
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const method = (body as Record<string, unknown>).method;
  return typeof method === "string" ? method : null;
}

async function executeProvider(provider: ProviderEndpointMapping | null, intent: string) {
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
    body: provider.body ?? undefined,
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

function getOutputShapeFitOutcome(
  providersSame: boolean,
  naiveFits: boolean,
  radarFits: boolean,
): OutputShapeFitOutcome {
  if (providersSame) {
    return "same_provider";
  }
  if (radarFits && !naiveFits) {
    return "radar_better_fit";
  }
  if (!radarFits && naiveFits) {
    return "naive_better_fit";
  }
  if (radarFits && naiveFits) {
    return "both_fit";
  }
  return "neither_fit";
}

export async function runLiveHeadToHeadBenchmark(options?: {
  trials?: number;
  profileName?: ProfileName;
}): Promise<LiveHeadToHeadBenchmarkRunResult> {
  const trials = options?.trials ?? getTrialsFromArgsOrEnv();
  const profile = options?.profileName ? BENCHMARK_PROFILES[options.profileName] : getProfileFromArgsOrEnv();
  const intent = profile.intent;
  const category = profile.category;
  const expectedOutputShape = profile.expectedOutputShape;
  const constraints = {
    minTrustScore: getEnvNumber("MARKET_DATA_MIN_TRUST_SCORE", profile.defaultConstraints.minTrustScore),
    maxLatencyMs: getEnvNumber("MARKET_DATA_MAX_LATENCY_MS", profile.defaultConstraints.maxLatencyMs),
    maxCostUsd: getEnvNumber("MARKET_DATA_MAX_COST_USD", profile.defaultConstraints.maxCostUsd),
  };

  const liveEnabled = process.env.LIVE_PAYSH_EXECUTION === "true";
  const payMode = process.env.PAYSH_EXECUTION_MODE?.trim().toLowerCase() ?? "http";
  const canExecute = liveEnabled && payMode === "pay_cli";

  console.log("\n=== Live Naive-vs-Radar Head-to-Head Benchmark ===");
  console.log(`Profile: ${profile.name}`);
  console.log(`Trials: ${trials}`);
  console.log(`Intent: ${intent}`);
  console.log(`Category: ${category}`);
  console.log(`Expected output shape: ${expectedOutputShape}`);
  console.log(`Preferred capabilities: ${profile.preferredCapabilities.join(", ")}`);
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

    const naiveProviderMapping = findNaiveProvider(category);
    const naiveProvider = naiveProviderMapping?.providerId ?? null;
    const radarProviderAnyMapping = providerEndpointMap.find(
      (mapping) =>
        mapping.providerId === radarProvider && mapping.category.toLowerCase() === category.toLowerCase(),
    ) ?? null;
    const radarProviderMapping = providerEndpointMap.find(
      (mapping) =>
        mapping.providerId === radarProvider &&
        mapping.category.toLowerCase() === category.toLowerCase() &&
        mapping.status === "verified_pay_cli_success",
    ) ?? null;
    const naiveEndpointMappingId = naiveProviderMapping?.endpointMappingId ?? null;
    const radarEndpointMappingId = radarProviderMapping?.endpointMappingId ?? null;

    const providersSame = Boolean(naiveProvider && radarProvider && naiveProvider === radarProvider);
    const naiveEndpointMapped = Boolean(naiveProviderMapping);
    const radarEndpointMapped = Boolean(radarProviderMapping);
    const naiveEndpointMappingStatus = naiveProviderMapping?.status ?? null;
    const radarEndpointMappingStatus = radarProviderMapping?.status ?? null;
    const naiveOutputShape = naiveProviderMapping?.outputShape ?? null;
    const radarOutputShape = radarProviderMapping?.outputShape ?? null;
    const outputShapesSame = Boolean(naiveOutputShape && radarOutputShape && naiveOutputShape === radarOutputShape);
    const naiveOutputShapeMatchesExpected = naiveOutputShape === expectedOutputShape;
    const radarOutputShapeMatchesExpected = radarOutputShape === expectedOutputShape;
    const outputShapeFitOutcome = getOutputShapeFitOutcome(
      providersSame,
      naiveOutputShapeMatchesExpected,
      radarOutputShapeMatchesExpected,
    );
    const bothVerified =
      naiveEndpointMappingStatus === "verified_pay_cli_success" && radarEndpointMappingStatus === "verified_pay_cli_success";
    const outputShapeCaveat =
      !providersSame && bothVerified && !outputShapesSame
        ? "providers executed successfully but returned different market-data shapes"
        : null;
    let qualityComparisonAvailable = false;

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
    let errorClassification: string | null = null;
    let comparisonOutcome: ComparisonOutcome = "tie";
    let winReason: WinReason = "tie_or_not_applicable";
    let naiveExecutionAttempted = false;
    let radarExecutionAttempted = false;
    let naiveJsonRpcValid: boolean | null = null;
    let radarJsonRpcValid: boolean | null = null;
    let naiveJsonRpcMethod: string | null = getJsonRpcMethod(naiveProviderMapping);
    let radarJsonRpcMethod: string | null = getJsonRpcMethod(radarProviderMapping);
    let naiveJsonRpcResultShapeValid: boolean | null = null;
    let radarJsonRpcResultShapeValid: boolean | null = null;
    let naiveSlot: number | null = null;
    let radarSlot: number | null = null;
    let naiveApiVersion: string | null = null;
    let radarApiVersion: string | null = null;
    let naiveValidationError: string | null = null;
    let radarValidationError: string | null = null;

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

      if (radarProviderAnyMapping?.status === "verified_402") {
        radarErrorReason = "unverified_execution_mapping";
        errorClassification = "settlement_not_verified";
        comparisonOutcome = "invalid_unverified_execution_mapping";
      } else {
        radarErrorReason = "missing_endpoint_mapping";
        comparisonOutcome = "invalid_missing_endpoint";
      }
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

      const naiveJson = parseJsonOrNull(naiveRun.responsePreview);
      const radarJson = parseJsonOrNull(radarRun.responsePreview);
      if (naiveProviderMapping?.outputShape.startsWith("json_rpc_") && naiveJsonRpcMethod && naiveJson) {
        const validation = validateJsonRpcResponse(
          naiveProviderMapping.outputShape as "json_rpc_health" | "json_rpc_balance" | "json_rpc_slot",
          naiveJsonRpcMethod,
          naiveJson,
        );
        naiveJsonRpcValid = validation.jsonRpcValid;
        naiveJsonRpcResultShapeValid = validation.jsonRpcResultShapeValid;
        naiveSlot = validation.slot;
        naiveApiVersion = validation.apiVersion;
        naiveValidationError = validation.validationError;
      }
      if (radarProviderMapping?.outputShape.startsWith("json_rpc_") && radarJsonRpcMethod && radarJson) {
        const validation = validateJsonRpcResponse(
          radarProviderMapping.outputShape as "json_rpc_health" | "json_rpc_balance" | "json_rpc_slot",
          radarJsonRpcMethod,
          radarJson,
        );
        radarJsonRpcValid = validation.jsonRpcValid;
        radarJsonRpcResultShapeValid = validation.jsonRpcResultShapeValid;
        radarSlot = validation.slot;
        radarApiVersion = validation.apiVersion;
        radarValidationError = validation.validationError;
      }

      if (
        naiveErrorReason === "invalid_execution_skipped" ||
        radarErrorReason === "invalid_execution_skipped" ||
        naiveExecutionMode === "skipped" ||
        radarExecutionMode === "skipped"
      ) {
        comparisonOutcome = "invalid_execution_skipped";
      } else if (providersSame) {
        comparisonOutcome = "repeatability_same_provider";
      } else if (
        naiveSuccess &&
        radarSuccess &&
        radarOutputShapeMatchesExpected &&
        !naiveOutputShapeMatchesExpected
      ) {
        comparisonOutcome = "radar_win";
        winReason = "better_output_shape_fit";
      } else if (
        naiveSuccess &&
        radarSuccess &&
        naiveOutputShapeMatchesExpected &&
        !radarOutputShapeMatchesExpected
      ) {
        comparisonOutcome = "naive_win";
        winReason = "better_output_shape_fit";
      } else if (naiveSuccess && !radarSuccess) {
        comparisonOutcome = "naive_win";
        winReason = "execution_success";
      } else if (!naiveSuccess && radarSuccess) {
        comparisonOutcome = "radar_win";
        winReason = "execution_success";
      } else if ((naiveExecutionLatencyMs ?? Number.POSITIVE_INFINITY) < (radarExecutionLatencyMs ?? Number.POSITIVE_INFINITY)) {
        comparisonOutcome = "naive_win";
        winReason = "latency";
      } else if ((radarExecutionLatencyMs ?? Number.POSITIVE_INFINITY) < (naiveExecutionLatencyMs ?? Number.POSITIVE_INFINITY)) {
        comparisonOutcome = "radar_win";
        winReason = "latency";
      } else {
        comparisonOutcome = "tie";
      }

      qualityComparisonAvailable = naiveSuccess && radarSuccess && outputShapesSame;
    }

    const trial: HeadToHeadTrial = {
      trialId,
      timestamp,
      profile: profile.name,
      intent,
      category,
      expectedOutputShape,
      constraints,
      naiveProvider,
      radarProvider,
      naiveEndpointMappingId,
      radarEndpointMappingId,
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
      errorClassification,
      radarDecision,
      radarSelectedProviderDetails,
      radarBlockReason,
      radarCategoryMatch,
      radarCapabilityMatch,
      radarRequiredCapabilities,
      radarRejectionSummary,
      radarConsideredProvidersRejected,
      comparisonOutcome,
      winReason,
      naiveEndpointMapped,
      radarEndpointMapped,
      naiveEndpointMappingStatus,
      radarEndpointMappingStatus,
      naiveOutputShape,
      radarOutputShape,
      outputShapesSame,
      naiveOutputShapeMatchesExpected,
      radarOutputShapeMatchesExpected,
      outputShapeFitOutcome,
      outputShapeCaveat,
      qualityComparisonAvailable,
      naiveExecutionAttempted,
      radarExecutionAttempted,
      naiveJsonRpcValid,
      radarJsonRpcValid,
      naiveJsonRpcMethod,
      radarJsonRpcMethod,
      naiveJsonRpcResultShapeValid,
      radarJsonRpcResultShapeValid,
      naiveSlot,
      radarSlot,
      naiveApiVersion,
      radarApiVersion,
      naiveValidationError,
      radarValidationError,
    };

    benchmarkTrials.push(trial);
    console.log(
      `[trial ${trialId}/${trials}] profile=${profile.name} naive=${naiveProvider ?? "none"} radar=${radarProvider ?? "none"} outcome=${comparisonOutcome} fit=${outputShapeFitOutcome}`,
    );
  }

  const validComparisons = benchmarkTrials.filter(
    (trial) =>
      !trial.providersSame &&
      trial.naiveEndpointMapped &&
      trial.radarEndpointMapped &&
      trial.naiveExecutionAttempted &&
      trial.radarExecutionAttempted,
  );
  const comparableTrials = benchmarkTrials.filter(
    (trial) =>
      trial.naiveEndpointMapped &&
      trial.radarEndpointMapped &&
      trial.naiveExecutionAttempted &&
      trial.radarExecutionAttempted &&
      trial.comparisonOutcome !== "radar_route_blocked" &&
      trial.comparisonOutcome !== "invalid_missing_endpoint" &&
      trial.comparisonOutcome !== "invalid_unverified_execution_mapping" &&
      trial.comparisonOutcome !== "invalid_execution_skipped",
  );
  const invalidComparisons = benchmarkTrials.filter(
    (trial) =>
      trial.comparisonOutcome === "invalid_missing_endpoint" ||
      trial.comparisonOutcome === "invalid_unverified_execution_mapping" ||
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
    if (trial.comparisonOutcome === "invalid_unverified_execution_mapping") {
      acc.invalid_unverified_execution_mapping = (acc.invalid_unverified_execution_mapping ?? 0) + 1;
    }
    if (trial.comparisonOutcome === "invalid_execution_skipped") {
      acc.invalid_execution_skipped = (acc.invalid_execution_skipped ?? 0) + 1;
    }
    return acc;
  }, {});

  const qualityComparisonAvailableCount = benchmarkTrials.filter((trial) => trial.qualityComparisonAvailable).length;
  const sameAnswerQualityComparisonAvailable = qualityComparisonAvailableCount > 0;
  const routingFitEvidenceAvailable = benchmarkTrials.some(
    (trial) =>
      (trial.comparisonOutcome === "radar_win" || trial.comparisonOutcome === "naive_win") &&
      trial.winReason === "better_output_shape_fit",
  );
  const outputShapesObserved = Array.from(
    new Set(
      benchmarkTrials
        .flatMap((trial) => [trial.naiveOutputShape, trial.radarOutputShape])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const uniqueEndpointMappingsUsed = Array.from(
    new Set(
      benchmarkTrials.flatMap((trial) => {
        const mapped: string[] = [];
        if (trial.naiveProvider && trial.naiveEndpointMapped) {
          mapped.push(trial.naiveProvider);
        }
        if (trial.radarProvider && trial.radarEndpointMapped) {
          mapped.push(trial.radarProvider);
        }
        return mapped;
      }),
    ),
  );

  const naiveOutputShapeFitCount = benchmarkTrials.filter((trial) => trial.naiveOutputShapeMatchesExpected).length;
  const radarOutputShapeFitCount = benchmarkTrials.filter((trial) => trial.radarOutputShapeMatchesExpected).length;
  const outputShapeFitWins = benchmarkTrials.reduce<Record<string, number>>((acc, trial) => {
    acc[trial.outputShapeFitOutcome] = (acc[trial.outputShapeFitOutcome] ?? 0) + 1;
    return acc;
  }, {});

  const summary = {
    profile: profile.name,
    expectedOutputShape,
    totalTrials: benchmarkTrials.length,
    validHeadToHeadComparisonCount: validComparisons.length,
    routingFitEvidenceAvailable,
    superiorityEvidenceAvailable: routingFitEvidenceAvailable,
    sameAnswerQualityComparisonAvailable,
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
    naiveOutputShapeFitCount,
    radarOutputShapeFitCount,
    outputShapeFitWins,
    uniqueNaiveProviders: Array.from(new Set(benchmarkTrials.map((trial) => trial.naiveProvider).filter((value): value is string => Boolean(value)))),
    uniqueRadarProviders: Array.from(new Set(benchmarkTrials.map((trial) => trial.radarProvider).filter((value): value is string => Boolean(value)))),
    uniqueEndpointMappingsUsed,
    outputShapesObserved,
    qualityComparisonAvailableCount,
    caveat:
      "Same-provider outcomes prove repeatability of an executable route, not Radar superiority. Radar superiority requires multiple executable providers with different reliability/cost/latency profiles.",
    latencyCaveat:
      "Latency differences in same-provider trials may reflect CLI/payment/session effects, not routing quality.",
    outputShapeCaveat:
      "different output shapes allow execution reliability comparison, not same-answer quality comparison.",
    outputShapeFitCaveat:
      "output-shape fit is a routing-fit signal, not full answer-quality evaluation.",
  };

  await mkdir(RESULTS_DIR, { recursive: true });

  const jsonPath = path.join(RESULTS_DIR, "latest.json");
  const csvPath = path.join(RESULTS_DIR, "latest.csv");
  const summaryPath = path.join(RESULTS_DIR, "summary.md");

  const csvHeader = [
    "trialId",
    "timestamp",
    "profile",
    "intent",
    "category",
    "expectedOutputShape",
    "constraints",
    "naiveProvider",
    "radarProvider",
    "naiveEndpointMappingId",
    "radarEndpointMappingId",
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
    "errorClassification",
    "radarDecision",
    "radarSelectedProviderDetails",
    "radarBlockReason",
    "radarCategoryMatch",
    "radarCapabilityMatch",
    "radarRequiredCapabilities",
    "radarRejectionSummary",
    "radarConsideredProvidersRejected",
    "comparisonOutcome",
    "winReason",
    "naiveEndpointMappingStatus",
    "radarEndpointMappingStatus",
    "naiveOutputShape",
    "radarOutputShape",
    "outputShapesSame",
    "naiveOutputShapeMatchesExpected",
    "radarOutputShapeMatchesExpected",
    "outputShapeFitOutcome",
    "outputShapeCaveat",
    "qualityComparisonAvailable",
    "naiveJsonRpcValid",
    "radarJsonRpcValid",
    "naiveJsonRpcMethod",
    "radarJsonRpcMethod",
    "naiveJsonRpcResultShapeValid",
    "radarJsonRpcResultShapeValid",
    "naiveSlot",
    "radarSlot",
    "naiveApiVersion",
    "radarApiVersion",
    "naiveValidationError",
    "radarValidationError",
  ].join(",");

  const csvRows = benchmarkTrials.map((trial) =>
    [
      trial.trialId,
      trial.timestamp,
      trial.profile,
      trial.intent,
      trial.category,
      trial.expectedOutputShape,
      JSON.stringify(trial.constraints),
      trial.naiveProvider ?? "",
      trial.radarProvider ?? "",
      trial.naiveEndpointMappingId ?? "",
      trial.radarEndpointMappingId ?? "",
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
      trial.errorClassification ?? "",
      trial.radarDecision,
      JSON.stringify(trial.radarSelectedProviderDetails ?? {}),
      trial.radarBlockReason ?? "",
      trial.radarCategoryMatch ?? "",
      trial.radarCapabilityMatch ?? "",
      JSON.stringify(trial.radarRequiredCapabilities),
      trial.radarRejectionSummary ?? "",
      JSON.stringify(trial.radarConsideredProvidersRejected),
      trial.comparisonOutcome,
      trial.winReason,
      trial.naiveEndpointMappingStatus ?? "",
      trial.radarEndpointMappingStatus ?? "",
      trial.naiveOutputShape ?? "",
      trial.radarOutputShape ?? "",
      trial.outputShapesSame,
      trial.naiveOutputShapeMatchesExpected,
      trial.radarOutputShapeMatchesExpected,
      trial.outputShapeFitOutcome,
      trial.outputShapeCaveat ?? "",
      trial.qualityComparisonAvailable,
      trial.naiveJsonRpcValid ?? "",
      trial.radarJsonRpcValid ?? "",
      trial.naiveJsonRpcMethod ?? "",
      trial.radarJsonRpcMethod ?? "",
      trial.naiveJsonRpcResultShapeValid ?? "",
      trial.radarJsonRpcResultShapeValid ?? "",
      trial.naiveSlot ?? "",
      trial.radarSlot ?? "",
      trial.naiveApiVersion ?? "",
      trial.radarApiVersion ?? "",
      trial.naiveValidationError ?? "",
      trial.radarValidationError ?? "",
    ]
      .map((cell) => toCsvCell(cell))
      .join(","),
  );

  const summaryMarkdown = [
    "# Live Naive-vs-Radar Benchmark Summary",
    "",
    `- profile: ${summary.profile}`,
    `- expected output shape: ${summary.expectedOutputShape}`,
    `- total trials: ${summary.totalTrials}`,
    `- valid head-to-head comparison count (different-provider executable comparisons): ${summary.validHeadToHeadComparisonCount}`,
    `- routing fit evidence available: ${summary.routingFitEvidenceAvailable}`,
    `- superiority evidence available: ${summary.superiorityEvidenceAvailable}`,
    `- same-answer quality comparison available: ${summary.sameAnswerQualityComparisonAvailable}`,
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
    `- naive output shape fit count: ${summary.naiveOutputShapeFitCount}`,
    `- radar output shape fit count: ${summary.radarOutputShapeFitCount}`,
    `- output-shape fit wins: ${JSON.stringify(summary.outputShapeFitWins)}`,
    `- unique naive providers: ${summary.uniqueNaiveProviders.join(", ") || "none"}`,
    `- unique Radar providers: ${summary.uniqueRadarProviders.join(", ") || "none"}`,
    `- unique endpoint mappings used: ${summary.uniqueEndpointMappingsUsed.join(", ") || "none"}`,
    `- output shapes observed: ${summary.outputShapesObserved.join(", ") || "none"}`,
    `- qualityComparisonAvailable count: ${summary.qualityComparisonAvailableCount}`,
    ...(summary.routingFitEvidenceAvailable && summary.radarWins > 0
      ? [
          "- Routing-fit superiority evidence available: Radar selected the provider whose output shape matched the requested intent.",
          "- caveat: This is routing-fit evidence, not full answer-quality superiority.",
        ]
      : []),
    `- caveat: ${summary.caveat}`,
    `- caveat: ${summary.latencyCaveat}`,
    `- caveat: ${summary.outputShapeCaveat}`,
    `- caveat: ${summary.outputShapeFitCaveat}`,
    ...((comparableTrials.length > 0 &&
    comparableTrials.every((trial) => trial.comparisonOutcome === "repeatability_same_provider"))
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

  return {
    summary,
    trials: benchmarkTrials,
    reportPaths: {
      jsonPath,
      csvPath,
      summaryPath,
    },
  };
}

if (require.main === module) {
  runLiveHeadToHeadBenchmark().catch((error) => {
    console.error("benchmark:live-head-to-head failed", error);
    process.exitCode = 1;
  });
}
