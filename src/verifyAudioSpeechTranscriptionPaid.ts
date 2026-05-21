import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveAudioSpeechTranscriptionEvidenceHealth,
  normalizeAudioSpeechTranscription,
  type CanonicalAudioSpeechTranscriptionInput,
  type AudioSpeechTranscriptionNormalizedOutput,
  type CaveatObject,
  type NormalizeAudioSpeechTranscriptionResult,
} from "./benchmarks/audioSpeechTranscriptionNormalization";

const BENCHMARK_ID = "audio-speech-transcription";
const METHOD = "POST" as const;
const READINESS_NOTE_PATH = "live-proofs/audio-speech-transcription-scaffold-readiness-2026-05-21.md";
const RESEARCH_PROOF_PATH = "live-proofs/audio-speech-transcription-candidate-research-2026-05-21.md";
const PAY_SKILLS_DETAIL_DIR = path.join(os.homedir(), ".config/pay/skills/detail");

const CANONICAL_INPUT: CanonicalAudioSpeechTranscriptionInput = {
  audio_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav",
  language: "en",
  expected_text_fragments: [
    "INFOPUNKS RADAR",
    "EVIDENCE BEFORE SPEND",
    "AUDIO BENCHMARK 001",
  ],
  accepted_alternates: {
    "AUDIO BENCHMARK 001": [
      "AUDIO BENCHMARK ZERO ZERO ONE",
      "AUDIO BENCHMARK DOUBLE ZERO ONE",
      "AUDIO BENCHMARK O O ONE",
    ],
  },
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
  provider: "Google Speech Recognize" | "Alibaba Speech Transcription";
  providerId: string;
  endpoint: string;
  method: "POST";
  buildBody: (input: typeof CANONICAL_INPUT, audioBytesBase64: string) => Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface PaidRouteProof {
  benchmark_id: string;
  provider: RouteConfig["provider"];
  endpoint: string;
  method: "POST";
  canonical_input_hash: string;
  canonical_input: typeof CANONICAL_INPUT;
  route_specific_body: Record<string, unknown>;
  paid_execution_status: "succeeded" | "failed";
  cli_exit_code: number | null;
  status_evidence: string;
  normalized_output: AudioSpeechTranscriptionNormalizedOutput;
  transcript_preview: string;
  expected_fragment_match_rate: number;
  transcription_success: boolean;
  language: string | null;
  duration_seconds: number | null;
  confidence: number | null;
  word_count: number | null;
  caveat_objects: CaveatObject[];
  evidence_health: AudioSpeechTranscriptionNormalizedOutput["evidence_health"];
  route_state: RouteState;
}

export interface VerifyAudioSpeechTranscriptionPaidResult {
  benchmark_id: string;
  proof_path: string;
  attempted_routes: PaidRouteProof[];
  winner_claimed: false;
}

const ROUTE_CONFIGS: Record<string, RouteConfig> = {
  "solana-foundation/google/speech": {
    provider: "Google Speech Recognize",
    providerId: "solana-foundation/google/speech",
    endpoint: "https://speech.google.gateway-402.com/v1/speech:recognize",
    method: METHOD,
    buildBody: (input, audioBytesBase64) => ({
      config: {
        languageCode: input.language,
      },
      audio: {
        content: audioBytesBase64,
      },
    }),
  },
  "solana-foundation/alibaba/speech": {
    provider: "Alibaba Speech Transcription",
    providerId: "solana-foundation/alibaba/speech",
    endpoint: "https://speech.alibaba.gateway-402.com/api/v1/services/audio/asr/transcription",
    method: METHOD,
    headers: {
      "X-DashScope-Async": "enable",
    },
    buildBody: (input) => ({
      model: "qwen3-asr-flash-filetrans",
      input: {
        file_url: input.audio_url,
      },
      parameters: {
        language_hints: [input.language],
        enable_itn: true,
      },
    }),
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function statusEvidence(statusCode: number | null, exitCode: number | null, errorReason?: string): string {
  if (statusCode !== null) return `status_code_observed_${statusCode}`;
  if (exitCode !== null) return errorReason ? `pay_cli_exit_${exitCode}_${errorReason}` : `pay_cli_exit_${exitCode}_status_unavailable`;
  return errorReason ? `status_unavailable_${errorReason}` : "status_unavailable";
}

function textPreview(text: string | null): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

export function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export function hashCanonicalInput(input: typeof CANONICAL_INPUT): string {
  return createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
}

export function extractRecommendedCandidates(readinessText: string): string[] {
  const sectionMatch = readinessText.match(/recommended_candidates:\n([\s\S]*?)\n- rejected_or_blocked_candidates:/);
  if (!sectionMatch) return [];
  const lines = sectionMatch[1].split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/`([^`]+)`/);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

export function extractRejectedOrBlockedCandidates(readinessText: string): string[] {
  const sectionMatch = readinessText.match(/rejected_or_blocked_candidates:\n([\s\S]*?)\n- fixture_requirement:/);
  if (!sectionMatch) return [];
  const lines = sectionMatch[1].split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/`([^`]+)`/);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}

export function selectComparableRoutesFromReadiness(readinessText: string): RouteConfig[] {
  const recommended = extractRecommendedCandidates(readinessText);
  const rejected = new Set(extractRejectedOrBlockedCandidates(readinessText));
  const comparable = recommended.filter((id) => !rejected.has(id));
  const selected: RouteConfig[] = [];
  for (const providerId of comparable) {
    if (providerId in ROUTE_CONFIGS) selected.push(ROUTE_CONFIGS[providerId]);
    if (selected.length === 2) break;
  }
  return selected;
}

async function readTextIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(path.resolve(process.cwd(), filePath), "utf8");
  } catch {
    return null;
  }
}

