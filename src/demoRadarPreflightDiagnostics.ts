import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { MULTI_CATEGORY_PROFILES } from "./demoMultiCategoryBenchmark";
import { providerEndpointMap } from "./providerEndpointMap";
import { callRadarPreflight, RadarPreflightInput, RadarPreflightResult } from "./radarClient";

const RESULTS_DIR = path.resolve(process.cwd(), "benchmark-results", "radar-preflight-diagnostics");
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_TRIALS = 10;

type Outcome =
  | "expected_provider_success"
  | "wrong_provider"
  | "no_candidates"
  | "route_blocked"
  | "radar_preflight_unavailable";

type DiagnosticProfileName =
  | "solana_trending_pools"
  | "solana_rpc_health"
  | "research_answer"
  | "places_search"
  | "image_labels"
  | "messaging_status";

interface DiagnosticProfile {
  profile: DiagnosticProfileName;
  intent: string;
  category: string;
  expectedProvider: string;
  expectedOutputShape?: string;
  includeByDefault: boolean;
}

const BASE_PROFILES: DiagnosticProfile[] = MULTI_CATEGORY_PROFILES.map((profile) => ({
  profile: profile.profile,
  intent: profile.intent,
  category: profile.category,
  expectedProvider: profile.expectedProvider,
  expectedOutputShape: profile.expectedOutputShape,
  includeByDefault: profile.includeByDefault,
}));

const MESSAGING_PROFILE: DiagnosticProfile = {
  profile: "messaging_status",
  intent: "check SMS delivery status",
  category: "messaging",
  expectedProvider: "paysponge-textbelt",
  expectedOutputShape: "sms_status",
  includeByDefault: false,
};

export interface RadarPreflightTrialRow {
  trialId: number;
  profile: DiagnosticProfileName;
  intent: string;
  category: string;
  expectedProvider: string;
  expectedProviderNormalized: string;
  selectedProvider: string | null;
  selectedProviderNormalized: string;
  providerMatched: boolean;
  decision: string;
  latencyMs: number;
  errorReason: string | null;
  radarSource: string;
  timestamp: string;
}

interface PerProfileSummary {
  profile: DiagnosticProfileName;
  totalTrials: number;
  successRate: number;
  timeoutRate: number;
  noCandidatesCount: number;
  expectedProviderMatchCount: number;
}

interface DiagnosticsSummary {
  totalTrials: number;
  successCount: number;
  timeoutCount: number;
  noCandidatesCount: number;
  routeBlockedCount: number;
  wrongProviderCount: number;
  expectedProviderMatchCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  perProfile: PerProfileSummary[];
}

function getArgValue(argv: string[], key: string): string | undefined {
  const hit = argv.find((entry) => entry.startsWith(`--${key}=`));
  return hit ? hit.slice(key.length + 3).trim() : undefined;
}

function toCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function normalizeProviderId(id: string | null | undefined): string {
  return (id ?? "")
    .toLowerCase()
    .trim()
    .replace(/\//g, "-")
    .replace(/-+/g, "-");
}

function classifyProviderMatch(expectedProvider: string, selectedProvider: string | null): boolean {
  if (!selectedProvider) {
    return false;
  }
  return normalizeProviderId(expectedProvider) === normalizeProviderId(selectedProvider);
}

export function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  const clamped = Math.min(Math.max(index, 0), sorted.length - 1);
  return sorted[clamped];
}

function getCandidateProviders(profile: DiagnosticProfile): string[] {
  return providerEndpointMap
    .filter(
      (mapping) =>
        mapping.status === "verified_pay_cli_success" &&
        mapping.category === profile.category &&
        (!profile.expectedOutputShape || mapping.outputShape === profile.expectedOutputShape),
    )
    .map((mapping) => mapping.providerId);
}

export function classifyTrialOutcome(
  preflight: RadarPreflightResult,
  expectedProvider: string,
): {
  outcome: Outcome;
  decision: string;
  errorReason: string | null;
  selectedProvider: string | null;
  expectedProviderNormalized: string;
  selectedProviderNormalized: string;
  radarSource: string;
} {
  const expectedProviderNormalized = normalizeProviderId(expectedProvider);

  if (!preflight.available) {
    return {
      outcome: "radar_preflight_unavailable",
      decision: "preflight_unavailable",
      errorReason: "radar_preflight_unavailable",
      selectedProvider: null,
      expectedProviderNormalized,
      selectedProviderNormalized: "",
      radarSource: preflight.mode,
    };
  }

  const decision = preflight.decision?.decision ?? "route_blocked";
  const selectedProvider = preflight.decision?.selectedProvider ?? null;
  const selectedProviderNormalized = normalizeProviderId(selectedProvider);
  const blockReason = (preflight.decision?.blockReason ?? "").trim().toLowerCase();
  const radarSource = preflight.decision?.source ?? preflight.mode;

  if (!selectedProvider && (blockReason === "no_candidates" || preflight.decision?.candidateCount === 0)) {
    return {
      outcome: "no_candidates",
      decision,
      errorReason: "no_candidates",
      selectedProvider: null,
      expectedProviderNormalized,
      selectedProviderNormalized: "",
      radarSource,
    };
  }

  if (!selectedProvider || decision === "route_blocked") {
    return {
      outcome: "route_blocked",
      decision,
      errorReason: "route_blocked",
      selectedProvider,
      expectedProviderNormalized,
      selectedProviderNormalized,
      radarSource,
    };
  }

  if (!classifyProviderMatch(expectedProvider, selectedProvider)) {
    return {
      outcome: "wrong_provider",
      decision,
      errorReason: "wrong_provider",
      selectedProvider,
      expectedProviderNormalized,
      selectedProviderNormalized,
      radarSource,
    };
  }

  return {
    outcome: "expected_provider_success",
    decision,
    errorReason: null,
    selectedProvider,
    expectedProviderNormalized,
    selectedProviderNormalized,
    radarSource,
  };
}

