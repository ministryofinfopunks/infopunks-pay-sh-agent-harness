import { CandidateProvider, ExecutionMode, ExecutionResult } from "./types";

function hashToUnitInterval(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function simulateProviderCall(provider: CandidateProvider, intent: string): ExecutionResult {
  const seed = `${provider.id}:${intent}`;
  const noise = hashToUnitInterval(seed);
  const successScore =
    provider.trustScore * 0.7 +
    provider.signalScore * 0.2 -
    provider.latencyMs * 0.03 -
    (provider.degradationActive ? 25 : 0) +
    (noise - 0.5) * 10;
  const success = successScore >= 55;

  const latencyJitter = Math.round((noise - 0.5) * 24);
  const latencyMs = Math.max(30, Math.round(provider.latencyMs + latencyJitter));

  const costBase = 0.0038 + (100 - provider.trustScore) * 0.00002 + provider.latencyMs * 0.0000025;
  const costUsd = round(Math.max(0.0015, costBase + (noise - 0.5) * 0.0015), 6);

  const qualityBase =
    provider.trustScore * 0.5 +
    provider.signalScore * 0.5 -
    (provider.degradationActive ? 18 : 0) -
    provider.latencyMs * 0.04;
  const qualityScore = round(Math.max(0, Math.min(100, qualityBase + (noise - 0.5) * 8)), 2);

  return {
    success,
    latencyMs,
    costUsd,
    qualityScore,
    errorReason: success ? undefined : "simulatedProviderFailure",
    mode: "simulated",
  };
}

export async function executeProviderCall(
  provider: CandidateProvider | null,
  intent: string,
  mode: ExecutionMode,
): Promise<ExecutionResult> {
  if (!provider) {
    return {
      success: false,
      latencyMs: 0,
      costUsd: 0,
      qualityScore: 0,
      errorReason: "noProviderSelected",
      mode,
    };
  }

  if (mode === "live") {
    throw new Error("Live execution mode is not implemented. Use simulated mode for benchmark scaffolding.");
  }

  return simulateProviderCall(provider, intent);
}
