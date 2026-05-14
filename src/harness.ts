import { executeLivePayShCall, isLivePayShExecutionConfigured } from "./livePayShExecutor";
import { fetchPayShCatalog } from "./payShClient";
import { saveProofLog } from "./proofLog";
import {
  callRadarPreflight,
  fetchRadarSignals,
  RadarPreflightDecision,
  RadarPreflightResult,
} from "./radarClient";
import { routeProvider } from "./router";
import {
  CandidateProvider,
  CatalogMode,
  HarnessProviderCandidate,
  LivePayShExecutionResult,
  ProofLog,
  ProviderCatalogEntry,
  RadarPreflightAndExecuteDecision,
  RadarPreflightAndExecuteInput,
  RadarPreflightAndExecuteResult,
  RejectedProvider,
  RoutingResult,
} from "./types";

const DEFAULT_MIN_TRUST_SCORE = 70;
const UNKNOWN_REGION = "unknown";

function toCatalogMode(mode: "live" | "mock" | "fallback-mock"): CatalogMode {
  return mode === "fallback-mock" ? "fallback" : mode;
}

function getProviderId(candidate: HarnessProviderCandidate): string {
  return typeof candidate === "string" ? candidate : candidate.id;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toCatalogProvider(candidate: HarnessProviderCandidate, index: number): ProviderCatalogEntry {
  if (typeof candidate === "string") {
    return {
      id: candidate,
      name: candidate,
      region: UNKNOWN_REGION,
      catalogPriority: index + 1,
    };
  }

  return {
    id: candidate.id,
    name: candidate.name,
    region: candidate.region,
    catalogPriority: "catalogPriority" in candidate ? candidate.catalogPriority : index + 1,
    category: candidate.category,
    mockData: "mockData" in candidate ? candidate.mockData : undefined,
  };
}

function toCandidateFromCatalog(provider: ProviderCatalogEntry): CandidateProvider {
  return {
    id: provider.id,
    name: provider.name,
    region: provider.region,
    category: provider.category,
    trustScore: 0,
    degradationActive: false,
    signalScore: 0,
    latencyMs: 0,
  };
}

function toCandidateFromDecision(
  providerId: string,
  details?: Record<string, unknown>,
): CandidateProvider {
  return {
    id: providerId,
    name: typeof details?.name === "string" ? details.name : providerId,
    region: typeof details?.region === "string" ? details.region : UNKNOWN_REGION,
    category: typeof details?.category === "string" ? details.category : undefined,
    trustScore: toNumber(details?.trustScore, 0),
    degradationActive: toBoolean(details?.degradationFlag, false),
    signalScore: toNumber(details?.signalScore, 0),
    latencyMs: toNumber(details?.latencyMs, 0),
    costUsd: toNullableNumber(details?.costUsd) ?? undefined,
  };
}

function buildRoutingFromPreflight(
  providerCandidates: ProviderCatalogEntry[],
  decision: RadarPreflightDecision,
): RoutingResult {
  const candidateProviders = providerCandidates.map(toCandidateFromCatalog);
  const candidateById = new Map(candidateProviders.map((candidate) => [candidate.id, candidate]));

  if (decision.selectedProvider && !candidateById.has(decision.selectedProvider)) {
    const selected = toCandidateFromDecision(decision.selectedProvider, decision.selectedProviderDetails);
    candidateProviders.push(selected);
    candidateById.set(selected.id, selected);
  }

  for (const rejectedProviderId of decision.rejectedProviders) {
    if (!candidateById.has(rejectedProviderId)) {
      const rejected = toCandidateFromDecision(rejectedProviderId);
      candidateProviders.push(rejected);
      candidateById.set(rejected.id, rejected);
    }
  }

  const selectedProvider = decision.selectedProvider
    ? candidateById.get(decision.selectedProvider) ?? null
    : null;
  const rejectedProviders: RejectedProvider[] = decision.rejectedProviders.map((providerId) => ({
    providerId,
    providerName: candidateById.get(providerId)?.name ?? providerId,
    reasons: ["radarPreflightRejected"],
  }));

  return {
    selectedProvider: decision.decision === "route_approved" ? selectedProvider : null,
    candidateProviders,
    rejectedProviders,
    radarSignalsUsed: [],
    routingPolicy: decision.routingPolicy,
    decision: decision.decision === "route_approved" && selectedProvider ? "route_selected" : "route_blocked",
    categoryMatch: decision.categoryMatch,
    fallbackCategoryUsed: false,
    selectedProviderDetails: selectedProvider
      ? {
          providerId: selectedProvider.id,
          name: selectedProvider.name,
          category: selectedProvider.category ?? null,
          trustScore: selectedProvider.trustScore,
          signalScore: selectedProvider.signalScore,
          latencyMs: selectedProvider.latencyMs,
          costUsd: selectedProvider.costUsd ?? null,
          degradationFlag: selectedProvider.degradationActive,
        }
      : null,
  };
}

function makeSkippedExecutionResult(
  providerId: string,
  intent: string,
  endpointUrl: string | undefined,
  startedAtMs: number,
  errorReason: string,
): LivePayShExecutionResult {
  const completedAtMs = Date.now();
  return {
    providerId,
    intent,
    endpointUrl,
    startedAt: new Date(startedAtMs).toISOString(),
    completedAt: new Date(completedAtMs).toISOString(),
    latencyMs: completedAtMs - startedAtMs,
    success: false,
    costUsd: null,
    settlementReference: null,
    responsePreview: "",
    parsedJsonAvailable: false,
    errorReason,
    mode: "skipped",
  };
}

function getProofConfig(input: RadarPreflightAndExecuteInput): { enabled: boolean; kind: string } {
  if (typeof input.proof === "boolean") {
    return { enabled: input.proof, kind: "radar-preflight-execute" };
  }
  return {
    enabled: input.proof?.enabled ?? false,
    kind: input.proof?.kind ?? "radar-preflight-execute",
  };
}

function buildDecision(
  approved: boolean,
  selectedProviderId: string | null,
  source: "radar_preflight" | "local_router",
  blockReason?: string,
): RadarPreflightAndExecuteDecision {
  return {
    approved,
    decision: approved ? "route_approved" : "route_blocked",
    selectedProviderId,
    blockReason,
    source,
  };
}

function getSkippedExecutionReason(
  decision: RadarPreflightAndExecuteDecision,
  executionResult?: LivePayShExecutionResult,
): string | undefined {
  if (!decision.approved) {
    return decision.source === "radar_preflight" ? "radar_route_blocked" : "route_not_approved";
  }
  if (executionResult?.mode === "skipped") {
    return executionResult.errorReason ?? "execution_exception";
  }
  return undefined;
}

function buildProofLog(input: {
  timestamp: string;
  intent: string;
  routingResult?: RoutingResult;
  preflightResult: RadarPreflightResult;
  executionResult?: LivePayShExecutionResult;
  elapsedMs: number;
  catalogMode?: CatalogMode;
}): ProofLog {
  const routingResult = input.routingResult;
  return {
    timestamp: input.timestamp,
    userIntent: input.intent,
    candidateProviders: routingResult?.candidateProviders ?? [],
    selectedProvider: routingResult?.selectedProvider ?? null,
    rejectedProviders: routingResult?.rejectedProviders ?? [],
    radarSignalsUsed: routingResult?.radarSignalsUsed ?? [],
    routingPolicy: routingResult?.routingPolicy ?? input.preflightResult.decision?.routingPolicy ?? [],
    simulatedOrLiveResult: input.executionResult?.mode ?? "skipped",
    executionMode: input.executionResult?.mode ?? "skipped",
    settlementReference: input.executionResult?.settlementReference ?? undefined,
    executionLatencyMs: input.executionResult?.latencyMs,
    latencyMs: input.elapsedMs,
    success: input.executionResult?.success ?? false,
    catalogMode: input.catalogMode,
    radarMode: input.preflightResult.mode,
    radarApiUsed: input.preflightResult.available,
    radarEndpoint: input.preflightResult.endpoint,
    radarDecision: input.preflightResult.decision?.decision ?? routingResult?.decision,
    radarDataMode: input.preflightResult.decision?.dataMode,
    radarSource: input.preflightResult.decision?.source,
    fallbackReason: input.preflightResult.available ? undefined : input.preflightResult.fallbackReason,
  };
}

/**
 * Runs the full harness flow for an agent request: Radar preflight, provider routing,
 * optional Pay.sh execution, and optional proof-log persistence.
 *
 * Executes a live Pay.sh call only when the route is approved and execution is enabled.
 * Skips execution when Radar blocks the route, no provider is selected, or preflight-only mode is requested.
 * When proof logging is enabled, writes a single proof record for the preflight/routing/execution outcome.
 *
 * @example
 * ```ts
 * const result = await radarPreflightAndExecute({
 *   intent: "get trending Solana DEX pools",
 *   category: "finance",
 *   constraints: { minTrustScore: 70, maxLatencyMs: 3000, maxCostUsd: 0.05 },
 *   execution: { endpointUrl: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/trending_pools", method: "GET" },
 *   proof: { enabled: true },
 * });
 * ```
 */
export async function radarPreflightAndExecute(
  input: RadarPreflightAndExecuteInput,
): Promise<RadarPreflightAndExecuteResult> {
  const startedAtMs = Date.now();
  const candidateProviderIds = input.candidateProviders?.map(getProviderId);
  const providedCatalogCandidates = input.candidateProviders?.map(toCatalogProvider) ?? [];
  let catalogMode: CatalogMode | undefined;

  const preflightResult = await callRadarPreflight({
    intent: input.intent,
    category: input.category,
    constraints: input.constraints,
    candidateProviders: candidateProviderIds,
  });

  let routingResult: RoutingResult | undefined;
  let routingSource: "radar_preflight" | "local_router" = "radar_preflight";

  if (preflightResult.available && preflightResult.decision) {
    routingResult = buildRoutingFromPreflight(providedCatalogCandidates, preflightResult.decision);
  } else {
    routingSource = "local_router";
    let catalogProviders = providedCatalogCandidates;
    if (providedCatalogCandidates.length === 0) {
      const catalogResult = await fetchPayShCatalog(input.intent);
      catalogProviders = catalogResult.providers;
      catalogMode = toCatalogMode(catalogResult.mode);
    }
    const radarSignals = await fetchRadarSignals(catalogProviders.map((provider) => provider.id));
    routingResult = routeProvider({
      providers: catalogProviders,
      radarSignals: radarSignals.signals,
      minTrustScore: input.constraints?.minTrustScore ?? DEFAULT_MIN_TRUST_SCORE,
      requestedCategory: input.category,
      intent: input.intent,
    });
  }

  const selectedProviderId =
    input.execution?.providerId ??
    routingResult.selectedProvider?.id ??
    preflightResult.decision?.selectedProvider ??
    null;
  const radarBlockedRoute = preflightResult.decision?.decision === "route_blocked";
  const approved = !radarBlockedRoute && Boolean(routingResult.selectedProvider);
  const decision = buildDecision(
    approved,
    selectedProviderId,
    routingSource,
    preflightResult.decision?.blockReason ?? (approved ? undefined : "No approved provider route."),
  );

  let executionResult: LivePayShExecutionResult | undefined;
  if (!decision.approved) {
    executionResult = undefined;
  } else if (!selectedProviderId) {
    executionResult = undefined;
  } else if (input.executionMode === "preflight_only" || input.execution?.enabled === false) {
    executionResult = makeSkippedExecutionResult(
      selectedProviderId,
      input.intent,
      input.execution?.endpointUrl,
      Date.now(),
      "execution_disabled_by_input",
    );
  } else {
    try {
      executionResult = await executeLivePayShCall({
        providerId: selectedProviderId,
        intent: input.intent,
        endpointUrl: input.execution?.endpointUrl,
        method: input.execution?.method,
        body: input.execution?.body,
        bodyJson: input.execution?.bodyJson,
        headers: input.execution?.headers,
      });
    } catch (error) {
      executionResult = makeSkippedExecutionResult(
        selectedProviderId,
        input.intent,
        input.execution?.endpointUrl,
        Date.now(),
        error instanceof Error ? error.message : "execution_exception",
      );
    }
  }

  const completedTimestamp = new Date().toISOString();
  const elapsedMs = Date.now() - startedAtMs;
  const proofConfig = getProofConfig(input);
  const proofPath = proofConfig.enabled
    ? await saveProofLog(
        proofConfig.kind,
        buildProofLog({
          timestamp: completedTimestamp,
          intent: input.intent,
          routingResult,
          preflightResult,
          executionResult,
          elapsedMs,
          catalogMode,
        }),
      )
    : undefined;
  const skippedExecutionReason =
    selectedProviderId === null && decision.approved
      ? "missing_selected_provider"
      : getSkippedExecutionReason(decision, executionResult);

  return {
    success: executionResult?.success ?? false,
    decision,
    routingResult,
    preflightResult,
    executionResult,
    proofPath,
    skippedExecutionReason,
    metadata: {
      radarMode: preflightResult.mode,
      catalogMode,
      routingSource,
      executionMode: executionResult?.mode,
      livePayShExecutionConfigured: isLivePayShExecutionConfigured(),
      radarEndpoint: preflightResult.endpoint,
    },
    timestamp: completedTimestamp,
  };
}
