export interface CanonicalAudioSpeechTranscriptionInput {
  audio_url: string;
  language: string;
  expected_text_fragments: string[];
  accepted_alternates?: Record<string, string[]>;
}

export type AudioSpeechTranscriptionCaveatCode =
  | "transcription_text_partial"
  | "expected_fragments_missing"
  | "audio_input_unconfirmed"
  | "no_transcript_detected"
  | "confidence_missing"
  | "duration_missing"
  | "language_unconfirmed"
  | "word_timestamps_missing"
  | "payment_required_confirmed_only"
  | "paid_payload_unobserved"
  | "non_json_text_response"
  | "status_code_unavailable"
  | "route_not_found"
  | "method_not_allowed"
  | "auth_required"
  | "unsupported_audio_format"
  | "audio_fixture_mime_x_wav";

export type CaveatSeverity = "info" | "warning" | "error";
export type EvidenceHealth = "recorded" | "caveated" | "degraded" | "unverified" | "scaffold";

export interface CaveatObject {
  code: AudioSpeechTranscriptionCaveatCode;
  severity: CaveatSeverity;
  affects_core_semantics: boolean;
  detail: string;
}

export interface AudioSpeechTranscriptionNormalizedOutput {
  transcript: string | null;
  transcript_fragments_detected: string[];
  expected_fragment_match_rate: number;
  transcription_success: boolean;
  language: string | null;
  duration_seconds: number | null;
  confidence: number | null;
  word_count: number | null;
  status_evidence: string;
  raw_status_code: number | null;
  caveat_objects: CaveatObject[];
  evidence_health: EvidenceHealth;
}

export interface NormalizeAudioSpeechTranscriptionInput {
  parsedJson: unknown;
  responsePreview?: string;
  statusCode?: number | null;
  statusEvidence?: string;
  paidExecutionObserved?: boolean;
  canonicalInput?: CanonicalAudioSpeechTranscriptionInput;
}

export interface NormalizeAudioSpeechTranscriptionResult {
  normalized: AudioSpeechTranscriptionNormalizedOutput;
  caveat_objects: CaveatObject[];
}

