import { executeProviderCall } from "./executor";
import { fetchPayShCatalog } from "./payShClient";
import { saveProofLog } from "./proofLog";
import { fetchRadarSignals } from "./radarClient";
import { buildBenchmarkSummary, writeBenchmarkReport } from "./benchmarkReport";
import { routeProvider } from "./router";
import { BenchmarkSummary, BenchmarkTrial, CandidateProvider, ExecutionMode, ProviderCatalogEntry } from "./types";

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

    const radarResult = await fetchRadarSignals(catalogResult.providers.map((provider) => provider.id));
    const routed = routeProvider({
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
