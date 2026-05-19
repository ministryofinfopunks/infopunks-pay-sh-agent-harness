import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveDataWebSearchResultsEvidenceHealth,
  normalizeDataWebSearchResults,
  type CaveatObject,
  type DataWebSearchResultsNormalizedOutput,
  type EvidenceHealth,
} from "./benchmarks/dataWebSearchResultsNormalization";
import { getRouteConfigs, sanitizeProofMarkdown } from "./verifyWebSearchPaid";

const BENCHMARK_ID = "data-web-search-results" as const;
const CATEGORY = "web-search" as const;
const INTENT = "search the web for the same query and return normalized search results" as const;
const REQUIRED_RUNS = 5;
const CANONICAL_INPUT = { query: "x402 agent payments", limit: 5 } as const;
const PAID_PROOF_PATH = "live-proofs/data-web-search-results-paid-routes-2026-05-19.md";
const OUTPUT_BASENAME = "data-web-search-results-benchmark-runs";

interface RouteExecutionConfig {
  route_name: "StableEnrich Exa Search" | "Perplexity Search";
  provider_id: string;
  endpoint: string;
  method: "POST";
  body: Record<string, unknown>;
  proof_reference: string;
}

export interface RouteRunRecord {
  run_number: number;
  generated_at: string;
  route_name: RouteExecutionConfig["route_name"];
  provider_id: string;
  endpoint: string;
  method: "POST";
  request_body: Record<string, unknown>;
  execution_transport: "pay_cli" | "http" | "skipped";
  paid_execution_succeeded: boolean;
  cli_exit_code: number | null;
  status_code: number | null;
  status_evidence: string;
  latency_ms: number | null;
  normalized_output: DataWebSearchResultsNormalizedOutput;
  caveat_objects: CaveatObject[];
  evidence_health: EvidenceHealth;
  proof_reference: string;
}

export interface RouteAggregate {
  route_name: RouteExecutionConfig["route_name"];
  provider_id: string;
  endpoint: string;
  attempted_runs: number;
  successful_runs: number;
  success_rate: number;
  search_success_rate: number;
  result_detection_rate: number;
  title_detection_rate: number;
  url_detection_rate: number;
  snippet_detection_rate: number;
  source_detection_rate: number;
  published_at_detection_rate: number;
  median_result_count: number;
  median_latency_ms: number | null;
  p95_latency_ms: number | null;
  caveat_objects: Array<{ code: string; occurrences: number; highest_severity: "info" | "warning" | "error" }>;
  evidence_health: EvidenceHealth;
}

export interface WebSearchBenchmarkArtifact {
  benchmark_id: typeof BENCHMARK_ID;
  category: typeof CATEGORY;
  intent: typeof INTENT;
  generated_at: string;
  canonical_input: typeof CANONICAL_INPUT;
  canonical_input_hash: string;
  route_summaries: Array<{ route_name: string; provider_id: string; endpoint: string; method: string }>;
  aggregate_metrics: RouteAggregate[];
  run_level_summaries: RouteRunRecord[];
  structured_caveats: Array<{ route_name: string; caveat_objects: RouteAggregate["caveat_objects"] }>;
  winner_status: "no_clear_winner";
  winner_claimed: false;
}

type LiveExecutor = (input: ExecuteLivePayShCallInput) => ReturnType<typeof executeLivePayShCall>;

export function hashCanonicalInput(input: { query: string; limit: number }): string {
  return createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
}

function calculateRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

export function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  const left = sorted[middle - 1] ?? 0;
  const right = sorted[middle] ?? 0;
  return (left + right) / 2;
}

export function calculateP95(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length);
  const index = Math.max(0, Math.min(sorted.length - 1, rank - 1));
  return sorted[index] ?? null;
}

function deriveStatusEvidence(statusCode: number | null, exitCode: number | null, errorReason?: string): string {
  if (statusCode !== null) {
    return `status_code_observed_${statusCode}`;
  }
  if (exitCode !== null) {
    return errorReason ? `pay_cli_exit_${exitCode}_${errorReason}` : `pay_cli_exit_${exitCode}_status_unavailable`;
  }
  return errorReason ? `status_unavailable_${errorReason}` : "status_unavailable";
}

