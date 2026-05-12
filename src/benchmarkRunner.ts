import { executeProviderCall } from "./executor";
import { fetchPayShCatalog } from "./payShClient";
import { saveProofLog } from "./proofLog";
import {
  callRadarPreflight,
  fetchRadarSignals,
  getRadarTimeoutMs,
  RadarPreflightResult,
} from "./radarClient";
import { buildBenchmarkSummary, writeBenchmarkReport } from "./benchmarkReport";
import { routeProvider } from "./router";
import {
  BenchmarkSummary,
  BenchmarkTrial,
  CandidateProvider,
  ExecutionMode,
  ProviderCatalogEntry,
  RejectedProvider,
  RoutingResult,
} from "./types";

const DEFAULT_BENCHMARK_TRIALS = 30;
const DEFAULT_INTENTS = [
  "send payroll payout to a verified provider",
  "issue contractor payment with low failure risk",
  "route supplier settlement for same-day completion",
  "send merchant disbursement with latency sensitivity",
  "execute partner transfer with strong trust requirements",
];

function getMinTrustScore(): number {
  const raw = Number(process.env.MIN_TRUST_SCORE);
  return Number.isFinite(raw) ? raw : 70;
}

export function selectNaiveProvider(catalog: ProviderCatalogEntry[]): ProviderCatalogEntry | null {
  if (catalog.length === 0) {
    return null;
  }
  const sorted = [...catalog].sort((a, b) => a.catalogPriority - b.catalogPriority);
  return sorted[0] ?? null;
}

function toCandidateProvider(
  provider: ProviderCatalogEntry | null,
  candidateById: Map<string, CandidateProvider>,
): CandidateProvider | null {
  if (!provider) {
    return null;
  }
  return (
    candidateById.get(provider.id) ?? {
      id: provider.id,
      name: provider.name,
      region: provider.region,
      trustScore: 0,
      degradationActive: true,
      signalScore: 0,
      latencyMs: 999,
    }
  );
}

function parseTrialCount(rawArg?: string): number {
  const fromEnv = Number(process.env.BENCHMARK_TRIALS);
  const parsedArg = rawArg ? Number(rawArg) : NaN;
  const selected = Number.isFinite(parsedArg) && parsedArg > 0 ? parsedArg : fromEnv;
  return Number.isFinite(selected) && selected > 0 ? Math.floor(selected) : DEFAULT_BENCHMARK_TRIALS;
}

function pickIntent(trialNumber: number, providedIntent?: string): string {
  if (providedIntent && providedIntent.trim()) {
    return providedIntent.trim();
  }
  return DEFAULT_INTENTS[(trialNumber - 1) % DEFAULT_INTENTS.length];
}