export function getSelectedDiagnosticProfiles(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
): DiagnosticProfile[] {
  const requestedProfile = getArgValue(argv, "profile");
  const includeImageLabels = argv.includes("--include-image-labels") || env.BENCHMARK_INCLUDE_IMAGE_LABELS === "true";
  const includeMessaging = argv.includes("--include-messaging") || env.BENCHMARK_INCLUDE_MESSAGING === "true";

  const profiles = [
    ...BASE_PROFILES.filter((profile) => profile.includeByDefault || (profile.profile === "image_labels" && includeImageLabels)),
    ...(includeMessaging ? [MESSAGING_PROFILE] : []),
  ];

  if (!requestedProfile) {
    return profiles;
  }

  const selected = profiles.find((profile) => profile.profile === requestedProfile);
  return selected ? [selected] : profiles;
}

function getTrials(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): number {
  const fromArg = Number(getArgValue(argv, "trials"));
  const fromEnv = Number(env.RADAR_PREFLIGHT_DIAGNOSTIC_TRIALS);
  const resolved = Number.isFinite(fromArg) && fromArg > 0 ? fromArg : Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TRIALS;
  return Math.floor(resolved);
}

function ensureEnv(): void {
  if (!process.env.RADAR_API_BASE_URL?.trim()) {
    throw new Error("RADAR_API_BASE_URL is required for diagnose:radar-preflight");
  }
  if (!process.env.RADAR_API_TIMEOUT_MS?.trim()) {
    process.env.RADAR_API_TIMEOUT_MS = String(DEFAULT_TIMEOUT_MS);
  }
}

function buildSummary(rows: RadarPreflightTrialRow[]): DiagnosticsSummary {
  const latencies = rows.map((row) => row.latencyMs).filter((value) => Number.isFinite(value) && value >= 0);
  const successCount = rows.filter((row) => row.errorReason === null).length;
  const timeoutCount = rows.filter((row) => row.errorReason === "radar_preflight_unavailable").length;
  const noCandidatesCount = rows.filter((row) => row.errorReason === "no_candidates").length;
  const routeBlockedCount = rows.filter((row) => row.errorReason === "route_blocked").length;
  const wrongProviderCount = rows.filter((row) => row.errorReason === "wrong_provider").length;
  const expectedProviderMatchCount = rows.filter((row) => row.providerMatched).length;

  const perProfile = Array.from(new Set(rows.map((row) => row.profile))).map((profile) => {
    const profileRows = rows.filter((row) => row.profile === profile);
    const profileTrials = profileRows.length;
    const profileSuccess = profileRows.filter((row) => row.errorReason === null).length;
    const profileTimeout = profileRows.filter((row) => row.errorReason === "radar_preflight_unavailable").length;
    const profileNoCandidates = profileRows.filter((row) => row.errorReason === "no_candidates").length;
    const profileExpectedMatch = profileRows.filter((row) => row.providerMatched).length;

    return {
      profile,
      totalTrials: profileTrials,
      successRate: round(profileTrials === 0 ? 0 : profileSuccess / profileTrials, 4),
      timeoutRate: round(profileTrials === 0 ? 0 : profileTimeout / profileTrials, 4),
      noCandidatesCount: profileNoCandidates,
      expectedProviderMatchCount: profileExpectedMatch,
    };
  });

  return {
    totalTrials: rows.length,
    successCount,
    timeoutCount,
    noCandidatesCount,
    routeBlockedCount,
    wrongProviderCount,
    expectedProviderMatchCount,
    avgLatencyMs: round(average(latencies), 2),
    p95LatencyMs: round(percentile(latencies, 95), 2),
    perProfile,
  };
}

function summaryToMarkdown(summary: DiagnosticsSummary): string {
  const lines = [
    "# Radar Preflight Diagnostics Summary",
    "",
    `- totalTrials: ${summary.totalTrials}`,
    `- successCount: ${summary.successCount}`,
    `- timeoutCount: ${summary.timeoutCount}`,
    `- noCandidatesCount: ${summary.noCandidatesCount}`,
    `- routeBlockedCount: ${summary.routeBlockedCount}`,
    `- wrongProviderCount: ${summary.wrongProviderCount}`,
    `- expectedProviderMatchCount: ${summary.expectedProviderMatchCount}`,
    `- avgLatencyMs: ${summary.avgLatencyMs}`,
    `- p95LatencyMs: ${summary.p95LatencyMs}`,
    "",
    "## Per Profile",
    "",
  ];

  for (const profile of summary.perProfile) {
    lines.push(`- ${profile.profile}: successRate=${profile.successRate}, timeoutRate=${profile.timeoutRate}, noCandidatesCount=${profile.noCandidatesCount}, expectedProviderMatchCount=${profile.expectedProviderMatchCount}`);
  }

  lines.push("");
  return lines.join("\n");
}