function severityRank(severity: "info" | "warning" | "error"): number {
  if (severity === "error") {
    return 3;
  }
  if (severity === "warning") {
    return 2;
  }
  return 1;
}

function normalizeMetricCounts(routeRuns: RouteRunRecord[]): {
  titleDetection: number;
  urlDetection: number;
  snippetDetection: number;
  sourceDetection: number;
  publishedAtDetection: number;
  resultDetection: number;
  searchSuccess: number;
} {
  let titleDetection = 0;
  let urlDetection = 0;
  let snippetDetection = 0;
  let sourceDetection = 0;
  let publishedAtDetection = 0;
  let resultDetection = 0;
  let searchSuccess = 0;

  for (const run of routeRuns) {
    const results = run.normalized_output.results;
    if (results.length > 0) {
      resultDetection += 1;
    }
    if (run.normalized_output.search_success) {
      searchSuccess += 1;
    }
    if (results.some((entry) => Boolean(entry.title))) {
      titleDetection += 1;
    }
    if (results.some((entry) => Boolean(entry.url))) {
      urlDetection += 1;
    }
    if (results.some((entry) => Boolean(entry.snippet))) {
      snippetDetection += 1;
    }
    if (results.some((entry) => Boolean(entry.source))) {
      sourceDetection += 1;
    }
    if (results.some((entry) => Boolean(entry.published_at))) {
      publishedAtDetection += 1;
    }
  }

  return {
    titleDetection,
    urlDetection,
    snippetDetection,
    sourceDetection,
    publishedAtDetection,
    resultDetection,
    searchSuccess,
  };
}

export function aggregateRouteMetrics(routeRuns: RouteRunRecord[]): RouteAggregate {
  if (routeRuns.length === 0) {
    throw new Error("route_runs_empty");
  }

  const route = routeRuns[0];
  const attemptedRuns = routeRuns.length;
  const successfulRuns = routeRuns.filter((run) => run.paid_execution_succeeded).length;
  const latencies = routeRuns
    .map((run) => run.latency_ms)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const resultCounts = routeRuns.map((run) => run.normalized_output.results.length);

  const caveatMap = new Map<string, { occurrences: number; highest_severity: "info" | "warning" | "error" }>();
  for (const run of routeRuns) {
    for (const caveat of run.caveat_objects) {
      const existing = caveatMap.get(caveat.code);
      if (!existing) {
        caveatMap.set(caveat.code, { occurrences: 1, highest_severity: caveat.severity });
        continue;
      }
      existing.occurrences += 1;
      if (severityRank(caveat.severity) > severityRank(existing.highest_severity)) {
        existing.highest_severity = caveat.severity;
      }
    }
  }

  const detectionCounts = normalizeMetricCounts(routeRuns);
  const evidenceHealth = deriveDataWebSearchResultsEvidenceHealth({
    paidAttempts: attemptedRuns,
    paidSuccesses: successfulRuns,
    paidFailures: attemptedRuns - successfulRuns,
    successfulResultCounts: routeRuns
      .filter((run) => run.paid_execution_succeeded)
      .map((run) => run.normalized_output.results.length),
    latest: {
      normalized: routeRuns[routeRuns.length - 1].normalized_output,
      caveat_objects: routeRuns[routeRuns.length - 1].caveat_objects,
    },
  });

  return {
    route_name: route.route_name,
    provider_id: route.provider_id,
    endpoint: route.endpoint,
    attempted_runs: attemptedRuns,
    successful_runs: successfulRuns,
    success_rate: calculateRate(successfulRuns, attemptedRuns),
    search_success_rate: calculateRate(detectionCounts.searchSuccess, attemptedRuns),
    result_detection_rate: calculateRate(detectionCounts.resultDetection, attemptedRuns),
    title_detection_rate: calculateRate(detectionCounts.titleDetection, attemptedRuns),
    url_detection_rate: calculateRate(detectionCounts.urlDetection, attemptedRuns),
    snippet_detection_rate: calculateRate(detectionCounts.snippetDetection, attemptedRuns),
    source_detection_rate: calculateRate(detectionCounts.sourceDetection, attemptedRuns),
    published_at_detection_rate: calculateRate(detectionCounts.publishedAtDetection, attemptedRuns),
    median_result_count: calculateMedian(resultCounts),
    median_latency_ms: latencies.length > 0 ? calculateMedian(latencies) : null,
    p95_latency_ms: calculateP95(latencies),
    caveat_objects: Array.from(caveatMap.entries())
      .map(([code, value]) => ({ code, occurrences: value.occurrences, highest_severity: value.highest_severity }))
      .sort((a, b) => b.occurrences - a.occurrences || a.code.localeCompare(b.code)),
    evidence_health: evidenceHealth,
  };
}

