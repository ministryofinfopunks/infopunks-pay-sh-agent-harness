export type DataMode = "live" | "mock" | "fallback-mock";
export type CatalogMode = "mock" | "live" | "fallback";
export type RadarMode = "live" | "mock" | "fallback";
export type ComparisonValidity =
  | "valid_simulated_same_catalog"
  | "invalid_mixed_catalogs"
  | "live_preflight_only";
export type CandidateProviderSource = "mock" | "live" | "omitted";

export interface ProviderCatalogEntry {
  id: string;
  name: string;
  region: string;
  catalogPriority: number;
  category?: string;
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
  category?: string;
  trustScore: number;
  degradationActive: boolean;
  signalScore: number;
  latencyMs: number;
  costUsd?: number;
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
  decision?: "route_selected" | "route_blocked";
  categoryMatch?: boolean;
  fallbackCategoryUsed?: boolean;
  selectedProviderDetails?: {
    providerId: string;
    name: string;
    category: string | null;
    trustScore: number;
    signalScore: number;
    latencyMs: number;
    costUsd: number | null;
    degradationFlag: boolean;
  } | null;
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
  executionMode?: BenchmarkExecutionMode;
  settlementReference?: string;
  executionLatencyMs?: number;
  latencyMs: number;
  success: boolean;
  comparisonValidity?: ComparisonValidity;
  catalogMode?: CatalogMode;
  radarMode?: RadarMode;
  candidateProviderSource?: CandidateProviderSource;
  comparison?: {
    naiveSelection: ProviderCatalogEntry | null;
    naiveSelectionPolicyStatus: "passes" | "fails" | "unknown";
    radarSelectedProviderId: string | null;
    radarImprovedRoute: boolean;
    explanation: string;
  };
}

export type RequestedExecutionMode = "simulated" | "live";
export type ExecutionMode = "simulated" | "live_pay_sh" | "live_pay_sh_cli" | "skipped";
export type ProviderExecutionMode = ExecutionMode;
export type BenchmarkExecutionMode = ExecutionMode | "mixed";

export interface LivePayShExecutionResult {
  providerId: string;
  intent: string;
  endpointUrl?: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  success: boolean;
  statusCode?: number;
  exitCode?: number;
  costUsd: number | null;
  settlementReference: string | null;
  responsePreview: string;
  stderrPreview?: string;
  parsedJsonAvailable: boolean;
  errorReason?: string;
  paymentRequired?: boolean;
  paymentRequiredHeaderPresent?: boolean;
  wwwAuthenticateHeaderPresent?: boolean;
  paymentChallenge?: {
    x402Version?: number;
    resourceUrl?: string;
    resourceMethod?: string;
    resourceDescription?: string;
    acceptsCount?: number;
    networks?: string[];
    assets?: string[];
    payTo?: string[];
    amounts?: string[];
    bazaarExtensionPresent?: boolean;
  };
  mode: "live_pay_sh" | "live_pay_sh_cli" | "skipped";
}

export interface ExecutionResult {
  success: boolean;
  latencyMs: number;
  costUsd: number;
  qualityScore: number;
  errorReason?: string;
  mode: ProviderExecutionMode;
  statusCode?: number;
  endpointUrl?: string;
  settlementReference?: string;
}

export interface BenchmarkTrial {
  trialNumber: number;
  intent: string;
  naiveProviderId: string | null;
  radarProviderId: string | null;
  naive: ExecutionResult;
  radar: ExecutionResult;
  executionMode: BenchmarkExecutionMode;
  winner: "naive" | "radar" | "tie";
  radarAvoidedFailure: boolean;
  comparisonValidity?: ComparisonValidity;
  catalogMode?: CatalogMode;
  radarMode?: RadarMode;
  candidateProviderSource?: CandidateProviderSource;
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
  executionMode?: BenchmarkExecutionMode;
  liveExecutionSkippedCount: number;
  liveExecutionConfigured: boolean;
  comparisonValidity?: ComparisonValidity;
}
