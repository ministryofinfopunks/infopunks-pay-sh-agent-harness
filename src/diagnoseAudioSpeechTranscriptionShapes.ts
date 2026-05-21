import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveAudioSpeechTranscriptionEvidenceHealth,
  normalizeAudioSpeechTranscription,
  type AudioSpeechTranscriptionNormalizedOutput,
  type CanonicalAudioSpeechTranscriptionInput,
  type CaveatObject,
} from "./benchmarks/audioSpeechTranscriptionNormalization";

const BENCHMARK_ID = "audio-speech-transcription";
const PAY_SKILLS_DETAIL_DIR = path.join(os.homedir(), ".config/pay/skills/detail");
const FORBIDDEN_LANGUAGE = /\b(best|top|winner|loser|superiority)\b/i;
type RouteId = "solana-foundation/google/speech" | "solana-foundation/alibaba/speech";

interface RouteConfig {
  provider: string;
  endpoint: string;
  method: "POST";
  headers?: Record<string, string>;
}

const ROUTES: Record<RouteId, RouteConfig> = {
  "solana-foundation/google/speech": {
    provider: "Google Speech",
    endpoint: "https://speech.google.gateway-402.com/v1/speech:recognize",
    method: "POST" as const,
  },
  "solana-foundation/alibaba/speech": {
    provider: "Alibaba Speech",
    endpoint: "https://speech.alibaba.gateway-402.com/api/v1/services/audio/asr/transcription",
    method: "POST" as const,
    headers: { "X-DashScope-Async": "enable" },
  },
} as const;

