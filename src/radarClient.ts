import { DataMode, RadarSignal } from "./types";

const DEFAULT_TIMEOUT_MS = 2500;

const MOCK_SIGNALS: RadarSignal[] = [
  {
    providerId: "paysh-alpha",
    trustScore: 92,
    degradationActive: false,
    signalScore: 88,
    latencyMs: 140,
    mockData: true,
  },
  {
    providerId: "paysh-beta",
    trustScore: 62,
    degradationActive: false,
    signalScore: 91,
    latencyMs: 110,
    mockData: true,
  },
  {
    providerId: "paysh-gamma",
    trustScore: 90,
    degradationActive: true,
    signalScore: 95,
    latencyMs: 90,
    mockData: true,
  },
  {
    providerId: "paysh-delta",
    trustScore: 85,
    degradationActive: false,
    signalScore: 88,
    latencyMs: 105,
    mockData: true,
  },
];

export interface RadarPreflightConstraints {
  minTrustScore?: number;
  maxLatencyMs?: number;
  maxCostUsd?: number;
}

export interface RadarPreflightInput {
  intent: string;
  category?: string;
  constraints?: RadarPreflightConstraints;
  candidateProviders?: string[];
}

export interface RadarPreflightDecision {
  decision: string;
  selectedProvider: string | null;
  rejectedProviders: string[];
  candidateCount: number;
  routingPolicy: string[];
  generatedAt?: string;
  dataMode?: string;
  source?: string;
}

export interface RadarPreflightResult {
  available: boolean;
  mode: "live" | "mock" | "fallback";
  endpoint?: string;
  fallbackReason?: string;
  decision?: RadarPreflightDecision;
}

export interface RadarClientResult {
  signals: RadarSignal[];
  mode: DataMode;
  endpoint?: string;
  warning?: string;
}

function getTimeoutMs(): number {
  const raw = Number(process.env.REQUEST_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function getMockSignalsFor(providerIds: string[]): RadarSignal[] {
  const byId = new Map(MOCK_SIGNALS.map((signal) => [signal.providerId, signal]));
  return providerIds.map((providerId) => {
    const fromFixture = byId.get(providerId);
    if (fromFixture) {
      return fromFixture;
    }

    return {
      providerId,
      trustScore: 50,
      degradationActive: true,
      signalScore: 0,
      latencyMs: 999,
      mockData: true,
    };
  });
}

function normalizeSignals(input: unknown): RadarSignal[] {
  const rawSignals = Array.isArray(input)
    ? input
    : typeof input === "object" && input !== null && "signals" in input
      ? (input as { signals: unknown }).signals
      : null;

  if (!Array.isArray(rawSignals)) {
    throw new Error("Radar response did not include a signals array.");
  }

  return rawSignals.map((item) => {
    const signal = item as Partial<RadarSignal>;

    if (typeof signal.providerId !== "string") {
      throw new Error("Radar signal missing providerId.");
    }

    return {
      providerId: signal.providerId,
      trustScore: Number(signal.trustScore ?? 0),
      degradationActive: Boolean(signal.degradationActive),
      signalScore: Number(signal.signalScore ?? 0),
      latencyMs: Number(signal.latencyMs ?? 999),
      mockData: false,
    };
  });
}

function normalizePreflightDecision(payload: unknown): RadarPreflightDecision {
  const obj = (payload ?? {}) as Record<string, unknown>;

  if (typeof obj.decision !== "string") {
    throw new Error("Radar preflight response missing decision.");
  }

  const selectedProvider = typeof obj.selectedProvider === "string" ? obj.selectedProvider : null;

  const rejectedProviders = Array.isArray(obj.rejectedProviders)
    ? obj.rejectedProviders.map((item) => String(item))
    : [];

  const routingPolicy = Array.isArray(obj.routingPolicy)
    ? obj.routingPolicy.map((item) => String(item))
    : typeof obj.routingPolicy === "string"
      ? [obj.routingPolicy]
      : [];

  return {
    decision: obj.decision,
    selectedProvider,
    rejectedProviders,
    candidateCount:
      typeof obj.candidateCount === "number" && Number.isFinite(obj.candidateCount)
        ? obj.candidateCount
        : rejectedProviders.length + (selectedProvider ? 1 : 0),
    routingPolicy,
    generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : undefined,
    dataMode: typeof obj.dataMode === "string" ? obj.dataMode : undefined,
    source: typeof obj.source === "string" ? obj.source : undefined,
  };
}

export async function callRadarPreflight(input: RadarPreflightInput): Promise<RadarPreflightResult> {
  const baseUrl = process.env.RADAR_API_BASE_URL?.trim();
  if (!baseUrl) {
    return {
      available: false,
      mode: "mock",
      fallbackReason: "RADAR_API_BASE_URL not set.",
    };
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/v1/preflight`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(getTimeoutMs()),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Radar preflight failed with HTTP ${response.status}.`);
    }

    const payload = await response.json();
    return {
      available: true,
      mode: "live",
      endpoint,
      decision: normalizePreflightDecision(payload),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      available: false,
      mode: "fallback",
      endpoint,
      fallbackReason: `Radar preflight unavailable (${message}).`,
    };
  }
}

export async function fetchRadarSignals(providerIds: string[]): Promise<RadarClientResult> {
  const baseUrl = process.env.RADAR_API_BASE_URL?.trim();
  const query = new URLSearchParams({ providerIds: providerIds.join(",") });

  if (!baseUrl) {
    return {
      signals: getMockSignalsFor(providerIds),
      mode: "mock",
      warning: "RADAR_API_BASE_URL not set. Using mock Radar signals.",
    };
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/signals?${query.toString()}`;

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(getTimeoutMs()),
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Radar request failed with HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const normalized = normalizeSignals(payload);
    return { signals: normalized, mode: "live", endpoint };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      signals: getMockSignalsFor(providerIds),
      mode: "fallback-mock",
      endpoint,
      warning: `Radar unavailable (${message}). Falling back to mock signals.`,
    };
  }
}