async function readPaySkillDetailTexts(): Promise<string[]> {
  try {
    const entries = await readdir(PAY_SKILLS_DETAIL_DIR, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    return await Promise.all(files.map((entry) => readFile(path.join(PAY_SKILLS_DETAIL_DIR, entry.name), "utf8")));
  } catch {
    return [];
  }
}

export async function confirmComparableRouteSchemaEvidence(routes: RouteConfig[]): Promise<boolean> {
  const detailTexts = await readPaySkillDetailTexts();
  const researchText = (await readTextIfExists(RESEARCH_PROOF_PATH)) ?? "";

  return routes.every((route) => {
    if (route.providerId === "solana-foundation/google/speech") {
      const byDetail = detailTexts.some((t) => t.includes(route.providerId) && t.includes(route.endpoint) && t.includes("languageCode") && t.includes("audio") && t.includes("content"));
      const byResearch = researchText.includes(route.providerId) && researchText.includes(route.endpoint) && researchText.includes("audio.content");
      return byDetail || byResearch;
    }

    const byDetail = detailTexts.some((t) =>
      t.includes(route.providerId) &&
      t.includes(route.endpoint) &&
      t.includes("X-DashScope-Async") &&
      t.includes("file_url") &&
      t.includes("qwen3-asr-flash-filetrans"),
    );
    const byResearch = researchText.includes(route.providerId) && researchText.includes(route.endpoint) && researchText.includes("input.file_url");
    return byDetail || byResearch;
  });
}

export type FetchLike = (input: string, init?: { method?: string }) => Promise<{ status: number; arrayBuffer: () => Promise<ArrayBuffer> }>;

export async function loadCanonicalAudioFixture(fetchLike: FetchLike = globalThis.fetch as FetchLike): Promise<{ base64: string; fixtureOk: boolean }> {
  try {
    const response = await fetchLike(CANONICAL_INPUT.audio_url, { method: "GET" });
    if (response.status !== 200) return { base64: "", fixtureOk: false };
    const bytes = Buffer.from(await response.arrayBuffer());
    return { base64: bytes.toString("base64"), fixtureOk: true };
  } catch {
    return { base64: "", fixtureOk: false };
  }
}

type SafetyGateReason =
  | "ok"
  | "readiness_note_missing_or_invalid"
  | "research_proof_missing"
  | "LIVE_PAYSH_EXECUTION_not_true"
  | "PAYSH_EXECUTION_MODE_not_pay_cli"
  | "fixture_url_not_200"
  | "comparable_route_schema_evidence_missing"
  | "recommended_candidates_not_resolved_to_two_routes";

export interface SafetyGateResult {
  ok: boolean;
  reason: SafetyGateReason;
}

export function validateSafetyGate(env: NodeJS.ProcessEnv, checks: {
  readinessText: string | null;
  researchConfirmed: boolean;
  fixtureOk: boolean;
  schemaEvidenceConfirmed: boolean;
  selectedRoutesCount: number;
}): SafetyGateResult {
  if (!checks.readinessText || !checks.readinessText.includes("recommended_candidates")) return { ok: false, reason: "readiness_note_missing_or_invalid" };
  if (!checks.researchConfirmed) return { ok: false, reason: "research_proof_missing" };
  if (env.LIVE_PAYSH_EXECUTION !== "true") return { ok: false, reason: "LIVE_PAYSH_EXECUTION_not_true" };
  if (env.PAYSH_EXECUTION_MODE !== "pay_cli") return { ok: false, reason: "PAYSH_EXECUTION_MODE_not_pay_cli" };
  if (!checks.fixtureOk) return { ok: false, reason: "fixture_url_not_200" };
  if (checks.selectedRoutesCount !== 2) return { ok: false, reason: "recommended_candidates_not_resolved_to_two_routes" };
  if (!checks.schemaEvidenceConfirmed) return { ok: false, reason: "comparable_route_schema_evidence_missing" };
  return { ok: true, reason: "ok" };
}

export function deriveRouteState(input: { paidCallSuccess: boolean; normalized: NormalizeAudioSpeechTranscriptionResult }): RouteState {
  const hardReject = input.normalized.caveat_objects.some((c) => c.code === "route_not_found" || c.code === "method_not_allowed" || c.code === "auth_required");
  if (hardReject) return "rejected";
  if (input.paidCallSuccess && input.normalized.normalized.transcription_success) return "verified/proven";
  return "candidate/unproven";
}

function adaptForAlibabaSubmitPayload(payload: unknown): unknown {
  if (!isObject(payload)) return payload;
  const output = isObject(payload.output) ? payload.output : {};
  const transcriptionUrl = isObject(output.result) && typeof output.result.transcription_url === "string" ? output.result.transcription_url : null;
  return {
    ...payload,
    transcript: transcriptionUrl ?? payload.transcript,
    language: CANONICAL_INPUT.language,
    audio_url: CANONICAL_INPUT.audio_url,
  };
}

type LiveExecutor = (input: ExecuteLivePayShCallInput) => ReturnType<typeof executeLivePayShCall>;

export async function runPaidRoute(route: RouteConfig, canonicalInputHash: string, audioBase64: string, executor: LiveExecutor): Promise<PaidRouteProof> {
  const routeBody = route.buildBody(CANONICAL_INPUT, audioBase64);
  const paid = await executor({
    providerId: route.providerId,
    intent: BENCHMARK_ID,
    endpointUrl: route.endpoint,
    method: route.method,
    bodyJson: routeBody,
    headers: {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      ...(route.headers ?? {}),
    },
  });

  const paidSucceeded = paid.success;
  const evidence = statusEvidence(paid.statusCode ?? null, paid.exitCode ?? null, paid.errorReason);
  const parsedForNormalization = route.providerId === "solana-foundation/alibaba/speech" && paid.parsedJsonAvailable
    ? adaptForAlibabaSubmitPayload(paid.parsedJson ?? {})
    : (paid.parsedJsonAvailable ? paid.parsedJson ?? {} : paid.responsePreview);

  const normalized = normalizeAudioSpeechTranscription({
    parsedJson: parsedForNormalization,
    responsePreview: paid.responsePreview,
    statusCode: paid.statusCode ?? null,
    statusEvidence: evidence,
    paidExecutionObserved: paidSucceeded,
    canonicalInput: CANONICAL_INPUT,
  });

  const evidenceHealth = deriveAudioSpeechTranscriptionEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: paidSucceeded ? 1 : 0,
    paidFailures: paidSucceeded ? 0 : 1,
    successfulWordCounts: paidSucceeded ? [normalized.normalized.word_count ?? 0] : [],
    latest: normalized,
  });

  const mergedNormalized: AudioSpeechTranscriptionNormalizedOutput = {
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
    canonical_input: CANONICAL_INPUT,
    route_specific_body: routeBody,
    paid_execution_status: paidSucceeded ? "succeeded" : "failed",
    cli_exit_code: paid.exitCode ?? null,
    status_evidence: evidence,
    normalized_output: mergedNormalized,
    transcript_preview: textPreview(mergedNormalized.transcript),
    expected_fragment_match_rate: mergedNormalized.expected_fragment_match_rate,
    transcription_success: mergedNormalized.transcription_success,
    language: mergedNormalized.language,
    duration_seconds: mergedNormalized.duration_seconds,
    confidence: mergedNormalized.confidence,
    word_count: mergedNormalized.word_count,
    caveat_objects: normalized.caveat_objects,
    evidence_health: evidenceHealth,
    route_state: routeState,
  };
}