export interface AudioSpeechTranscriptionEvidenceHealthInput {
  researchOnly?: boolean;
  paidAttempts?: number;
  paidSuccesses?: number;
  paidFailures?: number;
  successfulWordCounts?: number[];
  latest?: NormalizeAudioSpeechTranscriptionResult;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return normalizeWhitespace(value)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addCaveat(list: CaveatObject[], code: AudioSpeechTranscriptionCaveatCode, detail: string): void {
  if (list.some((entry) => entry.code === code)) {
    return;
  }

  const severityByCode: Record<AudioSpeechTranscriptionCaveatCode, CaveatSeverity> = {
    transcription_text_partial: "warning",
    expected_fragments_missing: "warning",
    audio_input_unconfirmed: "warning",
    no_transcript_detected: "warning",
    confidence_missing: "warning",
    duration_missing: "warning",
    language_unconfirmed: "warning",
    word_timestamps_missing: "warning",
    payment_required_confirmed_only: "info",
    paid_payload_unobserved: "warning",
    non_json_text_response: "warning",
    status_code_unavailable: "warning",
    route_not_found: "error",
    method_not_allowed: "error",
    auth_required: "error",
    unsupported_audio_format: "warning",
    audio_fixture_mime_x_wav: "info",
  };

  const affectsCoreByCode: Record<AudioSpeechTranscriptionCaveatCode, boolean> = {
    transcription_text_partial: true,
    expected_fragments_missing: true,
    audio_input_unconfirmed: false,
    no_transcript_detected: true,
    confidence_missing: false,
    duration_missing: false,
    language_unconfirmed: false,
    word_timestamps_missing: false,
    payment_required_confirmed_only: false,
    paid_payload_unobserved: true,
    non_json_text_response: true,
    status_code_unavailable: false,
    route_not_found: true,
    method_not_allowed: true,
    auth_required: true,
    unsupported_audio_format: false,
    audio_fixture_mime_x_wav: false,
  };

  list.push({
    code,
    severity: severityByCode[code],
    affects_core_semantics: affectsCoreByCode[code],
    detail,
  });
}

function collectStringsByPath(parsedJson: unknown, path: string[]): string[] {
  const out: string[] = [];
  let nodes: unknown[] = [parsedJson];

  for (const key of path) {
    const nextNodes: unknown[] = [];
    for (const node of nodes) {
      if (Array.isArray(node)) {
        for (const item of node) {
          if (isObject(item) && key in item) {
            nextNodes.push(item[key]);
          }
        }
      } else if (isObject(node) && key in node) {
        nextNodes.push(node[key]);
      }
    }
    nodes = nextNodes;
  }

  for (const node of nodes) {
    if (typeof node === "string") {
      const text = asNonEmptyString(node);
      if (text) {
        out.push(text);
      }
    } else if (Array.isArray(node)) {
      for (const item of node) {
        const text = asNonEmptyString(item);
        if (text) {
          out.push(text);
        }
      }
    }
  }

  return out;
}

function extractTranscript(parsedJson: unknown): string | null {
  if (typeof parsedJson === "string") {
    return asNonEmptyString(parsedJson);
  }

  if (!isObject(parsedJson)) {
    return null;
  }

  const candidates: string[] = [];

  const scalarFields = [
    asNonEmptyString(parsedJson.transcript),
    asNonEmptyString(parsedJson.text),
    asNonEmptyString(parsedJson.transcription),
    isObject(parsedJson.result) ? asNonEmptyString((parsedJson.result as Record<string, unknown>).text) : null,
    isObject(parsedJson.data) ? asNonEmptyString((parsedJson.data as Record<string, unknown>).text) : null,
    isObject(parsedJson.data) ? asNonEmptyString((parsedJson.data as Record<string, unknown>).transcript) : null,
    isObject(parsedJson.output) ? asNonEmptyString((parsedJson.output as Record<string, unknown>).text) : null,
  ];
  for (const value of scalarFields) {
    if (value) {
      candidates.push(value);
    }
  }

  candidates.push(...collectStringsByPath(parsedJson, ["results", "transcript"]));
  candidates.push(...collectStringsByPath(parsedJson, ["results", "text"]));
  candidates.push(...collectStringsByPath(parsedJson, ["alternatives", "transcript"]));
  candidates.push(...collectStringsByPath(parsedJson, ["channels", "alternatives", "transcript"]));
  candidates.push(...collectStringsByPath(parsedJson, ["segments", "text"]));

  if (candidates.length > 0) {
    return normalizeWhitespace(candidates.join(" "));
  }

  const words = collectStringsByPath(parsedJson, ["words", "word"]);
  if (words.length > 0) {
    return normalizeWhitespace(words.join(" "));
  }

  return null;
}

function deepFindFirstString(obj: unknown, keys: string[]): string | null {
  if (!isObject(obj)) {
    return null;
  }
  const lowered = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [obj];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current)) {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (lowered.has(key.toLowerCase())) {
        const found = asNonEmptyString(value);
        if (found) {
          return found;
        }
      }

      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return null;
}

function deepFindFirstNumber(obj: unknown, keys: string[]): number | null {
  if (!isObject(obj)) {
    return null;
  }
  const lowered = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [obj];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current)) {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (lowered.has(key.toLowerCase())) {
        const found = asFiniteNumber(value);
        if (found !== null) {
          return found;
        }
      }

      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return null;
}

function detectWordsWithTimestamps(parsedJson: unknown): boolean {
  if (!isObject(parsedJson)) {
    return false;
  }
  const words = (parsedJson.words ?? (isObject(parsedJson.data) ? (parsedJson.data as Record<string, unknown>).words : null));
  if (!Array.isArray(words) || words.length === 0) {
    return false;
  }

  return words.some((entry) => {
    if (!isObject(entry)) {
      return false;
    }
    const start = asFiniteNumber(entry.start) ?? asFiniteNumber(entry.start_time) ?? asFiniteNumber(entry.startTime);
    const end = asFiniteNumber(entry.end) ?? asFiniteNumber(entry.end_time) ?? asFiniteNumber(entry.endTime);
    return start !== null || end !== null;
  });
}

function detectWordCount(parsedJson: unknown, transcript: string | null): number | null {
  if (isObject(parsedJson)) {
    const explicit = deepFindFirstNumber(parsedJson, ["word_count", "wordCount", "num_words", "words_count"]);
    if (explicit !== null) {
      return explicit;
    }

    const words = parsedJson.words;
    if (Array.isArray(words)) {
      return words.filter((entry) => isObject(entry) && asNonEmptyString(entry.word)).length;
    }
  }

  if (!transcript) {
    return null;
  }

  const count = normalizeWhitespace(transcript).split(" ").filter((part) => part.length > 0).length;
  return count > 0 ? count : null;
}