export async function runRadarPreflightDiagnostics(): Promise<{
  summary: DiagnosticsSummary;
  rows: RadarPreflightTrialRow[];
  reportPaths: { jsonPath: string; csvPath: string; summaryPath: string };
}> {
  ensureEnv();
  const profiles = getSelectedDiagnosticProfiles();
  const trialsPerProfile = getTrials();
  const rows: RadarPreflightTrialRow[] = [];

  let trialId = 1;
  for (const profile of profiles) {
    for (let run = 1; run <= trialsPerProfile; run += 1) {
      const startedAt = Date.now();
      const timestamp = new Date(startedAt).toISOString();
      const preflightInput: RadarPreflightInput = {
        intent: profile.intent,
        category: profile.category,
        candidateProviders: getCandidateProviders(profile),
      };

      const preflight = await callRadarPreflight(preflightInput);
      const classification = classifyTrialOutcome(preflight, profile.expectedProvider);
      const latencyMs = Date.now() - startedAt;
      const providerMatched = classification.expectedProviderNormalized === classification.selectedProviderNormalized;

      rows.push({
        trialId,
        profile: profile.profile,
        intent: profile.intent,
        category: profile.category,
        expectedProvider: profile.expectedProvider,
        expectedProviderNormalized: classification.expectedProviderNormalized,
        selectedProvider: classification.selectedProvider,
        selectedProviderNormalized: classification.selectedProviderNormalized,
        providerMatched,
        decision: classification.decision,
        latencyMs,
        errorReason: classification.errorReason,
        radarSource: classification.radarSource,
        timestamp,
      });

      console.log(
        `[trial ${trialId}] profile=${profile.profile} decision=${classification.decision} selected=${classification.selectedProvider ?? "none"} error=${classification.errorReason ?? "none"}`,
      );
      trialId += 1;
    }
  }

  const summary = buildSummary(rows);

  await mkdir(RESULTS_DIR, { recursive: true });
  const jsonPath = path.join(RESULTS_DIR, "latest.json");
  const csvPath = path.join(RESULTS_DIR, "latest.csv");
  const summaryPath = path.join(RESULTS_DIR, "summary.md");

  const header = [
    "trialId",
    "profile",
    "intent",
    "category",
    "expectedProvider",
    "expectedProviderNormalized",
    "selectedProvider",
    "selectedProviderNormalized",
    "providerMatched",
    "decision",
    "latencyMs",
    "errorReason",
    "radarSource",
    "timestamp",
  ].join(",");

  const csvRows = rows.map((row) =>
    [
      row.trialId,
      row.profile,
      row.intent,
      row.category,
      row.expectedProvider,
      row.expectedProviderNormalized,
      row.selectedProvider ?? "",
      row.selectedProviderNormalized,
      row.providerMatched,
      row.decision,
      row.latencyMs,
      row.errorReason ?? "",
      row.radarSource,
      row.timestamp,
    ]
      .map((value) => toCsvCell(value))
      .join(","),
  );

  await writeFile(jsonPath, `${JSON.stringify({ summary, rows }, null, 2)}\n`, "utf8");
  await writeFile(csvPath, `${header}\n${csvRows.join("\n")}\n`, "utf8");
  await writeFile(summaryPath, summaryToMarkdown(summary), "utf8");

  return {
    summary,
    rows,
    reportPaths: { jsonPath, csvPath, summaryPath },
  };
}

if (require.main === module) {
  runRadarPreflightDiagnostics()
    .then(({ summary, reportPaths }) => {
      console.log("\n=== Radar Preflight Diagnostics ===");
      console.log(`totalTrials: ${summary.totalTrials}`);
      console.log(`successCount: ${summary.successCount}`);
      console.log(`timeoutCount: ${summary.timeoutCount}`);
      console.log(`noCandidatesCount: ${summary.noCandidatesCount}`);
      console.log(`routeBlockedCount: ${summary.routeBlockedCount}`);
      console.log(`wrongProviderCount: ${summary.wrongProviderCount}`);
      console.log(`expectedProviderMatchCount: ${summary.expectedProviderMatchCount}`);
      console.log(`avgLatencyMs: ${summary.avgLatencyMs}`);
      console.log(`p95LatencyMs: ${summary.p95LatencyMs}`);
      console.log("artifact paths:");
      console.log(`- ${reportPaths.jsonPath}`);
      console.log(`- ${reportPaths.csvPath}`);
      console.log(`- ${reportPaths.summaryPath}`);
    })
    .catch((error) => {
      console.error("diagnose:radar-preflight failed", error);
      process.exitCode = 1;
    });
}
