import "dotenv/config";
import { fetchPayShCatalog } from "./payShClient";
import {
  callRadarPreflight,
  fetchRadarSignals,
  getRadarTimeoutMs,
  RadarPreflightResult,
} from "./radarClient";
import { saveProofLog } from "./proofLog";
import { routeProvider } from "./router";
import {
  CandidateProvider,
  CandidateProviderSource,
  CatalogMode,
  ComparisonValidity,
  ProofLog,
  ProviderCatalogEntry,
  RadarMode,
  RejectedProvider,
  RoutingResult,
} from "./types";

function getMinTrustScore(): number {
  const raw = Number(process.env.MIN_TRUST_SCORE);
  return Number.isFinite(raw) ? raw : 70;
}

function getIntentFromArgs(): string {
  const input = process.argv.slice(2).join(" ").trim();
  return input || "select provider for a payout request";
}

function selectNaiveProvider(catalog: ProviderCatalogEntry[]): ProviderCatalogEntry | null {
  if (catalog.length === 0) {
    return null;
  }

  const sorted = [...catalog].sort((a, b) => a.catalogPriority - b.catalogPriority);
  return sorted[0] ?? null;
}

function toFallbackModeLabel(mode: "live" | "mock" | "fallback"): "live" | "mock" | "fallback" {
  return mode;
}

function toCatalogModeLabel(mode: "live" | "mock" | "fallback-mock"): CatalogMode {
  return mode === "fallback-mock" ? "fallback" : mode;
}

function shouldOmitCandidatesForPreflight(): boolean {
  return Boolean(process.env.RADAR_API_BASE_URL?.trim());
}

function getExecutionStatusLabel(): "skipped" | "simulated" | "live_pay_sh" {
  if (process.env.LIVE_PAYSH_EXECUTION?.trim() === "true") {
    return process.env.PAYSH_EXECUTION_URL?.trim() ? "live_pay_sh" : "skipped";
  }
  return "simulated";
}

function buildRoutingFromPreflight(
  providers: ProviderCatalogEntry[],
  preflight: RadarPreflightResult,
): RoutingResult | null {
  if (!preflight.available || !preflight.decision) {
    return null;
  }

  const candidateProviders: CandidateProvider[] = providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    region: provider.region,
    trustScore: 0,
    degradationActive: false,
    signalScore: 0,
    latencyMs: 0,
  }));

  const providerById = new Map(candidateProviders.map((provider) => [provider.id, provider]));
  const selectedProvider = preflight.decision.selectedProvider
    ? (providerById.get(preflight.decision.selectedProvider) ?? null)
    : null;

  const rejectedProviders: RejectedProvider[] = preflight.decision.rejectedProviders.map((providerId) => {
    const provider = providerById.get(providerId);
    return {
      providerId,
      providerName: provider?.name ?? providerId,
      reasons: ["backendRejected"],
    };
  });

  return {
    selectedProvider,
    candidateProviders,
    rejectedProviders,
    radarSignalsUsed: [],
    routingPolicy: preflight.decision.routingPolicy,
  };
}

