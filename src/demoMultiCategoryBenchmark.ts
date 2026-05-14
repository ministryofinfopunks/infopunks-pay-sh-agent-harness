import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { providerEndpointMap, ProviderEndpointMapping } from "./providerEndpointMap";
import { callRadarPreflight, RadarPreflightInput } from "./radarClient";

const RESULTS_DIR = path.resolve(process.cwd(), "benchmark-results", "multi-category");

export type BenchmarkRoutingMode = "local_verified_router" | "live_radar";
export type SelectionSource = "local_verified_router" | "live_radar";

type ProfileName =
  | "solana_trending_pools"
  | "solana_rpc_health"
  | "research_answer"
  | "places_search"
  | "image_labels";

interface MultiCategoryProfile {
  profile: ProfileName;
  intent: string;
  category: string;
  expectedProvider: string;
  expectedOutputShape: string;
  includeByDefault: boolean;
  preferredCapabilities: string[];
}

export const MULTI_CATEGORY_PROFILES: MultiCategoryProfile[] = [
  {
    profile: "solana_trending_pools",
    intent: "get trending Solana DEX pools",
    category: "finance",
    expectedProvider: "paysponge-coingecko",
    expectedOutputShape: "trending_pools",
    includeByDefault: true,
    preferredCapabilities: ["market_data", "dex_pools", "trending"],
  },
  {
    profile: "solana_rpc_health",
    intent: "check Solana RPC health",
    category: "compute",
    expectedProvider: "quicknode-rpc",
    expectedOutputShape: "json_rpc_health",
    includeByDefault: true,
    preferredCapabilities: ["rpc", "blockchain", "solana", "onchain", "compute"],
  },
  {
    profile: "research_answer",
    intent: "research latest Solana agent payments",
    category: "ai_ml",
    expectedProvider: "paysponge/perplexity",
    expectedOutputShape: "research_answer",
    includeByDefault: true,
    preferredCapabilities: ["research", "web_search", "citations", "answer", "ai_ml"],
  },
  {
    profile: "places_search",
    intent: "find coffee shops in Colombo Sri Lanka",
    category: "maps",
    expectedProvider: "solana-foundation/google/places",
    expectedOutputShape: "places_search",
    includeByDefault: true,
    preferredCapabilities: ["maps", "search", "places"],
  },
  {
    profile: "image_labels",
    intent: "label a tiny test image",
    category: "ai_ml",
    expectedProvider: "solana-foundation/google/vision",
    expectedOutputShape: "image_labels",
    includeByDefault: false,
    preferredCapabilities: ["ai_ml", "vision", "ocr", "image_labels"],
  },
];

export interface MultiCategoryProfileResult {
  profile: ProfileName;
  intent: string;
  category: string;
  expectedProvider: string;
  selectedProvider: string | null;
  providerMatched: boolean;
  expectedOutputShape: string;
  actualOutputShape: string | null;
  outputShapeMatched: boolean;
  executionSuccess: boolean;
  parsedJsonAvailable: boolean;
  applicationSuccess: boolean;
  latencyMs: number | null;
  errorReason: string | null;
  notes: string;
  routingMode: BenchmarkRoutingMode;
  selectionSource: SelectionSource;
}

export interface MultiCategorySummary {
  totalProfiles: number;
  profilesPassed: number;
  profilesFailed: number;
  expectedProviderMatchCount: number;
  expectedOutputShapeMatchCount: number;
  executionAttemptedCount: number;
  executionSuccessCount: number;
  parsedJsonSuccessCount: number;
  applicationSuccessCount: number;
  routingMode: BenchmarkRoutingMode;
  liveRadarUnavailableCount: number;
  liveRadarNoCandidatesCount: number;
  localRouterUsedCount: number;
}

function normalizeProviderId(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "");
}

export function classifyProviderMatch(expectedProvider: string, selectedProvider: string | null): boolean {
  if (!selectedProvider) {
    return false;
  }
  return normalizeProviderId(expectedProvider) === normalizeProviderId(selectedProvider);
}

export function classifyOutputShapeMatch(expectedOutputShape: string, actualOutputShape: string | null): boolean {
  if (!actualOutputShape) {
    return false;
  }
  return expectedOutputShape.toLowerCase().trim() === actualOutputShape.toLowerCase().trim();
}

