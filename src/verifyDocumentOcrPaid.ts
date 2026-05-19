import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveDocumentOcrEvidenceHealth,
  normalizeDocumentOcrTextExtraction,
  type CaveatObject,
  type DocumentOcrTextExtractionNormalizedOutput,
  type NormalizeDocumentOcrTextExtractionResult,
} from "./benchmarks/documentOcrTextExtractionNormalization";

const BENCHMARK_ID = "document-ocr-text-extraction";
const METHOD = "POST" as const;
const RESEARCH_PROOF_PATH = "live-proofs/document-ocr-text-extraction-candidate-research-2026-05-19.md";

const CANONICAL_INPUT = {
  document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
  fallback_document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.svg",
  expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "OCR BENCHMARK 001"],
};

const ROUTE_REDUCTO = {
  provider: "PaySponge Reducto" as const,
  providerId: "paysponge/reducto",
  endpoint: "https://api.paysponge.com/x402/purchase/svc_d672d90ggvqqygj60/parse",
  method: METHOD,
};

const ROUTE_VISION = {
  provider: "Google Vision" as const,
  providerId: "solana-foundation/google/vision",
  endpoint: "https://vision.google.gateway-402.com/v1/images:annotate",
  method: METHOD,
};

const SENSITIVE_PATTERNS = [
  /authorization\s*[:=]\s*[^\n]+/gi,
  /x-payment\s*[:=]\s*[^\n]+/gi,
  /payment-signature\s*[:=]\s*[^\n]+/gi,
  /private[_ -]?key\s*[:=]\s*[^\s,;)]+/gi,
  /seed[_ -]?phrase\s*[:=]\s*[^\n]+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s,;)]+/gi,
  /apikey\s*[:=]\s*[^\s,;)]+/gi,
  /wallet\s*[:=]\s*[^\n]+/gi,
  /mnemonic\s*[:=]\s*[^\n]+/gi,
  /signature\s*[:=]\s*[^\n]+/gi,
];

export type RouteState = "verified/proven" | "candidate/unproven" | "rejected";

export interface RouteConfig {
  provider: "PaySponge Reducto" | "Google Vision";
  providerId: string;
  endpoint: string;
  method: "POST";
  buildBody: (input: typeof CANONICAL_INPUT) => Record<string, unknown>;
}

export interface PaidRouteProof {
  benchmark_id: string;
  provider: RouteConfig["provider"];
  endpoint: string;
  method: "POST";
  canonical_input_hash: string;
  document_url: string;
  expected_text_fragments: string[];
  route_specific_body: Record<string, unknown>;
  paid_execution_status: "succeeded" | "failed";
  cli_exit_code: number | null;
  status_evidence: string;
  normalized_output: DocumentOcrTextExtractionNormalizedOutput;
  expected_fragment_match_rate: number;
  ocr_success: boolean;
  sample_extracted_text_preview: string;
  caveat_objects: CaveatObject[];
  evidence_health: DocumentOcrTextExtractionNormalizedOutput["evidence_health"];
  route_state: RouteState;
}

export interface VerifyDocumentOcrPaidResult {
  benchmark_id: string;
  proof_path: string;
  attempted_routes: PaidRouteProof[];
  winner_claimed: false;
}

type SafetyGateReason =
  | "ok"
  | "research_proof_missing_or_incomplete"
  | "LIVE_PAYSH_EXECUTION_not_true"
  | "PAYSH_EXECUTION_MODE_not_pay_cli"
  | "fixture_url_not_200";

export interface SafetyGateResult {
  ok: boolean;
  reason: SafetyGateReason;
}

