export type DataMode = "live" | "mock" | "fallback-mock";

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  region: string;
  catalogPriority: number;
  mockData?: boolean;
}

export interface RadarSignal {
  providerId: string;
  trustScore: number;
  degradationActive: boolean;
  signalScore: number;
  latencyMs: number;
  mockData?: boolean;
}

export interface CandidateProvider {
  id: string;
  name: string;
  region: string;
  trustScore: number;
  degradationActive: boolean;
  signalScore: number;
  latencyMs: number;
}

export interface RejectedProvider {
  providerId: string;
  providerName: string;
  reasons: string[];
}

export interface RoutingResult {
  selectedProvider: CandidateProvider | null;
  candidateProviders: CandidateProvider[];
  rejectedProviders: RejectedProvider[];
  radarSignalsUsed: RadarSignal[];
  routingPolicy: string[];
}

export interface RadarProofFields {
  radarApiUsed: boolean;
  radarEndpoint?: string;
  radarDecision?: string;
  radarDataMode?: string;
  radarSource?: string;
  fallbackReason?: string;
}

export interface ProofLog extends RadarProofFields {
  timestamp: string;
  userIntent: string;
  candidateProviders: CandidateProvider[];
  selectedProvider: CandidateProvider | null;
  rejectedProviders: RejectedProvider[];
  radarSignalsUsed: RadarSignal[];
  routingPolicy: string[];
  simulatedOrLiveResult: string;
  latencyMs: number;
  success: boolean;
  comparison?: {
    naiveSelection: ProviderCatalogEntry | null;
    naiveSelectionPolicyStatus: "passes" | "fails" | "unknown";
    radarSelectedProviderId: string | null;
    radarImprovedRoute: boolean;
    explanation: string;
  };
}

export type ExecutionMode = "simulated" | "live";

export interface ExecutionResult {
  success: boolean;
  latencyMs: number;
  costUsd: number;
  qualityScore: number;
  errorReason?: string;
  mode: ExecutionMode;
}

export interface BenchmarkTrial {
  trialNumber: number;
  intent: string;
  naiveProviderId: string | null;
  radarProviderId: string | null;
  naive: ExecutionResult;
  radar: ExecutionResult;
  winner: "naive" | "radar" | "tie";
  radarAvoidedFailure: boolean;
}

export interface BenchmarkSummary {
  totalTrials: number;
  naiveSuccessRate: number;
  radarSuccessRate: number;
  naiveAvgLatencyMs: number;
  radarAvgLatencyMs: number;
  naiveAvgCostUsd: number;
  radarAvgCostUsd: number;
  naiveAvgQualityScore: number;
  radarAvgQualityScore: number;
  radarAvoidedFailureCount: number;
  radarWinCount: number;
  naiveWinCount: number;
  tieCount: number;
}