function resolveAlternatesForFragment(fragment: string, canonicalInput?: CanonicalAudioSpeechTranscriptionInput): string[] {
  const fromInput = canonicalInput?.accepted_alternates?.[fragment] ?? [];
  if (normalizeForMatch(fragment) === normalizeForMatch("AUDIO BENCHMARK 001")) {
    return [fragment, ...fromInput, "AUDIO BENCHMARK ZERO ZERO ONE", "AUDIO BENCHMARK DOUBLE ZERO ONE", "AUDIO BENCHMARK O O ONE"];
  }
  return [fragment, ...fromInput];
}

export function normalizeAudioSpeechTranscription(input: NormalizeAudioSpeechTranscriptionInput): NormalizeAudioSpeechTranscriptionResult {
  const caveatObjects: CaveatObject[] = [];

  const rawStatusCode = typeof input.statusCode === "number" ? input.statusCode : null;
  const statusEvidence = input.statusEvidence ?? (rawStatusCode !== null ? `http_status_${rawStatusCode}` : "status_unavailable");

  const transcript = extractTranscript(input.parsedJson);
  const language = isObject(input.parsedJson)
    ? asNonEmptyString(input.parsedJson.language) ?? deepFindFirstString(input.parsedJson, ["language", "lang", "detected_language"])
    : null;
  const durationSeconds = isObject(input.parsedJson)
    ? deepFindFirstNumber(input.parsedJson, ["duration_seconds", "duration", "audio_duration_seconds", "duration_sec"])
    : null;
  const confidence = isObject(input.parsedJson)
    ? deepFindFirstNumber(input.parsedJson, ["confidence", "avg_confidence", "transcription_confidence"])
    : null;

  const normalizedTranscript = transcript ? normalizeForMatch(transcript) : "";

  const expected = input.canonicalInput?.expected_text_fragments ?? [];
  const transcriptFragmentsDetected: string[] = [];
  for (const fragment of expected) {
    const alternates = resolveAlternatesForFragment(fragment, input.canonicalInput);
    const matched = alternates.some((candidate) => {
      const normalizedCandidate = normalizeForMatch(candidate);
      return normalizedCandidate.length > 0 && normalizedTranscript.includes(normalizedCandidate);
    });
    if (matched) {
      transcriptFragmentsDetected.push(fragment);
    }
  }

  const expectedFragmentMatchRate = expected.length > 0
    ? Number((transcriptFragmentsDetected.length / expected.length).toFixed(4))
    : 0;
  const minRequired = Math.min(2, expected.length);
  const transcriptionSuccess = expected.length > 0
    ? transcriptFragmentsDetected.length >= minRequired
    : transcript !== null;

  const wordCount = detectWordCount(input.parsedJson, transcript);

  if (rawStatusCode === null) {
    addCaveat(caveatObjects, "status_code_unavailable", "HTTP status code was not available in execution output.");
  }

  if (rawStatusCode === 402) {
    addCaveat(caveatObjects, "payment_required_confirmed_only", "Unpaid payment challenge observed (HTTP 402). Transcription payload remains unobserved.");
    addCaveat(caveatObjects, "paid_payload_unobserved", "Paid execution payload was not observed for this route.");
  }
  if (rawStatusCode === 404) {
    addCaveat(caveatObjects, "route_not_found", "Route returned HTTP 404 (not found).");
  }
  if (rawStatusCode === 405) {
    addCaveat(caveatObjects, "method_not_allowed", "Route returned HTTP 405 (method not allowed).");
  }
  if (rawStatusCode === 401 || rawStatusCode === 403) {
    addCaveat(caveatObjects, "auth_required", "Route requires authentication or authorization.");
  }

  if (typeof input.parsedJson === "string") {
    addCaveat(caveatObjects, "non_json_text_response", "Response payload was plain text and not structured JSON.");
  }

  if (!transcript) {
    addCaveat(caveatObjects, "no_transcript_detected", "No transcript text was detected in the response payload.");
  }

  if (expected.length > 0 && transcriptFragmentsDetected.length < expected.length) {
    addCaveat(caveatObjects, "expected_fragments_missing", "One or more expected transcript fragments were not detected.");
  }
  if (transcript && expected.length > 0 && transcriptFragmentsDetected.length > 0 && transcriptFragmentsDetected.length < expected.length) {
    addCaveat(caveatObjects, "transcription_text_partial", "Transcript was detected but expected phrase coverage is partial.");
  }

  if (confidence === null) {
    addCaveat(caveatObjects, "confidence_missing", "Transcription confidence was not present in the response.");
  }
  if (durationSeconds === null) {
    addCaveat(caveatObjects, "duration_missing", "Audio duration was not present in the response.");
  }
  if (!language) {
    addCaveat(caveatObjects, "language_unconfirmed", "Language was not confirmed in the response payload.");
  }

  if (!detectWordsWithTimestamps(input.parsedJson)) {
    addCaveat(caveatObjects, "word_timestamps_missing", "Word-level timestamps were not present in the response payload.");
  }

  if (input.canonicalInput && isObject(input.parsedJson)) {
    const echoedAudioUrl = deepFindFirstString(input.parsedJson, ["audio_url", "audioUrl", "input_audio_url", "source_url"]);
    if (!echoedAudioUrl || normalizeWhitespace(echoedAudioUrl) !== normalizeWhitespace(input.canonicalInput.audio_url)) {
      addCaveat(caveatObjects, "audio_input_unconfirmed", "Response does not clearly echo the canonical audio fixture URL.");
    }
  }

  if (isObject(input.parsedJson)) {
    const mime = deepFindFirstString(input.parsedJson, ["content_type", "contentType", "mime_type", "mime"]);
    if (mime) {
      const normalizedMime = mime.toLowerCase();
      if (normalizedMime.includes("audio/x-wav")) {
        addCaveat(caveatObjects, "audio_fixture_mime_x_wav", "Fixture MIME observed as audio/x-wav.");
      }
      if (normalizedMime.includes("audio/") && !normalizedMime.includes("wav")) {
        addCaveat(caveatObjects, "unsupported_audio_format", "Audio MIME does not appear to be WAV for the canonical fixture.");
      }
    }
  }

  if (input.paidExecutionObserved === false) {
    addCaveat(caveatObjects, "paid_payload_unobserved", "Paid execution payload was not observed for this route.");
  }

  const normalized: AudioSpeechTranscriptionNormalizedOutput = {
    transcript,
    transcript_fragments_detected: transcriptFragmentsDetected,
    expected_fragment_match_rate: expectedFragmentMatchRate,
    transcription_success: transcriptionSuccess,
    language,
    duration_seconds: durationSeconds,
    confidence,
    word_count: wordCount,
    status_evidence: statusEvidence,
    raw_status_code: rawStatusCode,
    caveat_objects: caveatObjects,
    evidence_health: "caveated",
  };

  return {
    normalized,
    caveat_objects: caveatObjects,
  };
}