function parseJsonOrNull(input: unknown): Record<string, unknown> | null {
  if (typeof input === "object" && input !== null) {
    return input as Record<string, unknown>;
  }
  if (typeof input !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(input) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function detectOutputShape(payload: Record<string, unknown>): string | null {
  if (Array.isArray(payload.data)) {
    return "trending_pools";
  }
  if (
    payload.jsonrpc === "2.0" &&
    (payload.result === "ok" || (typeof payload.result === "string" && payload.result.toLowerCase() === "ok"))
  ) {
    return "json_rpc_health";
  }
  if (Array.isArray(payload.places)) {
    return "places_search";
  }
  if (Array.isArray(payload.responses)) {
    const first = payload.responses[0];
    if (typeof first === "object" && first !== null && Array.isArray((first as Record<string, unknown>).labelAnnotations)) {
      return "image_labels";
    }
  }
  if (
    typeof payload.answer === "string" ||
    Array.isArray(payload.results) ||
    Array.isArray(payload.search_results) ||
    typeof payload.content === "string"
  ) {
    return "research_answer";
  }
  return null;
}

function hasApplicationError(payload: Record<string, unknown>): string | null {
  const topError = payload.error;
  if (typeof topError === "string") {
    return topError;
  }
  if (typeof topError === "object" && topError !== null) {
    const message = (topError as Record<string, unknown>).message;
    return typeof message === "string" ? message : "error_object_present";
  }
  return null;
}

function evaluateApplication(payload: Record<string, unknown>, expectedOutputShape: string): boolean {
  return classifyOutputShapeMatch(expectedOutputShape, detectOutputShape(payload));
}

function toCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function getArgValue(argv: string[], key: string): string | undefined {
  const hit = argv.find((entry) => entry.startsWith(`--${key}=`));
  return hit ? hit.slice(key.length + 3).trim() : undefined;
}

export function resolveRoutingMode(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): BenchmarkRoutingMode {
  const fromArg = getArgValue(argv, "routing-mode");
  const fromEnv = env.BENCHMARK_ROUTING_MODE?.trim();
  const raw = (fromArg || fromEnv || "local_verified_router").toLowerCase();
  return raw === "live_radar" ? "live_radar" : "local_verified_router";
}

export function getSelectedProfiles(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): MultiCategoryProfile[] {
  const requestedProfile = getArgValue(argv, "profile");
  if (requestedProfile) {
    const selected = MULTI_CATEGORY_PROFILES.find((profile) => profile.profile === requestedProfile);
    return selected ? [selected] : MULTI_CATEGORY_PROFILES.filter((profile) => profile.includeByDefault);
  }

  const includeImageLabels = argv.includes("--include-image-labels") || env.BENCHMARK_INCLUDE_IMAGE_LABELS === "true";
  return MULTI_CATEGORY_PROFILES.filter((profile) => profile.includeByDefault || includeImageLabels);
}

export function selectLocalVerifiedMapping(profile: MultiCategoryProfile): ProviderEndpointMapping | null {
  const exact = providerEndpointMap.find(
    (mapping) =>
      mapping.status === "verified_pay_cli_success" &&
      mapping.category === profile.category &&
      mapping.outputShape === profile.expectedOutputShape &&
      normalizeProviderId(mapping.providerId) === normalizeProviderId(profile.expectedProvider),
  );
  if (exact) {
    return exact;
  }

  return (
    providerEndpointMap.find(
      (mapping) =>
        mapping.status === "verified_pay_cli_success" &&
        mapping.category === profile.category &&
        mapping.outputShape === profile.expectedOutputShape &&
        profile.preferredCapabilities.some((capability) => mapping.capabilities.includes(capability)),
    ) ?? null
  );
}

function findVerifiedMappingByProviderId(providerId: string | null): ProviderEndpointMapping | null {
  if (!providerId) {
    return null;
  }
  return (
    providerEndpointMap.find(
      (mapping) =>
        mapping.status === "verified_pay_cli_success" &&
        normalizeProviderId(mapping.providerId) === normalizeProviderId(providerId),
    ) ?? null
  );
}

async function executeSelection(
  profile: MultiCategoryProfile,
  routingMode: BenchmarkRoutingMode,
): Promise<MultiCategoryProfileResult> {
  if (routingMode === "local_verified_router") {
    const selectedMapping = selectLocalVerifiedMapping(profile);
    const selectedProvider = selectedMapping?.providerId ?? null;
    const providerMatched = classifyProviderMatch(profile.expectedProvider, selectedProvider);

    if (!selectedMapping) {
      return {
        profile: profile.profile,
        intent: profile.intent,
        category: profile.category,
        expectedProvider: profile.expectedProvider,
        selectedProvider,
        providerMatched,
        expectedOutputShape: profile.expectedOutputShape,
        actualOutputShape: null,
        outputShapeMatched: false,
        executionSuccess: false,
        parsedJsonAvailable: false,
        applicationSuccess: false,
        latencyMs: null,
        errorReason: "local_verified_mapping_not_found",
        notes: "No verified local mapping matched category/capability/outputShape expectation.",
        routingMode,
        selectionSource: "local_verified_router",
      };
    }

    const execution = await executeLivePayShCall({
      providerId: selectedMapping.providerId,
      intent: profile.intent,
      endpointUrl: selectedMapping.url,
      method: selectedMapping.method,
      body: selectedMapping.body ?? undefined,
      headers: selectedMapping.headers,
    });

    const parsedPayload = parseJsonOrNull(execution.parsedJson ?? execution.responsePreview);
    const actualOutputShape = parsedPayload ? detectOutputShape(parsedPayload) : null;
    const outputShapeMatched = classifyOutputShapeMatch(profile.expectedOutputShape, actualOutputShape);
    const appError = parsedPayload ? hasApplicationError(parsedPayload) : "parsed_json_unavailable";
    const applicationSuccess = parsedPayload ? evaluateApplication(parsedPayload, profile.expectedOutputShape) : false;

    return {
      profile: profile.profile,
      intent: profile.intent,
      category: profile.category,
      expectedProvider: profile.expectedProvider,
      selectedProvider,
      providerMatched,
      expectedOutputShape: profile.expectedOutputShape,
      actualOutputShape,
      outputShapeMatched,
      executionSuccess: execution.success,
      parsedJsonAvailable: execution.parsedJsonAvailable,
      applicationSuccess,
      latencyMs: execution.latencyMs,
      errorReason: execution.errorReason ?? (appError ? `application_error:${appError}` : null),
      notes: "execution_attempted",
      routingMode,
      selectionSource: "local_verified_router",
    };
  }

  const candidateMappings = providerEndpointMap.filter(
    (mapping) =>
      mapping.status === "verified_pay_cli_success" &&
      mapping.category === profile.category &&
      mapping.outputShape === profile.expectedOutputShape,
  );
  const candidateProviders = candidateMappings.map((mapping) => mapping.providerId);
  const preflightInput: RadarPreflightInput = {
    intent: profile.intent,
    category: profile.category,
    candidateProviders,
  };

  const preflight = await callRadarPreflight(preflightInput);
  if (!preflight.available) {
    return {
      profile: profile.profile,
      intent: profile.intent,
      category: profile.category,
      expectedProvider: profile.expectedProvider,
      selectedProvider: null,
      providerMatched: false,
      expectedOutputShape: profile.expectedOutputShape,
      actualOutputShape: null,
      outputShapeMatched: false,
      executionSuccess: false,
      parsedJsonAvailable: false,
      applicationSuccess: false,
      latencyMs: null,
      errorReason: "radar_preflight_unavailable",
      notes: preflight.fallbackReason ?? "Radar preflight unavailable.",
      routingMode,
      selectionSource: "live_radar",
    };
  }

  const selectedProvider = preflight.decision?.selectedProvider ?? null;
  const providerMatched = classifyProviderMatch(profile.expectedProvider, selectedProvider);
  if (!selectedProvider) {
    const blockReason = (preflight.decision?.blockReason ?? "").trim().toLowerCase();
    const isNoCandidates = blockReason === "no_candidates";
    return {
      profile: profile.profile,
      intent: profile.intent,
      category: profile.category,
      expectedProvider: profile.expectedProvider,
      selectedProvider,
      providerMatched,
      expectedOutputShape: profile.expectedOutputShape,
      actualOutputShape: null,
      outputShapeMatched: false,
      executionSuccess: false,
      parsedJsonAvailable: false,
      applicationSuccess: false,
      latencyMs: null,
      errorReason: isNoCandidates ? "no_candidates" : (preflight.decision?.blockReason ?? "route_blocked"),
      notes: isNoCandidates
        ? "Live Radar returned no provider candidate for this profile."
        : "Radar route not approved.",
      routingMode,
      selectionSource: "live_radar",
    };
  }

  const selectedMapping = findVerifiedMappingByProviderId(selectedProvider);
  if (!selectedMapping) {
    return {
      profile: profile.profile,
      intent: profile.intent,
      category: profile.category,
      expectedProvider: profile.expectedProvider,
      selectedProvider,
      providerMatched,
      expectedOutputShape: profile.expectedOutputShape,
      actualOutputShape: null,
      outputShapeMatched: false,
      executionSuccess: false,
      parsedJsonAvailable: false,
      applicationSuccess: false,
      latencyMs: null,
      errorReason: "selected_provider_not_in_verified_pay_cli_success_mappings",
      notes: "Radar selected provider that is not in local verified mappings.",
      routingMode,
      selectionSource: "live_radar",
    };
  }

  const execution = await executeLivePayShCall({
    providerId: selectedMapping.providerId,
    intent: profile.intent,
    endpointUrl: selectedMapping.url,
    method: selectedMapping.method,
    body: selectedMapping.body ?? undefined,
    headers: selectedMapping.headers,
  });

  const parsedPayload = parseJsonOrNull(execution.parsedJson ?? execution.responsePreview);
  const actualOutputShape = parsedPayload ? detectOutputShape(parsedPayload) : null;
  const outputShapeMatched = classifyOutputShapeMatch(profile.expectedOutputShape, actualOutputShape);
  const appError = parsedPayload ? hasApplicationError(parsedPayload) : "parsed_json_unavailable";
  const applicationSuccess = parsedPayload ? evaluateApplication(parsedPayload, profile.expectedOutputShape) : false;

  return {
    profile: profile.profile,
    intent: profile.intent,
    category: profile.category,
    expectedProvider: profile.expectedProvider,
    selectedProvider,
    providerMatched,
    expectedOutputShape: profile.expectedOutputShape,
    actualOutputShape,
    outputShapeMatched,
    executionSuccess: execution.success,
    parsedJsonAvailable: execution.parsedJsonAvailable,
    applicationSuccess,
    latencyMs: execution.latencyMs,
    errorReason: execution.errorReason ?? (appError ? `application_error:${appError}` : null),
    notes: "execution_attempted",
    routingMode,
    selectionSource: "live_radar",
  };
}

export function buildSummary(results: MultiCategoryProfileResult[], routingMode: BenchmarkRoutingMode): MultiCategorySummary {
  const executionAttemptedCount = results.filter((result) => result.notes.includes("execution_attempted")).length;
  const executionSuccessCount = results.filter((result) => result.executionSuccess).length;
  const parsedJsonSuccessCount = results.filter((result) => result.parsedJsonAvailable).length;
  const applicationSuccessCount = results.filter((result) => result.applicationSuccess).length;
  const expectedProviderMatchCount = results.filter((result) => result.providerMatched).length;
  const expectedOutputShapeMatchCount = results.filter((result) => result.outputShapeMatched).length;
  const profilesPassed = results.filter(
    (result) =>
      result.providerMatched &&
      result.outputShapeMatched &&
      result.executionSuccess &&
      result.parsedJsonAvailable &&
      result.applicationSuccess,
  ).length;

  return {
    totalProfiles: results.length,
    profilesPassed,
    profilesFailed: results.length - profilesPassed,
    expectedProviderMatchCount,
    expectedOutputShapeMatchCount,
    executionAttemptedCount,
    executionSuccessCount,
    parsedJsonSuccessCount,
    applicationSuccessCount,
    routingMode,
    liveRadarUnavailableCount: results.filter((result) => result.errorReason === "radar_preflight_unavailable").length,
    liveRadarNoCandidatesCount: results.filter((result) => result.errorReason === "no_candidates").length,
    localRouterUsedCount: results.filter((result) => result.selectionSource === "local_verified_router").length,
  };
}

function toMarkdown(summary: MultiCategorySummary): string {
  return [
    "# Multi-Category Routing Benchmark Summary",
    "",
    `- total profiles: ${summary.totalProfiles}`,
    `- profiles passed: ${summary.profilesPassed}`,
    `- profiles failed: ${summary.profilesFailed}`,
    `- routingMode: ${summary.routingMode}`,
    `- expectedProviderMatchCount: ${summary.expectedProviderMatchCount}`,
    `- expectedOutputShapeMatchCount: ${summary.expectedOutputShapeMatchCount}`,
    `- executionAttemptedCount: ${summary.executionAttemptedCount}`,
    `- executionSuccessCount: ${summary.executionSuccessCount}`,
    `- parsedJsonSuccessCount: ${summary.parsedJsonSuccessCount}`,
    `- applicationSuccessCount: ${summary.applicationSuccessCount}`,
    `- liveRadarUnavailableCount: ${summary.liveRadarUnavailableCount}`,
    `- liveRadarNoCandidatesCount: ${summary.liveRadarNoCandidatesCount}`,
    `- localRouterUsedCount: ${summary.localRouterUsedCount}`,
    "",
  ].join("\n");
}

export async function runMultiCategoryBenchmark(): Promise<{
  summary: MultiCategorySummary;
  results: MultiCategoryProfileResult[];
  reportPaths: { jsonPath: string; csvPath: string; summaryPath: string };
}> {
  const routingMode = resolveRoutingMode();
  const profiles = getSelectedProfiles();
  const results: MultiCategoryProfileResult[] = [];

  for (const profile of profiles) {
    const result = await executeSelection(profile, routingMode);
    results.push(result);
    console.log(
      `[${profile.profile}] mode=${routingMode} source=${result.selectionSource} selected=${result.selectedProvider ?? "none"} providerMatched=${result.providerMatched} shape=${result.actualOutputShape ?? "unknown"} success=${result.executionSuccess}`,
    );
  }

  const summary = buildSummary(results, routingMode);

  await mkdir(RESULTS_DIR, { recursive: true });
  const jsonPath = path.join(RESULTS_DIR, "latest.json");
  const csvPath = path.join(RESULTS_DIR, "latest.csv");
  const summaryPath = path.join(RESULTS_DIR, "summary.md");

  const csvHeader = [
    "profile",
    "intent",
    "category",
    "routingMode",
    "selectionSource",
    "expectedProvider",
    "selectedProvider",
    "providerMatched",
    "expectedOutputShape",
    "actualOutputShape",
    "outputShapeMatched",
    "executionSuccess",
    "parsedJsonAvailable",
    "applicationSuccess",
    "latencyMs",
    "errorReason",
    "notes",
  ].join(",");

  const csvRows = results.map((result) =>
    [
      result.profile,
      result.intent,
      result.category,
      result.routingMode,
      result.selectionSource,
      result.expectedProvider,
      result.selectedProvider ?? "",
      result.providerMatched,
      result.expectedOutputShape,
      result.actualOutputShape ?? "",
      result.outputShapeMatched,
      result.executionSuccess,
      result.parsedJsonAvailable,
      result.applicationSuccess,
      result.latencyMs ?? "",
      result.errorReason ?? "",
      result.notes,
    ]
      .map((cell) => toCsvCell(cell))
      .join(","),
  );

  await writeFile(jsonPath, `${JSON.stringify({ summary, results }, null, 2)}\n`, "utf8");
  await writeFile(csvPath, `${csvHeader}\n${csvRows.join("\n")}\n`, "utf8");
  await writeFile(summaryPath, toMarkdown(summary), "utf8");

  return { summary, results, reportPaths: { jsonPath, csvPath, summaryPath } };
}

if (require.main === module) {
  runMultiCategoryBenchmark()
    .then(({ summary, reportPaths }) => {
      console.log("\n=== Multi-Category Routing Benchmark ===");
      console.log(`routingMode: ${summary.routingMode}`);
      console.log(`total profiles: ${summary.totalProfiles}`);
      console.log(`profiles passed: ${summary.profilesPassed}`);
      console.log(`profiles failed: ${summary.profilesFailed}`);
      console.log(`expectedProviderMatchCount: ${summary.expectedProviderMatchCount}`);
      console.log(`expectedOutputShapeMatchCount: ${summary.expectedOutputShapeMatchCount}`);
      console.log(`executionAttemptedCount: ${summary.executionAttemptedCount}`);
      console.log(`executionSuccessCount: ${summary.executionSuccessCount}`);
      console.log(`parsedJsonSuccessCount: ${summary.parsedJsonSuccessCount}`);
      console.log(`applicationSuccessCount: ${summary.applicationSuccessCount}`);
      console.log(`liveRadarUnavailableCount: ${summary.liveRadarUnavailableCount}`);
      console.log(`liveRadarNoCandidatesCount: ${summary.liveRadarNoCandidatesCount}`);
      console.log(`localRouterUsedCount: ${summary.localRouterUsedCount}`);
      console.log("artifact paths:");
      console.log(`- ${reportPaths.jsonPath}`);
      console.log(`- ${reportPaths.csvPath}`);
      console.log(`- ${reportPaths.summaryPath}`);
    })
    .catch((error) => {
      console.error("benchmark:multi-category failed", error);
      process.exitCode = 1;
    });
}