async function main(): Promise<void> {
  const userIntent = getIntentFromArgs();
  const startedAt = Date.now();

  const catalogResult = await fetchPayShCatalog(userIntent);
  const naiveSelection = selectNaiveProvider(catalogResult.providers);
  const catalogMode = toCatalogModeLabel(catalogResult.mode);
  const omitCandidates = shouldOmitCandidatesForPreflight();
  const candidateProviderSource: CandidateProviderSource = omitCandidates
    ? "omitted"
    : catalogMode === "live"
      ? "live"
      : "mock";

  const preflightResult = await callRadarPreflight({
    intent: userIntent,
    constraints: { minTrustScore: getMinTrustScore() },
    candidateProviders: omitCandidates ? undefined : catalogResult.providers.map((provider) => provider.id),
  });

  const preflightRouting = buildRoutingFromPreflight(catalogResult.providers, preflightResult);

  const radarResult = preflightRouting
    ? { signals: [], mode: "live" as const, endpoint: preflightResult.endpoint }
    : await fetchRadarSignals(catalogResult.providers.map((provider) => provider.id));

  const routed =
    preflightRouting ??
    routeProvider({
      providers: catalogResult.providers,
      radarSignals: radarResult.signals,
      minTrustScore: getMinTrustScore(),
    });

  const naiveStatus = naiveSelection
    ? routed.rejectedProviders.some((item) => item.providerId === naiveSelection.id)
      ? "fails"
      : "passes"
    : "unknown";

  const radarSelectedId = routed.selectedProvider?.id ?? null;
  const radarImprovedRoute =
    naiveSelection !== null && radarSelectedId !== null
      ? naiveStatus === "fails" || naiveSelection.id !== radarSelectedId
      : naiveStatus === "fails";
  const naiveRejection = naiveSelection
    ? routed.rejectedProviders.find((item) => item.providerId === naiveSelection.id)
    : undefined;

  let explanation: string;
  if (!naiveSelection) {
    explanation = "Catalog returned no providers, so no naive route was available.";
  } else if (!radarSelectedId) {
    explanation = "Radar policy rejected all providers, so no safe route was selected.";
  } else if (naiveSelection.id === radarSelectedId) {
    explanation = "Radar agreed with the naive top-catalog provider after policy checks.";
  } else if (naiveStatus === "fails") {
    explanation =
      "Radar changed the route because the naive provider failed trust/degradation policy checks.";
  } else {
    explanation = "Radar selected a different provider with better score/latency ranking.";
  }

  const elapsedMs = Date.now() - startedAt;
  const simulatedOrLiveResult =
    catalogResult.mode === "live" && (preflightRouting || radarResult.mode === "live")
      ? "live"
      : "simulated-or-fallback";

  const radarMode: RadarMode = preflightRouting
    ? toFallbackModeLabel(preflightResult.mode)
    : radarResult.mode === "live"
      ? "live"
      : radarResult.mode === "mock"
        ? "mock"
        : "fallback";
  const comparisonValidity: ComparisonValidity =
    radarMode === "live" && catalogMode !== "live"
      ? "live_preflight_only"
      : (catalogMode === "live") === (radarMode === "live")
        ? "valid_simulated_same_catalog"
        : "invalid_mixed_catalogs";
  const fallbackReason = !preflightRouting && preflightResult.mode === "fallback"
    ? preflightResult.fallbackReason
    : radarResult.mode === "fallback-mock"
      ? radarResult.warning
      : undefined;

  const proof: ProofLog = {
    timestamp: new Date().toISOString(),
    userIntent,
    candidateProviders: routed.candidateProviders,
    selectedProvider: routed.selectedProvider,
    rejectedProviders: routed.rejectedProviders,
    radarSignalsUsed: routed.radarSignalsUsed,
    routingPolicy: routed.routingPolicy,
    simulatedOrLiveResult,
    latencyMs: elapsedMs,
    success: routed.selectedProvider !== null,
    comparisonValidity,
    catalogMode,
    radarMode,
    candidateProviderSource,
    radarApiUsed: Boolean(preflightRouting),
    radarEndpoint: preflightResult.endpoint ?? radarResult.endpoint,
    radarDecision: preflightResult.decision?.decision,
    radarDataMode: preflightResult.decision?.dataMode,
    radarSource: preflightResult.decision?.source,
    fallbackReason,
    comparison: {
      naiveSelection,
      naiveSelectionPolicyStatus: naiveStatus,
      radarSelectedProviderId: radarSelectedId,
      radarImprovedRoute,
      explanation,
    },
  };

  const outputPath = await saveProofLog("demo-compare", proof);

  console.log("\n=== Naive vs Radar-Assisted Comparison ===");
  console.log(`Intent: ${userIntent}`);
  console.log(`Catalog mode: ${catalogMode}`);
  console.log(`Preflight mode: ${radarMode}`);
  console.log(`Execution mode: ${getExecutionStatusLabel()}`);
  console.log(`Comparison validity: ${comparisonValidity}`);
  console.log(`Candidate provider source: ${candidateProviderSource}`);
  console.log(`Radar endpoint: ${preflightResult.endpoint ?? radarResult.endpoint ?? "n/a"}`);
  console.log(`Radar timeout: ${getRadarTimeoutMs()}ms`);
  if (fallbackReason) {
    console.log(`Radar fallback reason: ${fallbackReason}`);
  }
  console.log(`Radar decision: ${preflightResult.decision?.decision ?? "local-router"}`);
  console.log(
    `Pre-flight verdict: ${
      naiveStatus === "fails"
        ? "blocked/redirected spend before provider call"
        : "naive choice passed policy checks"
    }`,
  );
  console.log(
    `Naive catalog selection: ${
      naiveSelection ? `${naiveSelection.name} (${naiveSelection.id})` : "none"
    }`,
  );
  console.log(`Naive policy status: ${naiveStatus}`);
  if (naiveRejection) {
    console.log(`Naive rejection reasons: ${naiveRejection.reasons.join(", ")}`);
  }
  console.log(
    `Selected provider: ${
      routed.selectedProvider
        ? `${routed.selectedProvider.name} (${routed.selectedProvider.id})`
        : "none"
    }`,
  );
  console.log(
    `Rejected providers: ${
      routed.rejectedProviders.length > 0
        ? routed.rejectedProviders.map((provider) => provider.providerId).join(", ")
        : "none"
    }`,
  );
  console.log(
    `Data mode: catalog=${catalogResult.mode}, radar=${preflightResult.decision?.dataMode ?? radarMode}, result=${simulatedOrLiveResult}`,
  );
  if (catalogMode === "mock" && radarMode === "live") {
    console.log(
      "Live Radar preflight succeeded, but outcome comparison is not valid because naive path uses mock catalog and Radar uses live catalog.",
    );
  } else {
    console.log(`Did Radar improve route? ${radarImprovedRoute ? "yes" : "no"}`);
    console.log(`Reason: ${explanation}`);
  }
  console.log(`Proof log saved: ${outputPath}`);
  console.log(`Comparison latency: ${elapsedMs}ms\n`);
}

main().catch((error) => {
  console.error("demo:compare failed", error);
  process.exitCode = 1;
});
