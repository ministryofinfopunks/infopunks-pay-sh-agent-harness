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