const ROUTE_CONFIGS: { reducto: RouteConfig; vision: RouteConfig } = {
  reducto: {
    ...ROUTE_REDUCTO,
    buildBody: (input) => ({
      input: input.document_url,
      settings: {
        return_ocr_data: true,
        extraction_mode: "hybrid",
        ocr_system: "standard",
      },
    }),
  },
  vision: {
    ...ROUTE_VISION,
    buildBody: (input) => ({
      requests: [
        {
          image: {
            source: {
              imageUri: input.document_url,
            },
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    }),
  },
};

export function getRouteConfigs(): { reducto: RouteConfig; vision: RouteConfig } {
  return ROUTE_CONFIGS;
}

export function hashCanonicalInput(input: typeof CANONICAL_INPUT): string {
  return createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
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

export function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export async function confirmResearchProof(): Promise<boolean> {
  const proofPath = path.resolve(process.cwd(), RESEARCH_PROOF_PATH);
  try {
    const text = await readFile(proofPath, "utf8");
    return (
      text.includes("https://api.paysponge.com/x402/purchase/svc_d672d90ggvqqygj60/parse") &&
      text.includes("https://vision.google.gateway-402.com/v1/images:annotate") &&
      text.includes("DOCUMENT_TEXT_DETECTION")
    );
  } catch {
    return false;
  }
}

export type FetchLike = (input: string, init?: { method?: string }) => Promise<{ status: number }>;

export async function fixtureUrlReturns200(fetchLike: FetchLike = globalThis.fetch as FetchLike): Promise<boolean> {
  try {
    const response = await fetchLike(CANONICAL_INPUT.document_url, { method: "GET" });
    return response.status === 200;
  } catch {
    return false;
  }
}

export function validateSafetyGate(
  env: NodeJS.ProcessEnv,
  researchConfirmed: boolean,
  fixtureOk: boolean,
): SafetyGateResult {
  if (!researchConfirmed) {
    return { ok: false, reason: "research_proof_missing_or_incomplete" };
  }
  if (env.LIVE_PAYSH_EXECUTION !== "true") {
    return { ok: false, reason: "LIVE_PAYSH_EXECUTION_not_true" };
  }
  if (env.PAYSH_EXECUTION_MODE !== "pay_cli") {
    return { ok: false, reason: "PAYSH_EXECUTION_MODE_not_pay_cli" };
  }
  if (!fixtureOk) {
    return { ok: false, reason: "fixture_url_not_200" };
  }
  return { ok: true, reason: "ok" };
}

export function deriveRouteState(input: {
  paidCallSuccess: boolean;
  normalized: NormalizeDocumentOcrTextExtractionResult;
}): RouteState {
  const hardReject = input.normalized.caveat_objects.some((c) =>
    c.code === "route_not_found" || c.code === "method_not_allowed" || c.code === "auth_required",
  );
  if (hardReject) {
    return "rejected";
  }
  if (input.paidCallSuccess && input.normalized.normalized.ocr_success) {
    return "verified/proven";
  }
  return "candidate/unproven";
}

function textPreview(text: string | null): string {
  if (!text) {
    return "";
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function adaptOcrPayload(route: RouteConfig, parsedJson: unknown): unknown {
  if (!isObject(parsedJson)) {
    return parsedJson;
  }

  if (route.provider === "PaySponge Reducto") {
    const usage = isObject(parsedJson.usage) ? parsedJson.usage : {};
    const result = isObject(parsedJson.result) ? parsedJson.result : {};
    const existingText = typeof parsedJson.text === "string" ? parsedJson.text : null;
    const chunks = Array.isArray(result.chunks) ? result.chunks : [];
    const chunkText = chunks
      .map((entry) => (isObject(entry) && typeof entry.content === "string" ? entry.content.trim() : ""))
      .filter((entry) => entry.length > 0)
      .join("\n\n");
    const ocr = isObject(result.ocr) ? result.ocr : {};
    const words = Array.isArray(ocr.words) ? ocr.words : [];
    const existingConfidence = typeof parsedJson.confidence === "number" ? parsedJson.confidence : null;
    const confidence = words.length > 0 && isObject(words[0]) && typeof words[0].confidence === "number"
      ? words[0].confidence
      : existingConfidence;
    const existingPageCount = typeof parsedJson.page_count === "number" ? parsedJson.page_count : null;

    return {
      ...parsedJson,
      text: chunkText.length > 0 ? chunkText : existingText ?? undefined,
      page_count: typeof usage.num_pages === "number" ? usage.num_pages : existingPageCount ?? undefined,
      confidence,
      document_url: CANONICAL_INPUT.document_url,
    };
  }

  const responses = Array.isArray(parsedJson.responses) ? parsedJson.responses : [];
  const first = responses.length > 0 && isObject(responses[0]) ? responses[0] : null;
  const textAnnotations = first && Array.isArray(first.textAnnotations) ? first.textAnnotations : [];
  const firstAnnotation =
    textAnnotations.length > 0 && isObject(textAnnotations[0]) && typeof textAnnotations[0].description === "string"
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

type LiveExecutor = (input: ExecuteLivePayShCallInput) => ReturnType<typeof executeLivePayShCall>;

export async function runPaidRoute(
  route: RouteConfig,
  canonicalInputHash: string,
  executor: LiveExecutor,
): Promise<PaidRouteProof> {
  const body = route.buildBody(CANONICAL_INPUT);
  const paid = await executor({
    providerId: route.providerId,
    intent: BENCHMARK_ID,
    endpointUrl: route.endpoint,
    method: route.method,
    bodyJson: body,
    headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
  });

  const paidSucceeded = paid.success;
  const evidence = statusEvidence(paid.statusCode ?? null, paid.exitCode ?? null, paid.errorReason);
  const adaptedPayload = adaptOcrPayload(route, paid.parsedJsonAvailable ? paid.parsedJson ?? {} : paid.responsePreview);
  const normalized = normalizeDocumentOcrTextExtraction({
    parsedJson: adaptedPayload,
    responsePreview: paid.responsePreview,
    statusCode: paid.statusCode ?? null,
    statusEvidence: evidence,
    paidExecutionObserved: paidSucceeded,
    canonicalInput: CANONICAL_INPUT,
  });

  const evidenceHealth = deriveDocumentOcrEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: paidSucceeded ? 1 : 0,
    paidFailures: paidSucceeded ? 0 : 1,
    successfulCharacterCounts: paidSucceeded ? [normalized.normalized.character_count ?? 0] : [],
    latest: normalized,
  });

  const mergedNormalized: DocumentOcrTextExtractionNormalizedOutput = {
    ...normalized.normalized,
    evidence_health: evidenceHealth,
    caveat_objects: normalized.caveat_objects,
  };

  const routeState = deriveRouteState({
    paidCallSuccess: paidSucceeded,
    normalized: { normalized: mergedNormalized, caveat_objects: normalized.caveat_objects },
  });

  return {
    benchmark_id: BENCHMARK_ID,
    provider: route.provider,
    endpoint: route.endpoint,
    method: route.method,
    canonical_input_hash: canonicalInputHash,
    document_url: CANONICAL_INPUT.document_url,
    expected_text_fragments: [...CANONICAL_INPUT.expected_text_fragments],
    route_specific_body: body,
    paid_execution_status: paidSucceeded ? "succeeded" : "failed",
    cli_exit_code: paid.exitCode ?? null,
    status_evidence: evidence,
    normalized_output: mergedNormalized,
    expected_fragment_match_rate: mergedNormalized.expected_fragment_match_rate,
    ocr_success: mergedNormalized.ocr_success,
    sample_extracted_text_preview: textPreview(mergedNormalized.text),
    caveat_objects: normalized.caveat_objects,
    evidence_health: evidenceHealth,
    route_state: routeState,
  };
}

export function renderProofMarkdown(results: PaidRouteProof[], now = new Date()): string {
  const lines: string[] = [
    "# Document OCR Text Extraction Paid Route Verification",
    "",
    `- generated_at: ${now.toISOString()}`,
    `- benchmark_id: ${BENCHMARK_ID}`,
    `- canonical_input: ${JSON.stringify(CANONICAL_INPUT)}`,
    "- winner_claimed: false",
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.provider}`);
    lines.push(`- benchmark_id: ${result.benchmark_id}`);
    lines.push(`- provider: ${result.provider}`);
    lines.push(`- endpoint: ${result.endpoint}`);
    lines.push(`- method: ${result.method}`);
    lines.push(`- canonical_input_hash: ${result.canonical_input_hash}`);
    lines.push(`- document_url: ${result.document_url}`);
    lines.push(`- expected_text_fragments: ${JSON.stringify(result.expected_text_fragments)}`);
    lines.push(`- route_specific_body: ${JSON.stringify(result.route_specific_body)}`);
    lines.push(`- paid_execution_status: ${result.paid_execution_status}`);
    lines.push(`- cli_exit_code: ${result.cli_exit_code === null ? "null" : String(result.cli_exit_code)}`);
    lines.push(`- status_evidence: ${result.status_evidence}`);
    lines.push(`- normalized_output: ${JSON.stringify(result.normalized_output)}`);
    lines.push(`- expected_fragment_match_rate: ${result.expected_fragment_match_rate}`);
    lines.push(`- ocr_success: ${String(result.ocr_success)}`);
    lines.push(`- sample extracted text preview: ${result.sample_extracted_text_preview}`);
    lines.push(`- caveat_objects: ${JSON.stringify(result.caveat_objects)}`);
    lines.push(`- evidence_health: ${result.evidence_health}`);
    lines.push(`- route_state: ${result.route_state}`);
    lines.push("");
  }

  lines.push("No 5-run benchmark artifact generated.");
  lines.push("No benchmark recorded claim.");
  lines.push("No winner claim.");

  return sanitizeProofMarkdown(lines.join("\n"));
}

export async function runDocumentOcrPaidVerification(
  executor: LiveExecutor = executeLivePayShCall,
  now = new Date(),
): Promise<VerifyDocumentOcrPaidResult> {
  const researchConfirmed = await confirmResearchProof();
  const fixtureOk = await fixtureUrlReturns200();
  const gate = validateSafetyGate(process.env, researchConfirmed, fixtureOk);
  if (!gate.ok) {
    throw new Error(`Safety gate failed: ${gate.reason}`);
  }

  const canonicalInputHash = hashCanonicalInput(CANONICAL_INPUT);
  const results = [
    await runPaidRoute(ROUTE_CONFIGS.reducto, canonicalInputHash, executor),
    await runPaidRoute(ROUTE_CONFIGS.vision, canonicalInputHash, executor),
  ];

  const datePart = now.toISOString().slice(0, 10);
  const proofPath = `live-proofs/document-ocr-text-extraction-paid-routes-${datePart}.md`;
  const outputPath = path.resolve(process.cwd(), proofPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${renderProofMarkdown(results, now)}\n`, "utf8");
  await access(outputPath);

  return {
    benchmark_id: BENCHMARK_ID,
    proof_path: proofPath,
    attempted_routes: results,
    winner_claimed: false,
  };
}

if (require.main === module) {
  runDocumentOcrPaidVerification()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            benchmark_id: result.benchmark_id,
            proof_path: result.proof_path,
            winner_claimed: result.winner_claimed,
            routes: result.attempted_routes.map((route) => ({
              provider: route.provider,
              endpoint: route.endpoint,
              paid_execution_status: route.paid_execution_status,
              expected_fragment_match_rate: route.expected_fragment_match_rate,
              ocr_success: route.ocr_success,
              route_state: route.route_state,
              evidence_health: route.evidence_health,
            })),
          },
          null,
          2,
        ),
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