export function assertBothRoutesPresent(runLevel: RouteRunRecord[]): void {
  const routeNames = new Set(runLevel.map((entry) => entry.route_name));
  if (!routeNames.has("StableEnrich Exa Search") || !routeNames.has("Perplexity Search")) {
    throw new Error("both_routes_required_before_benchmark_runs");
  }
}

interface PaidProofCheckResult {
  ok: boolean;
  reasons: string[];
}

export async function validatePaidProofRoutes(pathRelative = PAID_PROOF_PATH): Promise<PaidProofCheckResult> {
  const paidProofPath = path.resolve(process.cwd(), pathRelative);
  let text = "";
  try {
    text = await readFile(paidProofPath, "utf8");
  } catch {
    return { ok: false, reasons: ["paid_proof_missing"] };
  }

  const requiredRoutes: Array<{ section: string; endpoint: string }> = [
    { section: "StableEnrich Exa Search", endpoint: "https://stableenrich.dev/api/exa/search" },
    { section: "Perplexity Search", endpoint: "https://pplx.x402.paysponge.com/search" },
  ];
  const knownHeaders = requiredRoutes.map((entry) => `## ${entry.section}`);

  const reasons: string[] = [];
  for (const required of requiredRoutes) {
    const header = `## ${required.section}`;
    const start = text.indexOf(header);
    if (start < 0) {
      reasons.push(`${required.section}:section_missing`);
      continue;
    }
    const candidateEnds = knownHeaders
      .map((h) => text.indexOf(`\n${h}`, start + header.length))
      .filter((index) => index >= 0);
    const nextHeader = candidateEnds.length > 0 ? Math.min(...candidateEnds) : -1;
    const section = text.slice(start, nextHeader >= 0 ? nextHeader : undefined);

    if (!section.includes(`- endpoint: ${required.endpoint}`)) {
      reasons.push(`${required.section}:endpoint_mismatch`);
    }
    if (!section.includes("- paid_execution_status: succeeded")) {
      reasons.push(`${required.section}:paid_execution_not_succeeded`);
    }
    if (!section.includes("- route_state: verified/proven")) {
      reasons.push(`${required.section}:route_not_verified_proven`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export async function validateProceedGuards(): Promise<void> {
  if (process.env.LIVE_PAYSH_EXECUTION !== "true") {
    throw new Error("LIVE_PAYSH_EXECUTION_not_true");
  }
  if (process.env.PAYSH_EXECUTION_MODE !== "pay_cli") {
    throw new Error("PAYSH_EXECUTION_MODE_not_pay_cli");
  }

  const paidProofCheck = await validatePaidProofRoutes();
  if (!paidProofCheck.ok) {
    throw new Error(`paid_proof_route_validation_failed:${paidProofCheck.reasons.join(",")}`);
  }

  const normalizerPath = path.resolve(process.cwd(), "src/benchmarks/dataWebSearchResultsNormalization.ts");
  const normalizerTestPath = path.resolve(process.cwd(), "src/benchmarks/dataWebSearchResultsNormalization.test.ts");
  await readFile(normalizerPath, "utf8");
  await readFile(normalizerTestPath, "utf8");
}

function buildRoutes(): RouteExecutionConfig[] {
  const configs = getRouteConfigs();
  return [
    {
      route_name: "StableEnrich Exa Search",
      provider_id: configs.exa.providerId,
      endpoint: configs.exa.endpoint,
      method: "POST",
      body: configs.exa.buildBody(CANONICAL_INPUT),
      proof_reference: PAID_PROOF_PATH,
    },
    {
      route_name: "Perplexity Search",
      provider_id: configs.perplexity.providerId,
      endpoint: configs.perplexity.endpoint,
      method: "POST",
      body: configs.perplexity.buildBody(CANONICAL_INPUT),
      proof_reference: PAID_PROOF_PATH,
    },
  ];
}

export async function runWebSearchLiveBenchmark(executor: LiveExecutor = executeLivePayShCall): Promise<WebSearchBenchmarkArtifact> {
  await validateProceedGuards();

  const routes = buildRoutes();
  if (routes.length !== 2) {
    throw new Error("both_routes_required_before_benchmark_runs");
  }

  const runLevel: RouteRunRecord[] = [];

  for (let runNumber = 1; runNumber <= REQUIRED_RUNS; runNumber += 1) {
    for (const route of routes) {
      const execution = await executor({
        providerId: route.provider_id,
        intent: BENCHMARK_ID,
        endpointUrl: route.endpoint,
        method: route.method,
        bodyJson: route.body,
        headers: {
          Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        },
      });

      const statusEvidence = deriveStatusEvidence(execution.statusCode ?? null, execution.exitCode ?? null, execution.errorReason);
      const normalizedResult = normalizeDataWebSearchResults({
        parsedJson: execution.parsedJsonAvailable ? execution.parsedJson ?? {} : execution.responsePreview,
        responsePreview: execution.responsePreview,
        statusCode: execution.statusCode ?? null,
        statusEvidence,
        paidExecutionObserved: execution.success,
        canonicalInput: CANONICAL_INPUT,
      });

      const normalizedOutput: DataWebSearchResultsNormalizedOutput = {
        ...normalizedResult.normalized,
        evidence_health: deriveDataWebSearchResultsEvidenceHealth({
          paidAttempts: 1,
          paidSuccesses: execution.success ? 1 : 0,
          paidFailures: execution.success ? 0 : 1,
          successfulResultCounts: execution.success ? [normalizedResult.normalized.results.length] : [],
          latest: normalizedResult,
        }),
        caveat_objects: normalizedResult.caveat_objects,
      };

      runLevel.push({
        run_number: runNumber,
        generated_at: new Date().toISOString(),
        route_name: route.route_name,
        provider_id: route.provider_id,
        endpoint: route.endpoint,
        method: route.method,
        request_body: route.body,
        execution_transport: execution.mode === "live_pay_sh_cli" ? "pay_cli" : execution.mode === "live_pay_sh" ? "http" : "skipped",
        paid_execution_succeeded: execution.success,
        cli_exit_code: execution.exitCode ?? null,
        status_code: execution.statusCode ?? null,
        status_evidence: statusEvidence,
        latency_ms: typeof execution.latencyMs === "number" ? execution.latencyMs : null,
        normalized_output: normalizedOutput,
        caveat_objects: normalizedResult.caveat_objects,
        evidence_health: normalizedOutput.evidence_health,
        proof_reference: route.proof_reference,
      });
    }
  }

  assertBothRoutesPresent(runLevel);

  const grouped = new Map<RouteExecutionConfig["route_name"], RouteRunRecord[]>();
  for (const route of runLevel) {
    const existing = grouped.get(route.route_name) ?? [];
    existing.push(route);
    grouped.set(route.route_name, existing);
  }

  if (grouped.size !== 2) {
    throw new Error("both_routes_required_before_benchmark_runs");
  }

  const aggregateMetrics = Array.from(grouped.values()).map((runs) => aggregateRouteMetrics(runs));

  const artifact: WebSearchBenchmarkArtifact = {
    benchmark_id: BENCHMARK_ID,
    category: CATEGORY,
    intent: INTENT,
    generated_at: new Date().toISOString(),
    canonical_input: CANONICAL_INPUT,
    canonical_input_hash: hashCanonicalInput(CANONICAL_INPUT),
    route_summaries: routes.map((route) => ({
      route_name: route.route_name,
      provider_id: route.provider_id,
      endpoint: route.endpoint,
      method: route.method,
    })),
    aggregate_metrics: aggregateMetrics,
    run_level_summaries: runLevel,
    structured_caveats: aggregateMetrics.map((metric) => ({ route_name: metric.route_name, caveat_objects: metric.caveat_objects })),
    winner_status: "no_clear_winner",
    winner_claimed: false,
  };

  return artifact;
}

export function renderBenchmarkMarkdown(artifact: WebSearchBenchmarkArtifact): string {
  const lines: string[] = [
    "# Data Web Search Results Benchmark Artifact",
    "",
    `- benchmark_id: ${artifact.benchmark_id}`,
    `- category: ${artifact.category}`,
    `- intent: ${artifact.intent}`,
    `- generated_at: ${artifact.generated_at}`,
    `- canonical_input: ${JSON.stringify(artifact.canonical_input)}`,
    `- canonical_input_hash: ${artifact.canonical_input_hash}`,
    `- winner_status: ${artifact.winner_status}`,
    `- winner_claimed: ${artifact.winner_claimed}`,
    "",
    "## Route Summaries",
    "",
  ];

  for (const route of artifact.route_summaries) {
    lines.push(`- route_name: ${route.route_name}`);
    lines.push(`  provider_id: ${route.provider_id}`);
    lines.push(`  endpoint: ${route.endpoint}`);
    lines.push(`  method: ${route.method}`);
  }

  lines.push(
    "",
    "## Aggregate Metrics",
    "",
    "| route_name | provider_id | attempted_runs | successful_runs | success_rate | search_success_rate | result_detection_rate | title_detection_rate | url_detection_rate | snippet_detection_rate | source_detection_rate | published_at_detection_rate | median_result_count | median_latency_ms | p95_latency_ms | evidence_health |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  );

  for (const metric of artifact.aggregate_metrics) {
    lines.push(
      `| ${metric.route_name} | ${metric.provider_id} | ${metric.attempted_runs} | ${metric.successful_runs} | ${metric.success_rate} | ${metric.search_success_rate} | ${metric.result_detection_rate} | ${metric.title_detection_rate} | ${metric.url_detection_rate} | ${metric.snippet_detection_rate} | ${metric.source_detection_rate} | ${metric.published_at_detection_rate} | ${metric.median_result_count} | ${metric.median_latency_ms ?? ""} | ${metric.p95_latency_ms ?? ""} | ${metric.evidence_health} |`,
    );
  }

  lines.push(
    "",
    "## Run-Level Summaries",
    "",
    "| run_number | route_name | paid_execution_succeeded | execution_transport | cli_exit_code | status_code | status_evidence | latency_ms | result_count | search_success | evidence_health |",
    "|---:|---|---:|---|---:|---:|---|---:|---:|---:|---|",
  );

  for (const run of artifact.run_level_summaries) {
    lines.push(
      `| ${run.run_number} | ${run.route_name} | ${run.paid_execution_succeeded} | ${run.execution_transport} | ${run.cli_exit_code ?? ""} | ${run.status_code ?? ""} | ${run.status_evidence} | ${run.latency_ms ?? ""} | ${run.normalized_output.result_count ?? ""} | ${run.normalized_output.search_success} | ${run.evidence_health} |`,
    );
  }

  lines.push("", "## Structured Caveats", "");

  for (const route of artifact.structured_caveats) {
    lines.push(`### ${route.route_name}`);
    if (route.caveat_objects.length === 0) {
      lines.push("- none");
      continue;
    }
    for (const caveat of route.caveat_objects) {
      lines.push(`- code: ${caveat.code}; occurrences: ${caveat.occurrences}; highest_severity: ${caveat.highest_severity}`);
    }
  }

  lines.push(
    "",
    "No winner is claimed.",
    "No route superiority is inferred.",
    "",
  );

  return sanitizeProofMarkdown(lines.join("\n"));
}

async function run(): Promise<void> {
  const artifact = await runWebSearchLiveBenchmark();
  const datePart = new Date(artifact.generated_at).toISOString().slice(0, 10);
  const outputPath = path.resolve(process.cwd(), "live-proofs", `${OUTPUT_BASENAME}-${datePart}.md`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${renderBenchmarkMarkdown(artifact)}\n`, "utf8");
  console.log(`Wrote benchmark markdown: ${outputPath}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error("benchmark:web-search-live failed", error);
    process.exitCode = 1;
  });
}