function pickWinner(naive: BenchmarkTrial["naive"], radar: BenchmarkTrial["radar"]): "naive" | "radar" | "tie" {
  if (naive.success !== radar.success) {
    return radar.success ? "radar" : "naive";
  }
  if (radar.qualityScore !== naive.qualityScore) {
    return radar.qualityScore > naive.qualityScore ? "radar" : "naive";
  }
  if (radar.costUsd !== naive.costUsd) {
    return radar.costUsd < naive.costUsd ? "radar" : "naive";
  }
  if (radar.latencyMs !== naive.latencyMs) {
    return radar.latencyMs < naive.latencyMs ? "radar" : "naive";
  }
  return "tie";
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

export interface BenchmarkRunResult {
  trialCount: number;
  trials: BenchmarkTrial[];
  summary: BenchmarkSummary;
  reportPaths: {
    jsonPath: string;
    csvPath: string;
    summaryPath: string;
  };
}

export async function runBenchmark(options?: {
  trialsArg?: string;
  intent?: string;
  mode?: ExecutionMode;
}): Promise<BenchmarkRunResult> {
  const trialCount = parseTrialCount(options?.trialsArg);
  const mode = options?.mode ?? "simulated";
  const trials: BenchmarkTrial[] = [];

  for (let trialNumber = 1; trialNumber <= trialCount; trialNumber += 1) {
    const intent = pickIntent(trialNumber, options?.intent);
    const catalogResult = await fetchPayShCatalog(intent);
    const naiveProvider = selectNaiveProvider(catalogResult.providers);

    const preflightResult = await callRadarPreflight({
      intent,
      constraints: { minTrustScore: getMinTrustScore() },
      candidateProviders: catalogResult.providers.map((provider) => provider.id),
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

    const candidateById = new Map(routed.candidateProviders.map((candidate) => [candidate.id, candidate]));
    const naiveCandidate = toCandidateProvider(naiveProvider, candidateById);
    const radarCandidate = routed.selectedProvider;

    const naiveExecution = await executeProviderCall(naiveCandidate, intent, mode);
    const radarExecution = await executeProviderCall(radarCandidate, intent, mode);

    const winner = pickWinner(naiveExecution, radarExecution);
    const trial: BenchmarkTrial = {
      trialNumber,
      intent,
      naiveProviderId: naiveCandidate?.id ?? null,
      radarProviderId: radarCandidate?.id ?? null,
      naive: naiveExecution,
      radar: radarExecution,
      winner,
      radarAvoidedFailure: !naiveExecution.success && radarExecution.success,
    };
    trials.push(trial);

    const radarMode = preflightRouting
      ? "live"
      : radarResult.mode === "mock"
        ? "mock"
        : radarResult.mode === "live"
          ? "live"
          : "fallback";

    console.log(
      `[benchmark][trial ${trialNumber}] radar mode=${radarMode} endpoint=${
        preflightResult.endpoint ?? radarResult.endpoint ?? "n/a"
      } timeout=${getRadarTimeoutMs()}ms`,
    );
    console.log(
      `[benchmark][trial ${trialNumber}] radar decision=${preflightResult.decision?.decision ?? "local-router"} selected=${radarCandidate?.id ?? "none"}`,
    );
    console.log(
      `[benchmark][trial ${trialNumber}] rejected=${
        routed.rejectedProviders.length > 0
          ? routed.rejectedProviders.map((provider) => provider.providerId).join(",")
          : "none"
      }`,
    );

    const fallbackReason = !preflightRouting && preflightResult.mode === "fallback"
      ? preflightResult.fallbackReason
      : radarResult.mode === "fallback-mock"
        ? radarResult.warning
        : undefined;

    await saveProofLog("benchmark-trial", {
      timestamp: new Date().toISOString(),
      userIntent: intent,
      candidateProviders: routed.candidateProviders,
      selectedProvider: radarCandidate,
      rejectedProviders: routed.rejectedProviders,
      radarSignalsUsed: routed.radarSignalsUsed,
      routingPolicy: routed.routingPolicy,
      simulatedOrLiveResult: mode,
      latencyMs: Math.max(naiveExecution.latencyMs, radarExecution.latencyMs),
      success: radarExecution.success,
      radarApiUsed: Boolean(preflightRouting),
      radarEndpoint: preflightResult.endpoint ?? radarResult.endpoint,
      radarDecision: preflightResult.decision?.decision,
      radarDataMode: preflightResult.decision?.dataMode,
      radarSource: preflightResult.decision?.source,
      fallbackReason,
      comparison: {
        naiveSelection: naiveProvider,
        naiveSelectionPolicyStatus: naiveProvider && routed.rejectedProviders.some((r) => r.providerId === naiveProvider.id)
          ? "fails"
          : naiveProvider
            ? "passes"
            : "unknown",
        radarSelectedProviderId: radarCandidate?.id ?? null,
        radarImprovedRoute: trial.radarAvoidedFailure || trial.winner === "radar",
        explanation:
          trial.radarAvoidedFailure
            ? "Radar-assisted path succeeded where naive path failed."
            : trial.winner === "radar"
              ? "Radar-assisted path produced stronger simulated execution outcomes."
              : trial.winner === "naive"
                ? "Naive path outperformed Radar-assisted path in this simulated trial."
                : "Both paths were equivalent in this simulated trial.",
      },
    });
  }

  const summary = buildBenchmarkSummary(trials);
  const reportPaths = await writeBenchmarkReport(trials, summary);
  return { trialCount, trials, summary, reportPaths };
}