export function deriveAudioSpeechTranscriptionEvidenceHealth(input: AudioSpeechTranscriptionEvidenceHealthInput): EvidenceHealth {
  if (input.researchOnly) {
    return "scaffold";
  }

  const paidSuccesses = input.paidSuccesses ?? 0;
  const paidFailures = input.paidFailures ?? 0;

  if (paidSuccesses <= 0) {
    return "unverified";
  }

  const latest = input.latest;
  const latestWordCount = latest?.normalized.word_count ?? null;
  const hasZeroTranscriptAcrossSuccesses = (input.successfulWordCounts ?? []).length > 0 &&
    (input.successfulWordCounts ?? []).every((count) => count <= 0);

  if (paidFailures >= 2 || hasZeroTranscriptAcrossSuccesses || latestWordCount === 0) {
    return "degraded";
  }

  const hardReject = latest?.caveat_objects.some((c) =>
    c.code === "route_not_found" ||
    c.code === "method_not_allowed" ||
    c.code === "auth_required" ||
    c.code === "no_transcript_detected" ||
    c.code === "expected_fragments_missing"
  ) ?? false;

  if (hardReject) {
    return "degraded";
  }

  const caveatedCodes = new Set<AudioSpeechTranscriptionCaveatCode>([
    "confidence_missing",
    "duration_missing",
    "language_unconfirmed",
    "status_code_unavailable",
    "audio_input_unconfirmed",
    "word_timestamps_missing",
    "transcription_text_partial",
  ]);

  const hasCaveatedSignals = latest?.caveat_objects.some((c) => caveatedCodes.has(c.code)) ?? true;
  if (hasCaveatedSignals || !latest?.normalized.transcription_success) {
    return "caveated";
  }

  return "recorded";
}
