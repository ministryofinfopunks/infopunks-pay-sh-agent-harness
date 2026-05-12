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
  requestedCategory?: string;
  intent?: string;
  allowCategoryFallback?: boolean;
}

function buildCandidate(provider: ProviderCatalogEntry, radarSignal?: RadarSignal): CandidateProvider {
  return {
    id: provider.id,
    name: provider.name,
    region: provider.region,
    category: provider.category,
    trustScore: radarSignal?.trustScore ?? 0,
    degradationActive: radarSignal?.degradationActive ?? true,
    signalScore: radarSignal?.signalScore ?? 0,
    latencyMs: radarSignal?.latencyMs ?? 999,
    costUsd: undefined,
  };
}

function normalizeCategory(value: string): string {
  return value.toLowerCase().trim().replace(/[\s-]+/g, "_");
}

function getCategoryAliases(requestedCategory: string): Set<string> {
  const base = normalizeCategory(requestedCategory);
  const aliasesByCategory: Record<string, string[]> = {
    payments: ["payment", "finance", "fintech", "crypto", "settlement"],
    data: ["data", "analytics", "enrichment"],
    ai: ["ai_ml", "ai", "llm", "inference"],
    image: ["image", "media", "generation"],
    speech: ["speech", "voice", "audio"],
  };

  return new Set([base, ...(aliasesByCategory[base] ?? [])].map((alias) => normalizeCategory(alias)));
}

export function routeProvider(input: RouteInput): RoutingResult {
  const { providers, radarSignals, minTrustScore, requestedCategory } = input;
  const signalByProviderId = new Map(radarSignals.map((signal) => [signal.providerId, signal]));

  const candidates = providers.map((provider) => buildCandidate(provider, signalByProviderId.get(provider.id)));
  const categoryAliases = requestedCategory ? getCategoryAliases(requestedCategory) : null;
  const normalizedRequestedCategory = requestedCategory ? normalizeCategory(requestedCategory) : null;
  const categoryMatchedCandidateIds = new Set(
    categoryAliases
      ? candidates
          .filter((candidate) => {
            if (!candidate.category) {
              return false;
            }
            return categoryAliases.has(normalizeCategory(candidate.category));
          })
          .map((candidate) => candidate.id)
      : candidates.map((candidate) => candidate.id),
  );
  const hasCategoryMatch = categoryMatchedCandidateIds.size > 0;

  const rejectedProviders: RejectedProvider[] = [];
  const eligible: CandidateProvider[] = [];

  for (const candidate of candidates) {
    const reasons: string[] = [];
    const normalizedProviderCategory = candidate.category ? normalizeCategory(candidate.category) : "unknown";

    if (categoryAliases && !categoryMatchedCandidateIds.has(candidate.id)) {
      reasons.push(`category_mismatch:${normalizedProviderCategory}!=${normalizedRequestedCategory}`);
    }

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
    decision: selectedProvider ? "route_selected" : "route_blocked",
    categoryMatch: categoryAliases ? hasCategoryMatch : true,
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
    routingPolicy: [
      ...(categoryAliases
        ? [
            `enforce category match for "${normalizedRequestedCategory}" aliases (${[
              ...categoryAliases,
            ].join(",")})`,
          ]
        : []),
      `reject trustScore < ${minTrustScore}`,
      "reject degradationFlagActive",
      "prefer higher signalScore",
      "tie-break by lower latencyMs",
    ],
  };
}
