import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildDiagnosticVariants,
  deriveRouteState,
  isProofLanguageSafe,
  renderProofMarkdown,
  selectPaidRetryBody,
  unpaidRouteState,
  type RouteSchemaSummary,
} from "./diagnoseAudioSpeechTranscriptionShapes";
import type { AudioSpeechTranscriptionNormalizedOutput } from "./benchmarks/audioSpeechTranscriptionNormalization";

function normalized(overrides: Partial<AudioSpeechTranscriptionNormalizedOutput> = {}): AudioSpeechTranscriptionNormalizedOutput {
  return {
    transcript: null,
    transcript_fragments_detected: [],
    expected_fragment_match_rate: 0,
    transcription_success: false,
    language: "en-US",
    duration_seconds: null,
    confidence: null,
    word_count: 0,
    status_evidence: "status_code_observed_200",
    raw_status_code: 200,
    caveat_objects: [],
    evidence_health: "degraded",
    ...overrides,
  };
}

test("package script exists", async () => {
  const pkg = JSON.parse(await readFile(path.resolve(process.cwd(), "package.json"), "utf8")) as { scripts?: Record<string, string> };
  assert.equal(pkg.scripts?.["diagnose:audio-speech-transcription-shapes"], "tsx src/diagnoseAudioSpeechTranscriptionShapes.ts");
});

test("chooses at most one paid retry body per route", () => {
  const schema: RouteSchemaSummary = {
    route_id: "solana-foundation/google/speech",
    detail_file: "/tmp/detail.json",
    endpoint: "https://speech.google.gateway-402.com/v1/speech:recognize",
    supports_audio_url: true,
    supports_base64_content: true,
    supports_encoding_config: true,
    supports_sample_rate_config: true,
    supports_language_code_config: true,
    supports_model_config: true,
    file_format_constraints: [],
  };
  const variants = buildDiagnosticVariants({ route_id: schema.route_id, schema, fixtureBase64: "AAA=" });
  const selected = selectPaidRetryBody(variants);
  assert.ok(selected);
  assert.equal(variants.filter((v) => v.label === selected.label).length, 1);
});

test("unpaid probes do not promote route", () => {
  assert.equal(unpaidRouteState(), "candidate/unproven");
});

test("zero transcript remains candidate/unproven", () => {
  const state = deriveRouteState({
    paidCallSuccess: true,
    normalized: normalized(),
    caveats: [],
  });
  assert.equal(state, "candidate/unproven");
});

test("valid transcript becomes verified/proven", () => {
  const state = deriveRouteState({
    paidCallSuccess: true,
    normalized: normalized({
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      transcript_fragments_detected: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "AUDIO BENCHMARK 001"],
      expected_fragment_match_rate: 1,
      transcription_success: true,
      word_count: 8,
      evidence_health: "recorded",
    }),
    caveats: [],
  });
  assert.equal(state, "verified/proven");
});

test("no benchmark artifact or winner claim", () => {
  const markdown = renderProofMarkdown({
    now: new Date("2026-05-21T00:00:00.000Z"),
    fixture_metadata: {
      http_status: 200,
      content_type: "audio/x-wav",
      wav_pcm: true,
      bits_per_sample: 16,
      channels: 1,
      sample_rate_hz: 22050,
      size_bytes: 224258,
    },
    route_summaries: [],
    unpaid_variants: [],
    paid_results: [],
  });
  assert.match(markdown, /benchmark_artifact_created: false/);
  assert.match(markdown, /benchmark_record_marked: false/);
  assert.match(markdown, /comparison_claim_made: false/);
  assert.doesNotMatch(markdown, /winner_claimed/i);
});

test("proof safe output", () => {
  const markdown = renderProofMarkdown({
    now: new Date("2026-05-21T00:00:00.000Z"),
    fixture_metadata: {
      http_status: 200,
      content_type: "audio/x-wav",
      wav_pcm: true,
      bits_per_sample: 16,
      channels: 1,
      sample_rate_hz: 22050,
      size_bytes: 224258,
    },
    route_summaries: [],
    unpaid_variants: [
      {
        route_id: "solana-foundation/google/speech",
        label: "audio_url_only",
        supported: true,
        status_code: 402,
        payment_challenge_detected: true,
        status_evidence: "authorization: Bearer secret",
        response_preview: "",
      },
    ],
    paid_results: [],
  });
  assert.equal(markdown.includes("secret"), false);
});

test("no banned comparative language", () => {
  const markdown = renderProofMarkdown({
    now: new Date("2026-05-21T00:00:00.000Z"),
    fixture_metadata: {
      http_status: 200,
      content_type: "audio/x-wav",
      wav_pcm: true,
      bits_per_sample: 16,
      channels: 1,
      sample_rate_hz: 22050,
      size_bytes: 224258,
    },
    route_summaries: [],
    unpaid_variants: [],
    paid_results: [],
  });
  assert.equal(isProofLanguageSafe(markdown), true);
});
