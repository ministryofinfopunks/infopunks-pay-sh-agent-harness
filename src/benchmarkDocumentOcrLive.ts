import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveDocumentOcrEvidenceHealth,
  normalizeDocumentOcrTextExtraction,
  type CaveatObject,
  type DocumentOcrTextExtractionNormalizedOutput,
  type EvidenceHealth,
} from "./benchmarks/documentOcrTextExtractionNormalization";

const execFileAsync = promisify(execFile);

export const BENCHMARK_ID = "document-ocr-text-extraction" as const;
export const CATEGORY = "document-ai" as const;
export const CANONICAL_INPUT = {
  document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
  expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "OCR BENCHMARK 001"],
};

const PAID_PROOF_PATH = "live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md";
const OUT_PATH = "live-proofs/document-ocr-text-extraction-benchmark-runs-2026-05-19.md";
const RUNS = 5;

export interface RouteConfig {
  route_id: "paysponge-reducto-parse" | "google-vision-images-annotate";
  provider: "PaySponge Reducto" | "Google Vision";
  provider_id: string;
  endpoint: string;
  method: "POST";
  buildBody: () => Record<string, unknown>;
  proof_reference: string;
}

export interface RouteRunResult {
  run_number: number;
  provider: string;
  provider_id: string;
  route_id: string;
  endpoint: string;
  method: string;
  paid_execution_status: "succeeded" | "failed";
  cli_exit_code: number | null;
  latency_ms: number | null;
  status_evidence: string;
  normalized_output: DocumentOcrTextExtractionNormalizedOutput;
  caveat_objects: CaveatObject[];
  evidence_health: EvidenceHealth;
  proof_reference: string;
}

export interface RouteAggregate {
  route_id: string;
  provider: string;
  provider_id: string;
  attempted_runs: number;
  successful_runs: number;
  success_rate: number;
  ocr_success_rate: number;
  expected_fragment_match_rate_avg: number;
  expected_fragment_match_rate_median: number;
  full_match_rate: number;
  text_detection_rate: number;
  character_count_median: number | null;
  confidence_detection_rate: number;
  page_count_detection_rate: number;
  median_latency_ms: number | null;
  p95_latency_ms: number | null;
  caveat_objects: Array<{ code: string; count: number; severity: string; affects_core_semantics: boolean }>;
  evidence_health: EvidenceHealth;
}

export interface BenchmarkArtifact {
  benchmark_id: string;
  category: string;
  canonical_input: typeof CANONICAL_INPUT;
  canonical_input_hash: string;
  generated_at: string;
  run_count: number;
  winner_status: "no_clear_winner";
  winner_claimed: false;
  route_summaries: RouteAggregate[];
  aggregate_metrics: RouteAggregate[];
  run_level_summaries: RouteRunResult[];
}