const CANONICAL_INPUT: CanonicalAudioSpeechTranscriptionInput = {
  audio_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav",
  language: "en-US",
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

type VariantLabel =
  | "audio_url_only"
  | "audio_url_plus_language"
  | "audio_url_plus_encoding_LINEAR16"
  | "audio_url_plus_sampleRateHertz_22050"
  | "base64_audio_content_plus_encoding_LINEAR16"
  | "base64_audio_content_plus_sampleRateHertz_22050"
  | "languageCode_en_US";

export interface RequestVariant {
  route_id: RouteId;
  label: VariantLabel;
  body: Record<string, unknown>;
  supported: boolean;
  reason: string;
}

export interface FixtureMetadata {
  http_status: number | null;
  content_type: string | null;
  wav_pcm: boolean;
  bits_per_sample: number | null;
  channels: number | null;
  sample_rate_hz: number | null;
  size_bytes: number | null;
}

export interface RouteSchemaSummary {
  route_id: RouteId;
  detail_file: string | null;
  endpoint: string;
  supports_audio_url: boolean;
  supports_base64_content: boolean;
  supports_encoding_config: boolean;
  supports_sample_rate_config: boolean;
  supports_language_code_config: boolean;
  supports_model_config: boolean;
  file_format_constraints: string[];
}

export interface UnpaidProbeResult {
  route_id: RouteId;
  label: VariantLabel;
  supported: boolean;
  status_code: number | null;
  payment_challenge_detected: boolean;
  status_evidence: string;
  response_preview: string;
}

export interface PaidRouteRetry {
  route_id: RouteId;
  selected_body_label: VariantLabel;
  selected_body: Record<string, unknown>;
  paid_retry_attempted: boolean;
  paid_retry_count: 0 | 1;
  paid_execution_status: "succeeded" | "failed" | "skipped";
  cli_exit_code: number | null;
  status_evidence: string;
  normalized_output: AudioSpeechTranscriptionNormalizedOutput | null;
  transcript_preview: string;
  expected_fragment_match_rate: number;
  transcription_success: boolean;
  caveat_objects: CaveatObject[];
  evidence_health: AudioSpeechTranscriptionNormalizedOutput["evidence_health"];
  route_state: RouteState;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function paidExecutionEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.LIVE_PAYSH_EXECUTION === "true" && env.PAYSH_EXECUTION_MODE === "pay_cli";
}

function statusEvidence(statusCode: number | null, exitCode: number | null, errorReason?: string): string {
  if (statusCode !== null) return `status_code_observed_${statusCode}`;
  if (exitCode !== null) return errorReason ? `pay_cli_exit_${exitCode}_${errorReason}` : `pay_cli_exit_${exitCode}_status_unavailable`;
  return errorReason ? `status_unavailable_${errorReason}` : "status_unavailable";
}

function summarizeText(text: string | null): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export function isProofLanguageSafe(markdown: string): boolean {
  return !FORBIDDEN_LANGUAGE.test(markdown);
}

function parseWavMetadata(bytes: Buffer): Omit<FixtureMetadata, "http_status" | "content_type" | "size_bytes"> {
  const hasRiff = bytes.length >= 44 && bytes.subarray(0, 4).toString("ascii") === "RIFF";
  const hasWave = bytes.length >= 12 && bytes.subarray(8, 12).toString("ascii") === "WAVE";
  if (!hasRiff || !hasWave) {
    return {
      wav_pcm: false,
      bits_per_sample: null,
      channels: null,
      sample_rate_hz: null,
    };
  }

  const channels = bytes.readUInt16LE(22);
  const sampleRate = bytes.readUInt32LE(24);
  const bitsPerSample = bytes.readUInt16LE(34);
  const audioFormat = bytes.readUInt16LE(20);

  return {
    wav_pcm: audioFormat === 1,
    bits_per_sample: bitsPerSample,
    channels,
    sample_rate_hz: sampleRate,
  };
}

export async function loadFixtureMetadata(fetchLike: typeof fetch = fetch): Promise<{ metadata: FixtureMetadata; base64: string }> {
  try {
    const response = await fetchLike(CANONICAL_INPUT.audio_url, { method: "GET" });
    if (response.status !== 200) {
      return {
        metadata: {
          http_status: response.status,
          content_type: response.headers.get("content-type"),
          wav_pcm: false,
          bits_per_sample: null,
          channels: null,
          sample_rate_hz: null,
          size_bytes: null,
        },
        base64: "",
      };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const wav = parseWavMetadata(bytes);
    return {
      metadata: {
        http_status: response.status,
        content_type: response.headers.get("content-type"),
        size_bytes: bytes.length,
        ...wav,
      },
      base64: bytes.toString("base64"),
    };
  } catch {
    return {
      metadata: {
        http_status: null,
        content_type: null,
        wav_pcm: false,
        bits_per_sample: null,
        channels: null,
        sample_rate_hz: null,
        size_bytes: null,
      },
      base64: "",
    };
  }
}

async function loadRouteDetail(routeId: RouteId, detailDir = PAY_SKILLS_DETAIL_DIR): Promise<{ detail_file: string | null; json_text: string }> {
  try {
    const entries = await readdir(detailDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const abs = path.join(detailDir, entry.name);
      const raw = await readFile(abs, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (isObject(parsed) && parsed.fqn === routeId) {
        return { detail_file: abs, json_text: raw };
      }
    }
  } catch {
    return { detail_file: null, json_text: "" };
  }
  return { detail_file: null, json_text: "" };
}

function boolByText(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

export async function inspectRouteSchemaSummary(routeId: RouteId): Promise<RouteSchemaSummary> {
  const route = ROUTES[routeId];
  const detail = await loadRouteDetail(routeId);
  const text = detail.json_text;

  if (routeId === "solana-foundation/google/speech") {
    return {
      route_id: routeId,
      detail_file: detail.detail_file,
      endpoint: route.endpoint,
      supports_audio_url: boolByText(text, ["\"uri\"", "audio.uri", "gs://bucket_name/object_name"]),
      supports_base64_content: boolByText(text, ["\"content\"", "JSON representations use base64", "audio.content"]),
      supports_encoding_config: boolByText(text, ["\"encoding\"", "LINEAR16"]),
      supports_sample_rate_config: boolByText(text, ["sampleRateHertz"]),
      supports_language_code_config: boolByText(text, ["languageCode"]),
      supports_model_config: boolByText(text, ["\"model\"", "latest_short", "latest_long", "command_and_search"]),
      file_format_constraints: [
        "audio.content expects base64 bytes (WAV header included for LINEAR16)",
        "audio.uri field is Google Cloud Storage URI oriented (gs://...)",
      ],
    };
  }

  return {
    route_id: routeId,
    detail_file: detail.detail_file,
    endpoint: route.endpoint,
    supports_audio_url: boolByText(text, ["file_url"]),
    supports_base64_content: false,
    supports_encoding_config: false,
    supports_sample_rate_config: false,
    supports_language_code_config: boolByText(text, ["language_hints"]),
    supports_model_config: boolByText(text, ["qwen3-asr-flash-filetrans", "\"model\""]),
    file_format_constraints: [
      "AsrSubmitRequest schema requires input.file_url",
      "model enum restricted to qwen3-asr-flash-filetrans",
      "async submission requires X-DashScope-Async: enable",
    ],
  };
}

export function buildDiagnosticVariants(input: {
  route_id: RouteId;
  schema: RouteSchemaSummary;
  fixtureBase64: string;
}): RequestVariant[] {
  const { route_id: routeId, schema, fixtureBase64 } = input;

  if (routeId === "solana-foundation/google/speech") {
    const supportsAudioUrl = schema.supports_audio_url;
    const supportsB64 = schema.supports_base64_content;
    const supportsEncoding = schema.supports_encoding_config;
    const supportsSampleRate = schema.supports_sample_rate_config;
    const supportsLanguage = schema.supports_language_code_config;
    const supportsModel = schema.supports_model_config;

    const baseConfig: Record<string, unknown> = {};
    if (supportsLanguage) baseConfig.languageCode = "en-US";
    if (supportsModel) baseConfig.model = "latest_long";

    return [
      {
        route_id: routeId,
        label: "audio_url_only",
        body: { config: { ...baseConfig }, audio: { uri: CANONICAL_INPUT.audio_url } },
        supported: supportsAudioUrl,
        reason: supportsAudioUrl ? "audio.uri exists in schema" : "audio.uri not clearly supported",
      },
      {
        route_id: routeId,
        label: "audio_url_plus_language",
        body: { config: { ...baseConfig, languageCode: "en-US" }, audio: { uri: CANONICAL_INPUT.audio_url } },
        supported: supportsAudioUrl && supportsLanguage,
        reason: supportsAudioUrl && supportsLanguage ? "audio.uri + languageCode supported" : "audio.uri/languageCode not both supported",
      },
      {
        route_id: routeId,
        label: "audio_url_plus_encoding_LINEAR16",
        body: { config: { ...baseConfig, encoding: "LINEAR16" }, audio: { uri: CANONICAL_INPUT.audio_url } },
        supported: supportsAudioUrl && supportsEncoding,
        reason: supportsAudioUrl && supportsEncoding ? "audio.uri + encoding supported" : "audio.uri/encoding not both supported",
      },
      {
        route_id: routeId,
        label: "audio_url_plus_sampleRateHertz_22050",
        body: { config: { ...baseConfig, sampleRateHertz: 22050 }, audio: { uri: CANONICAL_INPUT.audio_url } },
        supported: supportsAudioUrl && supportsSampleRate,
        reason: supportsAudioUrl && supportsSampleRate ? "audio.uri + sampleRateHertz supported" : "audio.uri/sampleRateHertz not both supported",
      },
      {
        route_id: routeId,
        label: "base64_audio_content_plus_encoding_LINEAR16",
        body: { config: { ...baseConfig, encoding: "LINEAR16", sampleRateHertz: 22050 }, audio: { content: fixtureBase64 } },
        supported: supportsB64 && supportsEncoding,
        reason: supportsB64 && supportsEncoding ? "audio.content base64 + encoding supported" : "audio.content/encoding not both supported",
      },
      {
        route_id: routeId,
        label: "base64_audio_content_plus_sampleRateHertz_22050",
        body: { config: { ...baseConfig, sampleRateHertz: 22050 }, audio: { content: fixtureBase64 } },
        supported: supportsB64 && supportsSampleRate,
        reason: supportsB64 && supportsSampleRate ? "audio.content base64 + sampleRateHertz supported" : "audio.content/sampleRateHertz not both supported",
      },
      {
        route_id: routeId,
        label: "languageCode_en_US",
        body: { config: { ...baseConfig, languageCode: "en-US", encoding: "LINEAR16", sampleRateHertz: 22050 }, audio: { content: fixtureBase64 } },
        supported: supportsLanguage && supportsB64,
        reason: supportsLanguage && supportsB64 ? "languageCode + content supported" : "languageCode/content not both supported",
      },
    ];
  }

  return [
    {
      route_id: routeId,
      label: "audio_url_only",
      body: { model: "qwen3-asr-flash-filetrans", input: { file_url: CANONICAL_INPUT.audio_url } },
      supported: schema.supports_audio_url && schema.supports_model_config,
      reason: "input.file_url and model supported",
    },
    {
      route_id: routeId,
      label: "audio_url_plus_language",
      body: {
        model: "qwen3-asr-flash-filetrans",
        input: { file_url: CANONICAL_INPUT.audio_url },
        parameters: { language_hints: ["en-US"], enable_itn: true },
      },
      supported: schema.supports_audio_url && schema.supports_language_code_config && schema.supports_model_config,
      reason: "input.file_url + parameters.language_hints supported",
    },
    {
      route_id: routeId,
      label: "audio_url_plus_encoding_LINEAR16",
      body: {
        model: "qwen3-asr-flash-filetrans",
        input: { file_url: CANONICAL_INPUT.audio_url },
        parameters: { language_hints: ["en-US"], enable_itn: true },
      },
      supported: false,
      reason: "encoding field not in schema",
    },
    {
      route_id: routeId,
      label: "audio_url_plus_sampleRateHertz_22050",
      body: {
        model: "qwen3-asr-flash-filetrans",
        input: { file_url: CANONICAL_INPUT.audio_url },
        parameters: { language_hints: ["en-US"], enable_itn: true },
      },
      supported: false,
      reason: "sampleRateHertz field not in schema",
    },
    {
      route_id: routeId,
      label: "base64_audio_content_plus_encoding_LINEAR16",
      body: {
        model: "qwen3-asr-flash-filetrans",
        input: { file_url: CANONICAL_INPUT.audio_url },
        parameters: { language_hints: ["en-US"], enable_itn: true },
      },
      supported: false,
      reason: "base64 content field not defined in AsrSubmitRequest",
    },
    {
      route_id: routeId,
      label: "base64_audio_content_plus_sampleRateHertz_22050",
      body: {
        model: "qwen3-asr-flash-filetrans",
        input: { file_url: CANONICAL_INPUT.audio_url },
        parameters: { language_hints: ["en-US"], enable_itn: true },
      },
      supported: false,
      reason: "base64 content/sampleRateHertz not defined in schema",
    },
    {
      route_id: routeId,
      label: "languageCode_en_US",
      body: {
        model: "qwen3-asr-flash-filetrans",
        input: { file_url: CANONICAL_INPUT.audio_url },
        parameters: { language_hints: ["en-US"], enable_itn: true },
      },
      supported: schema.supports_language_code_config,
      reason: "language_hints equivalent available via parameters",
    },
  ];
}

export function selectPaidRetryBody(variants: RequestVariant[]): RequestVariant {
  const supported = variants.filter((v) => v.supported);
  const rank: VariantLabel[] = [
    "base64_audio_content_plus_encoding_LINEAR16",
    "base64_audio_content_plus_sampleRateHertz_22050",
    "languageCode_en_US",
    "audio_url_plus_language",
    "audio_url_plus_encoding_LINEAR16",
    "audio_url_plus_sampleRateHertz_22050",
    "audio_url_only",
  ];

  for (const label of rank) {
    const found = supported.find((v) => v.label === label);
    if (found) return found;
  }

  return variants[0] ?? {
    route_id: "solana-foundation/google/speech",
    label: "audio_url_only",
    body: {},
    supported: false,
    reason: "fallback",
  };
}

export function deriveRouteState(input: { paidCallSuccess: boolean; normalized: AudioSpeechTranscriptionNormalizedOutput; caveats: CaveatObject[] }): RouteState {
  const hardReject = input.caveats.some((c) => c.code === "route_not_found" || c.code === "method_not_allowed" || c.code === "auth_required");
  if (hardReject) return "rejected";
  if (input.paidCallSuccess && input.normalized.transcription_success && input.normalized.transcript_fragments_detected.length >= 2) return "verified/proven";
  return "candidate/unproven";
}

export function unpaidRouteState(): RouteState {
  return "candidate/unproven";
}

async function unpaidProbe(routeId: RouteId, variant: RequestVariant): Promise<UnpaidProbeResult> {
  if (!variant.supported) {
    return {
      route_id: routeId,
      label: variant.label,
      supported: false,
      status_code: null,
      payment_challenge_detected: false,
      status_evidence: "unsupported_variant_not_probed",
      response_preview: variant.reason,
    };
  }

  const route = ROUTES[routeId];

  try {
    const response = await fetch(route.endpoint, {
      method: route.method,
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        ...(route.headers ?? {}),
      },
      body: JSON.stringify(variant.body),
    });
    const bodyText = await response.text();
    return {
      route_id: routeId,
      label: variant.label,
      supported: true,
      status_code: response.status,
      payment_challenge_detected: response.status === 402 || Boolean(response.headers.get("payment-required") || response.headers.get("www-authenticate")),
      status_evidence: `status_code_observed_${response.status}`,
      response_preview: bodyText.slice(0, 280),
    };
  } catch (error) {
    return {
      route_id: routeId,
      label: variant.label,
      supported: true,
      status_code: null,
      payment_challenge_detected: false,
      status_evidence: `probe_error_${error instanceof Error ? error.message : String(error)}`,
      response_preview: "",
    };
  }
}

function adaptForAlibabaSubmitPayload(payload: unknown): unknown {
  if (!isObject(payload)) return payload;
  const output = isObject(payload.output) ? payload.output : {};
  const transcriptionUrl = isObject(output.result) && typeof output.result.transcription_url === "string" ? output.result.transcription_url : null;
  return {
    ...payload,
    transcript: transcriptionUrl ?? payload.transcript,
    language: "en-US",
    audio_url: CANONICAL_INPUT.audio_url,
  };
}

async function runPaidRetry(routeId: RouteId, variant: RequestVariant): Promise<PaidRouteRetry> {
  const route = ROUTES[routeId];
  const callInput: ExecuteLivePayShCallInput = {
    providerId: routeId,
    intent: BENCHMARK_ID,
    endpointUrl: route.endpoint,
    method: route.method,
    bodyJson: variant.body,
    headers: {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      ...(route.headers ?? {}),
    },
  };

  const paid = await executeLivePayShCall(callInput);
  const paidSucceeded = paid.success;
  const evidence = statusEvidence(paid.statusCode ?? null, paid.exitCode ?? null, paid.errorReason);
  const parsed = routeId === "solana-foundation/alibaba/speech" && paid.parsedJsonAvailable
    ? adaptForAlibabaSubmitPayload(paid.parsedJson ?? {})
    : (paid.parsedJsonAvailable ? paid.parsedJson ?? {} : paid.responsePreview);

  const normalizedResult = normalizeAudioSpeechTranscription({
    parsedJson: parsed,
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
    successfulWordCounts: paidSucceeded ? [normalizedResult.normalized.word_count ?? 0] : [],
    latest: normalizedResult,
  });

  const merged: AudioSpeechTranscriptionNormalizedOutput = {
    ...normalizedResult.normalized,
    evidence_health: evidenceHealth,
    caveat_objects: normalizedResult.caveat_objects,
  };

  return {
    route_id: routeId,
    selected_body_label: variant.label,
    selected_body: variant.body,
    paid_retry_attempted: true,
    paid_retry_count: 1,
    paid_execution_status: paidSucceeded ? "succeeded" : "failed",
    cli_exit_code: paid.exitCode ?? null,
    status_evidence: evidence,
    normalized_output: merged,
    transcript_preview: summarizeText(merged.transcript),
    expected_fragment_match_rate: merged.expected_fragment_match_rate,
    transcription_success: merged.transcription_success,
    caveat_objects: normalizedResult.caveat_objects,
    evidence_health: evidenceHealth,
    route_state: deriveRouteState({ paidCallSuccess: paidSucceeded, normalized: merged, caveats: normalizedResult.caveat_objects }),
  };
}

function skippedPaidRetry(routeId: RouteId, variant: RequestVariant): PaidRouteRetry {
  return {
    route_id: routeId,
    selected_body_label: variant.label,
    selected_body: variant.body,
    paid_retry_attempted: false,
    paid_retry_count: 0,
    paid_execution_status: "skipped",
    cli_exit_code: null,
    status_evidence: "paid_retry_skipped_env_gate_not_satisfied",
    normalized_output: null,
    transcript_preview: "",
    expected_fragment_match_rate: 0,
    transcription_success: false,
    caveat_objects: [],
    evidence_health: "unverified",
    route_state: "candidate/unproven",
  };
}

export function renderProofMarkdown(input: {
  now: Date;
  fixture_metadata: FixtureMetadata;
  route_summaries: RouteSchemaSummary[];
  unpaid_variants: UnpaidProbeResult[];
  paid_results: PaidRouteRetry[];
}): string {
  const summarizeBody = (body: Record<string, unknown>): Record<string, unknown> => {
    const audio = body.audio;
    if (!isObject(audio) || typeof audio.content !== "string") {
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

  const datePart = input.now.toISOString().slice(0, 10);
  const lines: string[] = [
    `# Audio Speech Transcription Shape Diagnostic (${datePart})`,
    "",
    `- benchmark_id: ${BENCHMARK_ID}`,
    `- canonical_input: ${JSON.stringify(CANONICAL_INPUT)}`,
    `- canonical_phrase: INFOPUNKS RADAR | EVIDENCE BEFORE SPEND | AUDIO BENCHMARK 001`,
    `- fixture_metadata: ${JSON.stringify(input.fixture_metadata)}`,
    "",
    "## Route Metadata Summary",
  ];

  for (const summary of input.route_summaries) {
    lines.push(`- route_id: ${summary.route_id}`);
    lines.push(`  provider: ${ROUTES[summary.route_id].provider}`);
    lines.push(`  detail_file: ${summary.detail_file ?? "not_found"}`);
    lines.push(`  endpoint: ${summary.endpoint}`);
    lines.push(`  supports_audio_url: ${String(summary.supports_audio_url)}`);
    lines.push(`  supports_base64_content: ${String(summary.supports_base64_content)}`);
    lines.push(`  supports_encoding_config: ${String(summary.supports_encoding_config)}`);
    lines.push(`  supports_sample_rate_config: ${String(summary.supports_sample_rate_config)}`);
    lines.push(`  supports_language_code_config: ${String(summary.supports_language_code_config)}`);
    lines.push(`  supports_model_config: ${String(summary.supports_model_config)}`);
    lines.push(`  file_format_constraints: ${JSON.stringify(summary.file_format_constraints)}`);
  }

  lines.push("", "## Unpaid Variants Tested");
  for (const row of input.unpaid_variants) {
    lines.push(
      `- route=${row.route_id} variant=${row.label} supported=${String(row.supported)} status_code=${row.status_code === null ? "null" : String(row.status_code)} payment_challenge_detected=${String(row.payment_challenge_detected)} status_evidence=${row.status_evidence}`,
    );
  }

  lines.push("", "## Paid Retry");
  for (const result of input.paid_results) {
    lines.push(`### ${ROUTES[result.route_id].provider}`);
    lines.push(`- selected_paid_retry_body: ${JSON.stringify(summarizeBody(result.selected_body))}`);
    lines.push(`- paid_retry_attempted: ${String(result.paid_retry_attempted)}`);
    lines.push(`- paid_retry_count: ${result.paid_retry_count}`);
    lines.push(`- paid_execution_status: ${result.paid_execution_status}`);
    lines.push(`- cli_exit_code: ${result.cli_exit_code === null ? "null" : String(result.cli_exit_code)}`);
    lines.push(`- status_evidence: ${result.status_evidence}`);
    lines.push(`- normalized_output: ${JSON.stringify(result.normalized_output)}`);
    lines.push(`- transcript preview: ${result.transcript_preview}`);
    lines.push(`- expected_fragment_match_rate: ${result.expected_fragment_match_rate}`);
    lines.push(`- transcription_success: ${result.transcription_success}`);
    lines.push(`- caveat_objects: ${JSON.stringify(result.caveat_objects)}`);
    lines.push(`- evidence_health: ${result.evidence_health}`);
    lines.push(`- route_state: ${result.route_state}`);
  }

  lines.push("", "## Guardrails");
  lines.push("- benchmark_artifact_created: false");
  lines.push("- benchmark_record_marked: false");
  lines.push("- comparison_claim_made: false");

  lines.push("", "## Conclusion");
  for (const result of input.paid_results) {
    lines.push(`- ${result.route_id}: ${result.route_state}`);
  }

  const markdown = sanitizeProofMarkdown(lines.join("\n"));
  if (!isProofLanguageSafe(markdown)) {
    throw new Error("Proof includes prohibited comparison language.");
  }
  return markdown;
}

export async function runAudioSpeechTranscriptionShapeDiagnostic(now = new Date()): Promise<{ proof_path: string; paid_results: PaidRouteRetry[] }> {
  const fixture = await loadFixtureMetadata();
  const routeIds = Object.keys(ROUTES) as RouteId[];
  const routeSummaries = await Promise.all(routeIds.map((routeId) => inspectRouteSchemaSummary(routeId)));

  const variantsByRoute = new Map<RouteId, RequestVariant[]>();
  for (let i = 0; i < routeIds.length; i += 1) {
    const routeId = routeIds[i]!;
    const summary = routeSummaries[i]!;
    variantsByRoute.set(routeId, buildDiagnosticVariants({ route_id: routeId, schema: summary, fixtureBase64: fixture.base64 }));
  }

  const unpaidRows: UnpaidProbeResult[] = [];
  for (const routeId of routeIds) {
    const variants = variantsByRoute.get(routeId) ?? [];
    for (const variant of variants) {
      unpaidRows.push(await unpaidProbe(routeId, variant));
    }
  }

  const paidEnabled = paidExecutionEnabled(process.env);
  const paidResults: PaidRouteRetry[] = [];

  for (const routeId of routeIds) {
    const variants = variantsByRoute.get(routeId) ?? [];
    const selected = selectPaidRetryBody(variants);
    if (paidEnabled) {
      paidResults.push(await runPaidRetry(routeId, selected));
    } else {
      paidResults.push(skippedPaidRetry(routeId, selected));
    }
  }

  const markdown = renderProofMarkdown({
    now,
    fixture_metadata: fixture.metadata,
    route_summaries: routeSummaries,
    unpaid_variants: unpaidRows,
    paid_results: paidResults,
  });

  const datePart = now.toISOString().slice(0, 10);
  const proofPath = `live-proofs/audio-speech-transcription-shape-diagnostic-${datePart}.md`;
  const out = path.resolve(process.cwd(), proofPath);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${markdown}\n`, "utf8");

  return { proof_path: proofPath, paid_results: paidResults };
}

if (require.main === module) {
  runAudioSpeechTranscriptionShapeDiagnostic()
    .then((result) => {
      console.log(JSON.stringify({
        benchmark_id: BENCHMARK_ID,
        proof_path: result.proof_path,
        paid_routes: result.paid_results.map((r) => ({
          route_id: r.route_id,
          paid_retry_attempted: r.paid_retry_attempted,
          paid_retry_count: r.paid_retry_count,
          paid_execution_status: r.paid_execution_status,
          expected_fragment_match_rate: r.expected_fragment_match_rate,
          transcription_success: r.transcription_success,
          evidence_health: r.evidence_health,
          route_state: r.route_state,
        })),
      }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
