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

export interface ProofLog {
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