const ROUTES: RouteConfig[] = [
  {
    route_id: "paysponge-reducto-parse",
    provider: "PaySponge Reducto",
    provider_id: "paysponge/reducto",
    endpoint: "https://api.paysponge.com/x402/purchase/svc_d672d90ggvqqygj60/parse",
    method: "POST",
    buildBody: () => ({
      input: CANONICAL_INPUT.document_url,
      settings: {
        return_ocr_data: true,
        extraction_mode: "hybrid",
        ocr_system: "standard",
      },
    }),
    proof_reference: PAID_PROOF_PATH,
  },
  {
    route_id: "google-vision-images-annotate",
    provider: "Google Vision",
    provider_id: "solana-foundation/google/vision",
    endpoint: "https://vision.google.gateway-402.com/v1/images:annotate",
    method: "POST",
    buildBody: () => ({
      requests: [
        {
          image: { source: { imageUri: CANONICAL_INPUT.document_url } },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    }),
    proof_reference: PAID_PROOF_PATH,
  },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function statusEvidence(statusCode: number | null, exitCode: number | null, errorReason?: string): string {
  if (statusCode !== null) {
    return `status_code_observed_${statusCode}`;
  }
  if (exitCode !== null) {
    return errorReason ? `pay_cli_exit_${exitCode}_${errorReason}` : `pay_cli_exit_${exitCode}_status_unavailable`;
  }
  return errorReason ? `status_unavailable_${errorReason}` : "status_unavailable";
}

function percentileFromSorted(values: number[], percentile: number): number | null {
  if (values.length === 0) return null;
  const rank = Math.ceil(percentile * values.length);
  const index = Math.max(0, Math.min(values.length - 1, rank - 1));
  return values[index] ?? null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return typeof left === "number" && typeof right === "number" ? (left + right) / 2 : null;
}

export function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return percentileFromSorted(sorted, 0.95);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function rate(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function adaptPayload(route: RouteConfig, parsedJson: unknown): unknown {
  if (!isObject(parsedJson)) return parsedJson;

  if (route.provider === "PaySponge Reducto") {
    const usage = isObject(parsedJson.usage) ? parsedJson.usage : {};
    const result = isObject(parsedJson.result) ? parsedJson.result : {};
    const chunks = Array.isArray(result.chunks) ? result.chunks : [];
    const text = chunks
      .map((entry) => (isObject(entry) && typeof entry.content === "string" ? entry.content.trim() : ""))
      .filter((entry) => entry.length > 0)
      .join("\n\n");
    const ocr = isObject(result.ocr) ? result.ocr : {};
    const words = Array.isArray(ocr.words) ? ocr.words : [];
    const confidence = words.length > 0 && isObject(words[0]) && typeof words[0].confidence === "number"
      ? words[0].confidence
      : null;
    return {
      ...parsedJson,
      text: text || (typeof parsedJson.text === "string" ? parsedJson.text : undefined),
      page_count: typeof usage.num_pages === "number" ? usage.num_pages : undefined,
      confidence,
      document_url: CANONICAL_INPUT.document_url,
    };
  }

  const responses = Array.isArray(parsedJson.responses) ? parsedJson.responses : [];
  const first = responses.length > 0 && isObject(responses[0]) ? responses[0] : null;
  const textAnnotations = first && Array.isArray(first.textAnnotations) ? first.textAnnotations : [];
  const firstAnnotation = textAnnotations.length > 0 && isObject(textAnnotations[0]) && typeof textAnnotations[0].description === "string"
    ? textAnnotations[0].description
    : null;
  const fullText = first && isObject(first.fullTextAnnotation) ? first.fullTextAnnotation : {};
  const pages = Array.isArray(fullText.pages) ? fullText.pages : [];
  const confidence = pages.length > 0 && isObject(pages[0]) && typeof pages[0].confidence === "number"
    ? pages[0].confidence
    : null;

  return {
    ...parsedJson,
    text: firstAnnotation ?? (typeof fullText.text === "string" ? fullText.text : undefined),
    page_count: pages.length > 0 ? pages.length : undefined,
    confidence,
    image_url: CANONICAL_INPUT.document_url,
  };
}

export function assertNoComparativeLanguage(markdown: string): void {
  const banned = /\b(best|top|winner:\s*\w+|loser|superior|superiority|outperform(ed|s)?|dominates?)\b/i;
  if (banned.test(markdown)) {
    throw new Error("Unsafe comparative language detected in benchmark artifact output.");
  }
}

export async function assertBenchmarkReadiness(fetchLike: (input: string, init?: { method?: string }) => Promise<{ status: number }> = globalThis.fetch as any): Promise<void> {
  if (process.env.LIVE_PAYSH_EXECUTION !== "true") {
    throw new Error("Readiness gate failed: LIVE_PAYSH_EXECUTION_not_true");
  }
  if (process.env.PAYSH_EXECUTION_MODE !== "pay_cli") {
    throw new Error("Readiness gate failed: PAYSH_EXECUTION_MODE_not_pay_cli");
  }

  const paidProofText = await readFile(path.resolve(process.cwd(), PAID_PROOF_PATH), "utf8");
  const hasReducto = paidProofText.includes("## PaySponge Reducto") && paidProofText.includes("- route_state: verified/proven");
  const hasVision = paidProofText.includes("## Google Vision") && paidProofText.includes("- route_state: verified/proven");
  if (!(hasReducto && hasVision)) {
    throw new Error("Readiness gate failed: paid_proof_routes_not_verified_proven");
  }

  const fixture = await fetchLike(CANONICAL_INPUT.document_url, { method: "GET" });
  if (fixture.status !== 200) {
    throw new Error("Readiness gate failed: fixture_url_not_200");
  }

  await execFileAsync("node", ["--test", "-r", "ts-node/register", "src/benchmarks/documentOcrTextExtractionNormalization.test.ts"]);
}

export function buildRouteAggregate(route: RouteConfig, runs: RouteRunResult[]): RouteAggregate {
  const attemptedRuns = runs.length;
  const successfulRuns = runs.filter((r) => r.paid_execution_status === "succeeded").length;
  const ocrSuccesses = runs.filter((r) => r.normalized_output.ocr_success).length;
  const fullMatches = runs.filter((r) => r.normalized_output.expected_fragment_match_rate >= 1).length;
  const textDetections = runs.filter((r) => typeof r.normalized_output.text === "string" && r.normalized_output.text.length > 0).length;
  const confidenceDetections = runs.filter((r) => typeof r.normalized_output.confidence === "number").length;
  const pageDetections = runs.filter((r) => typeof r.normalized_output.page_count === "number").length;

  const matchRates = runs.map((r) => r.normalized_output.expected_fragment_match_rate);
  const latencies = runs.map((r) => r.latency_ms).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const chars = runs.map((r) => r.normalized_output.character_count).filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const caveatMap = new Map<string, { count: number; severity: string; affects_core_semantics: boolean }>();
  for (const run of runs) {
    for (const c of run.caveat_objects) {
      const current = caveatMap.get(c.code) ?? { count: 0, severity: c.severity, affects_core_semantics: c.affects_core_semantics };
      current.count += 1;
      caveatMap.set(c.code, current);
    }
  }

  const latest = runs.at(-1);
  const evidenceHealth = deriveDocumentOcrEvidenceHealth({
    paidAttempts: attemptedRuns,
    paidSuccesses: successfulRuns,
    paidFailures: attemptedRuns - successfulRuns,
    successfulCharacterCounts: runs
      .filter((r) => r.paid_execution_status === "succeeded")
      .map((r) => r.normalized_output.character_count ?? 0),
    latest: latest
      ? {
          normalized: latest.normalized_output,
          caveat_objects: latest.caveat_objects,
        }
      : undefined,
  });

  return {
    route_id: route.route_id,
    provider: route.provider,
    provider_id: route.provider_id,
    attempted_runs: attemptedRuns,
    successful_runs: successfulRuns,
    success_rate: rate(successfulRuns, attemptedRuns),
    ocr_success_rate: rate(ocrSuccesses, attemptedRuns),
    expected_fragment_match_rate_avg: Number(average(matchRates).toFixed(4)),
    expected_fragment_match_rate_median: Number((median(matchRates) ?? 0).toFixed(4)),
    full_match_rate: rate(fullMatches, attemptedRuns),
    text_detection_rate: rate(textDetections, attemptedRuns),
    character_count_median: median(chars),
    confidence_detection_rate: rate(confidenceDetections, attemptedRuns),
    page_count_detection_rate: rate(pageDetections, attemptedRuns),
    median_latency_ms: median(latencies),
    p95_latency_ms: p95(latencies),
    caveat_objects: Array.from(caveatMap.entries()).map(([code, v]) => ({ code, ...v })),
    evidence_health: evidenceHealth,
  };
}

export function renderBenchmarkMarkdown(artifact: BenchmarkArtifact): string {
  const lines: string[] = [
    "# Document OCR Text Extraction Benchmark Runs",
    "",
    `- benchmark_id: ${artifact.benchmark_id}`,
    `- category: ${artifact.category}`,
    `- generated_at: ${artifact.generated_at}`,
    `- canonical_input: ${JSON.stringify(artifact.canonical_input)}`,
    `- canonical_input_hash: ${artifact.canonical_input_hash}`,
    `- winner_status: ${artifact.winner_status}`,
    `- winner_claimed: ${artifact.winner_claimed}`,
    "",
    "## Route Summaries",
    "",
    "| route_id | provider | attempted_runs | successful_runs | success_rate | ocr_success_rate | expected_fragment_match_rate_avg | expected_fragment_match_rate_median | full_match_rate | text_detection_rate | character_count_median | confidence_detection_rate | page_count_detection_rate | median_latency_ms | p95_latency_ms | evidence_health |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ];

  for (const route of artifact.route_summaries) {
    lines.push(
      `| ${route.route_id} | ${route.provider} | ${route.attempted_runs} | ${route.successful_runs} | ${route.success_rate} | ${route.ocr_success_rate} | ${route.expected_fragment_match_rate_avg} | ${route.expected_fragment_match_rate_median} | ${route.full_match_rate} | ${route.text_detection_rate} | ${route.character_count_median ?? ""} | ${route.confidence_detection_rate} | ${route.page_count_detection_rate} | ${route.median_latency_ms ?? ""} | ${route.p95_latency_ms ?? ""} | ${route.evidence_health} |`,
    );
  }

  lines.push("", "## Run-Level Summaries", "");
  lines.push("| run_number | provider | route_id | paid_execution_status | cli_exit_code | latency_ms | status_evidence | ocr_success | expected_fragment_match_rate | character_count | confidence | page_count | evidence_health | proof_reference |", "|---:|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---|---|");
  for (const run of artifact.run_level_summaries) {
    lines.push(
      `| ${run.run_number} | ${run.provider} | ${run.route_id} | ${run.paid_execution_status} | ${run.cli_exit_code ?? ""} | ${run.latency_ms ?? ""} | ${run.status_evidence} | ${run.normalized_output.ocr_success} | ${run.normalized_output.expected_fragment_match_rate} | ${run.normalized_output.character_count ?? ""} | ${run.normalized_output.confidence ?? ""} | ${run.normalized_output.page_count ?? ""} | ${run.evidence_health} | ${run.proof_reference} |`,
    );
  }

  lines.push("", "## Structured Caveats", "");
  for (const route of artifact.route_summaries) {
    lines.push(`### ${route.provider} (${route.route_id})`);
    if (route.caveat_objects.length === 0) {
      lines.push("- caveat_objects: []");
    } else {
      lines.push(`- caveat_objects: ${JSON.stringify(route.caveat_objects)}`);
    }
    lines.push(`- evidence_health: ${route.evidence_health}`);
    lines.push("");
  }

  assertNoComparativeLanguage(lines.join("\n"));
  return `${lines.join("\n")}\n`;
}

async function runOne(route: RouteConfig, runNumber: number): Promise<RouteRunResult> {
  const input: ExecuteLivePayShCallInput = {
    providerId: route.provider_id,
    intent: BENCHMARK_ID,
    endpointUrl: route.endpoint,
    method: route.method,
    bodyJson: route.buildBody(),
    headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
  };

  const exec = await executeLivePayShCall(input);
  const evidence = statusEvidence(exec.statusCode ?? null, exec.exitCode ?? null, exec.errorReason);
  const adapted = adaptPayload(route, exec.parsedJsonAvailable ? exec.parsedJson : exec.responsePreview);
  const normalized = normalizeDocumentOcrTextExtraction({
    parsedJson: adapted,
    responsePreview: exec.responsePreview,
    statusCode: exec.statusCode ?? null,
    statusEvidence: evidence,
    paidExecutionObserved: exec.success,
    canonicalInput: CANONICAL_INPUT,
  });

  const evidenceHealth = deriveDocumentOcrEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: exec.success ? 1 : 0,
    paidFailures: exec.success ? 0 : 1,
    successfulCharacterCounts: exec.success ? [normalized.normalized.character_count ?? 0] : [],
    latest: normalized,
  });

  const merged: DocumentOcrTextExtractionNormalizedOutput = {
    ...normalized.normalized,
    evidence_health: evidenceHealth,
    caveat_objects: normalized.caveat_objects,
  };

  return {
    run_number: runNumber,
    provider: route.provider,
    provider_id: route.provider_id,
    route_id: route.route_id,
    endpoint: route.endpoint,
    method: route.method,
    paid_execution_status: exec.success ? "succeeded" : "failed",
    cli_exit_code: exec.exitCode ?? null,
    latency_ms: exec.latencyMs ?? null,
    status_evidence: evidence,
    normalized_output: merged,
    caveat_objects: normalized.caveat_objects,
    evidence_health: evidenceHealth,
    proof_reference: route.proof_reference,
  };
}

export async function runBenchmarkDocumentOcrLive(): Promise<BenchmarkArtifact> {
  if (ROUTES.length < 2) {
    throw new Error("Both routes are required before benchmark runs.");
  }

  await assertBenchmarkReadiness();

  const runLevel: RouteRunResult[] = [];
  for (let run = 1; run <= RUNS; run += 1) {
    for (const route of ROUTES) {
      runLevel.push(await runOne(route, run));
    }
  }

  const routeSummaries = ROUTES.map((route) =>
    buildRouteAggregate(
      route,
      runLevel.filter((r) => r.route_id === route.route_id),
    ),
  );

  const artifact: BenchmarkArtifact = {
    benchmark_id: BENCHMARK_ID,
    category: CATEGORY,
    canonical_input: CANONICAL_INPUT,
    canonical_input_hash: createHash("sha256").update(JSON.stringify(CANONICAL_INPUT), "utf8").digest("hex"),
    generated_at: new Date().toISOString(),
    run_count: RUNS,
    winner_status: "no_clear_winner",
    winner_claimed: false,
    route_summaries: routeSummaries,
    aggregate_metrics: routeSummaries,
    run_level_summaries: runLevel,
  };

  const outAbs = path.resolve(process.cwd(), OUT_PATH);
  await mkdir(path.dirname(outAbs), { recursive: true });
  await writeFile(outAbs, renderBenchmarkMarkdown(artifact), "utf8");

  return artifact;
}

if (require.main === module) {
  runBenchmarkDocumentOcrLive()
    .then((artifact) => {
      console.log(
        JSON.stringify(
          {
            benchmark_id: artifact.benchmark_id,
            category: artifact.category,
            canonical_input_hash: artifact.canonical_input_hash,
            winner_status: artifact.winner_status,
            winner_claimed: artifact.winner_claimed,
            output: OUT_PATH,
            route_summaries: artifact.route_summaries.map((r) => ({
              route_id: r.route_id,
              attempted_runs: r.attempted_runs,
              successful_runs: r.successful_runs,
              success_rate: r.success_rate,
              ocr_success_rate: r.ocr_success_rate,
              expected_fragment_match_rate_avg: r.expected_fragment_match_rate_avg,
              evidence_health: r.evidence_health,
            })),
          },
          null,
          2,
        ),
      );
    })
    .catch((error) => {
      console.error("benchmark:document-ocr-live failed", error);
      process.exitCode = 1;
    });
}
