import {
  CandidateProvider,
  ProviderCatalogEntry,
  RadarSignal,
  RejectedProvider,
  RoutingResult,
} from "./types";

export interface RouteInput {
  providers: ProviderCatalogEntry[];
  radarSignals: RadarSignal[];
  minTrustScore: number;
}

function buildCandidate(provider: ProviderCatalogEntry, radarSignal?: RadarSignal): CandidateProvider {
  return {
    id: provider.id,
    name: provider.name,
    region: provider.region,
    trustScore: radarSignal?.trustScore ?? 0,
    degradationActive: radarSignal?.degradationActive ?? true,
    signalScore: radarSignal?.signalScore ?? 0,
    latencyMs: radarSignal?.latencyMs ?? 999,
  };
}

export function routeProvider(input: RouteInput): RoutingResult {
  const { providers, radarSignals, minTrustScore } = input;
  const signalByProviderId = new Map(radarSignals.map((signal) => [signal.providerId, signal]));

  const candidates = providers.map((provider) => buildCandidate(provider, signalByProviderId.get(provider.id)));

  const rejectedProviders: RejectedProvider[] = [];
  const eligible: CandidateProvider[] = [];

  for (const candidate of candidates) {
    const reasons: string[] = [];

    if (!signalByProviderId.has(candidate.id)) {
      reasons.push("missingRadarSignal");
    }
    if (candidate.trustScore < minTrustScore) {
      reasons.push(`trustScoreBelowMin(${candidate.trustScore}<${minTrustScore})`);
    }
    if (candidate.degradationActive) {
      reasons.push("degradationFlagActive");
    }

    if (reasons.length > 0) {
      rejectedProviders.push({
        providerId: candidate.id,
        providerName: candidate.name,
        reasons,
      });
    } else {
      eligible.push(candidate);
    }
  }

  eligible.sort((a, b) => {
    if (b.signalScore !== a.signalScore) {
      return b.signalScore - a.signalScore;
    }
    if (a.latencyMs !== b.latencyMs) {
      return a.latencyMs - b.latencyMs;
    }
    return a.id.localeCompare(b.id);
  });

  const selectedProvider = eligible.length > 0 ? eligible[0] : null;

  if (selectedProvider) {
    for (const candidate of eligible.slice(1)) {
      const scoreReason =
        candidate.signalScore < selectedProvider.signalScore
          ? `lowerSignalScore(${candidate.signalScore}<${selectedProvider.signalScore})`
          : `higherLatencyOnTie(${candidate.latencyMs}>${selectedProvider.latencyMs})`;

      rejectedProviders.push({
        providerId: candidate.id,
        providerName: candidate.name,
        reasons: ["notTopRanked", scoreReason],
      });
    }
  }

  return {
    selectedProvider,
    candidateProviders: candidates,
    rejectedProviders,
    radarSignalsUsed: radarSignals,
    routingPolicy: [
      `reject trustScore < ${minTrustScore}`,
      "reject degradationFlagActive",
      "prefer higher signalScore",
      "tie-break by lower latencyMs",
    ],
  };
}