export function renderProofMarkdown(results: PaidRouteProof[], now = new Date()): string {
  const summarizeRouteBody = (body: Record<string, unknown>): Record<string, unknown> => {
    if (!isObject(body.audio)) {
      return body;
    }
    const audio = body.audio as Record<string, unknown>;
    if (typeof audio.content !== "string") {
      return body;
    }
    return {
      ...body,
      audio: {
        ...audio,
        content: `[base64_redacted_length_${audio.content.length}]`,
      },
    };
  };

  const lines: string[] = [
    "# Audio Speech Transcription Paid Route Verification",
    "",
    `- generated_at: ${now.toISOString()}`,
    `- benchmark_id: ${BENCHMARK_ID}`,
    `- canonical_input: ${JSON.stringify(CANONICAL_INPUT)}`,
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.provider}`);
    lines.push(`- benchmark_id: ${result.benchmark_id}`);
    lines.push(`- provider: ${result.provider}`);
    lines.push(`- endpoint: ${result.endpoint}`);
    lines.push(`- method: ${result.method}`);
    lines.push(`- canonical_input_hash: ${result.canonical_input_hash}`);
    lines.push(`- canonical_input: ${JSON.stringify(result.canonical_input)}`);
    lines.push(`- route_specific_body: ${JSON.stringify(summarizeRouteBody(result.route_specific_body))}`);
    lines.push(`- paid_execution_status: ${result.paid_execution_status}`);
    lines.push(`- cli_exit_code: ${result.cli_exit_code === null ? "null" : String(result.cli_exit_code)}`);
    lines.push(`- status_evidence: ${result.status_evidence}`);
    lines.push(`- normalized_output: ${JSON.stringify(result.normalized_output)}`);
    lines.push(`- transcript preview: ${result.transcript_preview}`);
    lines.push(`- expected_fragment_match_rate: ${result.expected_fragment_match_rate}`);
    lines.push(`- transcription_success: ${result.transcription_success}`);
    lines.push(`- language: ${result.language ?? "null"}`);
    lines.push(`- duration_seconds: ${result.duration_seconds ?? "null"}`);
    lines.push(`- confidence: ${result.confidence ?? "null"}`);
    lines.push(`- word_count: ${result.word_count ?? "null"}`);
    lines.push(`- caveat_objects: ${JSON.stringify(result.caveat_objects)}`);
    lines.push(`- evidence_health: ${result.evidence_health}`);
    lines.push(`- route_state: ${result.route_state}`);
    lines.push("");
  }

  lines.push("winner_claimed: false");
  lines.push("No 5-run benchmark artifact generated.");
  lines.push("No benchmark recorded claim.");

  return sanitizeProofMarkdown(lines.join("\n"));
}

export async function runAudioSpeechTranscriptionPaidVerification(
  executor: LiveExecutor = executeLivePayShCall,
  now = new Date(),
): Promise<VerifyAudioSpeechTranscriptionPaidResult> {
  const readinessText = await readTextIfExists(READINESS_NOTE_PATH);
  const researchText = await readTextIfExists(RESEARCH_PROOF_PATH);
  const selectedRoutes = selectComparableRoutesFromReadiness(readinessText ?? "");
  const fixture = await loadCanonicalAudioFixture();
  const schemaEvidenceConfirmed = await confirmComparableRouteSchemaEvidence(selectedRoutes);

  const gate = validateSafetyGate(process.env, {
    readinessText,
    researchConfirmed: Boolean(researchText && researchText.includes("audio-speech-transcription")),
    fixtureOk: fixture.fixtureOk,
    schemaEvidenceConfirmed,
    selectedRoutesCount: selectedRoutes.length,
  });
  if (!gate.ok) throw new Error(`Safety gate failed: ${gate.reason}`);

  const canonicalInputHash = hashCanonicalInput(CANONICAL_INPUT);
  const results: PaidRouteProof[] = [];
  for (const route of selectedRoutes) {
    results.push(await runPaidRoute(route, canonicalInputHash, fixture.base64, executor));
  }

  const datePart = now.toISOString().slice(0, 10);
  const proofPath = `live-proofs/audio-speech-transcription-paid-routes-${datePart}.md`;
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
  runAudioSpeechTranscriptionPaidVerification()
    .then((result) => {
      console.log(JSON.stringify({
        benchmark_id: result.benchmark_id,
        proof_path: result.proof_path,
        winner_claimed: result.winner_claimed,
        routes: result.attempted_routes.map((route) => ({
          provider: route.provider,
          endpoint: route.endpoint,
          paid_execution_status: route.paid_execution_status,
          expected_fragment_match_rate: route.expected_fragment_match_rate,
          transcription_success: route.transcription_success,
          route_state: route.route_state,
          evidence_health: route.evidence_health,
        })),
      }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
