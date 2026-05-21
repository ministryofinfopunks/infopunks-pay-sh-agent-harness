import assert from "node:assert/strict";
import test from "node:test";

import type { LivePayShExecutionResult } from "./types";
import {
  deriveRouteState,
  extractRecommendedCandidates,
  extractRejectedOrBlockedCandidates,
  hashCanonicalInput,
  renderProofMarkdown,
  runPaidRoute,
  selectComparableRoutesFromReadiness,
} from "./verifyAudioSpeechTranscriptionPaid";

function fakeLiveResult(overrides: Partial<LivePayShExecutionResult> = {}): LivePayShExecutionResult {
  return {
    providerId: "solana-foundation/google/speech",
    intent: "audio-speech-transcription",
    endpointUrl: "https://speech.google.gateway-402.com/v1/speech:recognize",
    startedAt: new Date("2026-05-21T00:00:00.000Z").toISOString(),
    completedAt: new Date("2026-05-21T00:00:01.000Z").toISOString(),
    latencyMs: 1000,
    success: true,
    statusCode: 200,
    exitCode: 0,
    costUsd: null,
    settlementReference: null,
    responsePreview: "{}",
    parsedJsonAvailable: true,
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      duration_seconds: 8.1,
      confidence: 0.97,
      audio_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav",
      words: [{ word: "INFOPUNKS", start: 0.1, end: 0.4 }],
    },
    mode: "live_pay_sh_cli",
    ...overrides,
  };
}

const readinessSample = `# Scaffold Readiness: audio-speech-transcription (2026-05-21)

- recommended_candidates:
  - \`solana-foundation/google/speech\` — \`verified/unproven\`, \`candidate/unproven\`
  - \`solana-foundation/alibaba/speech\` — \`verified/unproven\`, \`candidate/unproven\`
  - \`solana-foundation/alibaba/intelligentspeechinteraction\` — \`verified/unproven\`, \`candidate/unproven\`

- rejected_or_blocked_candidates:
  - \`solana-foundation/google/videointelligence\` — \`verified/unproven\`, \`rejected\`

- fixture_requirement:
  - x
`;

test("readiness note candidate extraction", () => {
  const extracted = extractRecommendedCandidates(readinessSample);
  assert.deepEqual(extracted, [
    "solana-foundation/google/speech",
    "solana-foundation/alibaba/speech",
    "solana-foundation/alibaba/intelligentspeechinteraction",
  ]);
});

test("rejected/blocked candidates excluded", () => {
  const recommended = extractRecommendedCandidates(readinessSample);
  const rejected = new Set(extractRejectedOrBlockedCandidates(readinessSample));
  const filtered = recommended.filter((id) => !rejected.has(id));
  assert.deepEqual(filtered, [
    "solana-foundation/google/speech",
    "solana-foundation/alibaba/speech",
    "solana-foundation/alibaba/intelligentspeechinteraction",
  ]);
  assert.equal(filtered.includes("solana-foundation/google/videointelligence"), false);
});

test("route-specific body generation for each comparable route", () => {
  const selected = selectComparableRoutesFromReadiness(readinessSample);
  assert.equal(selected.length, 2);
  const googleBody = selected[0].buildBody({
    audio_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav",
    language: "en",
    expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "AUDIO BENCHMARK 001"],
    accepted_alternates: { "AUDIO BENCHMARK 001": ["AUDIO BENCHMARK ZERO ZERO ONE"] },
  }, "AAA=");
  assert.deepEqual(googleBody, {
    config: { languageCode: "en" },
    audio: { content: "AAA=" },
  });

  const alibabaBody = selected[1].buildBody({
    audio_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav",
    language: "en",
    expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "AUDIO BENCHMARK 001"],
    accepted_alternates: { "AUDIO BENCHMARK 001": ["AUDIO BENCHMARK ZERO ZERO ONE"] },
  }, "ignored");
  assert.deepEqual(alibabaBody, {
    model: "qwen3-asr-flash-filetrans",
    input: { file_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav" },
    parameters: { language_hints: ["en"], enable_itn: true },
  });
});

test("canonical input hash", () => {
  const hash = hashCanonicalInput({
    audio_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav",
    language: "en",
    expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "AUDIO BENCHMARK 001"],
    accepted_alternates: {
      "AUDIO BENCHMARK 001": [
        "AUDIO BENCHMARK ZERO ZERO ONE",
        "AUDIO BENCHMARK DOUBLE ZERO ONE",
        "AUDIO BENCHMARK O O ONE",
      ],
    },
  });
  assert.equal(hash, "43ee2f0a2ab3e4a64e058566b3259eb35182c63f2a3cf93fdd0b3fa25a409132");
});

test("successful transcription fixture normalization", async () => {
  const selected = selectComparableRoutesFromReadiness(readinessSample);
  const proof = await runPaidRoute(selected[0], "h", "AAA=", async () => fakeLiveResult());
  assert.equal(proof.paid_execution_status, "succeeded");
  assert.equal(proof.transcription_success, true);
  assert.equal(proof.expected_fragment_match_rate, 1);
  assert.equal(proof.route_state, "verified/proven");
});

test("001 vs zero zero one accepted alternate", async () => {
  const selected = selectComparableRoutesFromReadiness(readinessSample);
  const proof = await runPaidRoute(
    selected[0],
    "h",
    "AAA=",
    async () =>
      fakeLiveResult({
        parsedJson: {
          transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK ZERO ZERO ONE",
          language: "en",
          duration_seconds: 8,
          confidence: 0.94,
          audio_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav",
          words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
        },
      }),
  );
  assert.equal(proof.transcription_success, true);
  assert.equal(proof.expected_fragment_match_rate, 1);
});

test("failed route remains candidate/unproven", async () => {
  const selected = selectComparableRoutesFromReadiness(readinessSample);
  const proof = await runPaidRoute(
    selected[1],
    "h",
    "AAA=",
    async () =>
      fakeLiveResult({
        providerId: "solana-foundation/alibaba/speech",
        endpointUrl: "https://speech.alibaba.gateway-402.com/api/v1/services/audio/asr/transcription",
        success: false,
        parsedJsonAvailable: false,
        statusCode: undefined,
        exitCode: 1,
        responsePreview: "payment required",
      }),
  );
  assert.equal(proof.route_state, "candidate/unproven");
});

test("zero transcript remains candidate/unproven or degraded depending paid outcome", async () => {
  const selected = selectComparableRoutesFromReadiness(readinessSample);
  const paidSuccessZero = await runPaidRoute(
    selected[0],
    "h",
    "AAA=",
    async () =>
      fakeLiveResult({
        parsedJson: {
          language: "en",
          duration_seconds: 8,
          confidence: 0.8,
          audio_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav",
        },
      }),
  );
  assert.equal(paidSuccessZero.route_state, "candidate/unproven");
  assert.equal(paidSuccessZero.evidence_health, "degraded");
});

test("route_state/evidence_health distinction", () => {
  const state = deriveRouteState({
    paidCallSuccess: true,
    normalized: {
      normalized: {
        transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
        transcript_fragments_detected: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "AUDIO BENCHMARK 001"],
        expected_fragment_match_rate: 1,
        transcription_success: true,
        language: "en",
        duration_seconds: null,
        confidence: null,
        word_count: 8,
        status_evidence: "pay_cli_exit_0_status_unavailable",
        raw_status_code: null,
        caveat_objects: [],
        evidence_health: "caveated",
      },
      caveat_objects: [],
    },
  });
  assert.equal(state, "verified/proven");
});

test("proof safe output", () => {
  const markdown = renderProofMarkdown(
    [{
      benchmark_id: "audio-speech-transcription",
      provider: "Google Speech Recognize",
      endpoint: "https://speech.google.gateway-402.com/v1/speech:recognize",
      method: "POST",
      canonical_input_hash: "abc",
      canonical_input: {
        audio_url: "https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav",
        language: "en",
        expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "AUDIO BENCHMARK 001"],
        accepted_alternates: { "AUDIO BENCHMARK 001": ["AUDIO BENCHMARK ZERO ZERO ONE"] },
      },
      route_specific_body: {},
      paid_execution_status: "succeeded",
      cli_exit_code: 0,
      status_evidence: "authorization: Bearer secret",
      normalized_output: {
        transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
        transcript_fragments_detected: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "AUDIO BENCHMARK 001"],
        expected_fragment_match_rate: 1,
        transcription_success: true,
        language: "en",
        duration_seconds: 8,
        confidence: 0.9,
        word_count: 8,
        status_evidence: "authorization: Bearer secret",
        raw_status_code: 200,
        caveat_objects: [],
        evidence_health: "recorded",
      },
      transcript_preview: "INFOPUNKS RADAR",
      expected_fragment_match_rate: 1,
      transcription_success: true,
      language: "en",
      duration_seconds: 8,
      confidence: 0.9,
      word_count: 8,
      caveat_objects: [],
      evidence_health: "recorded",
      route_state: "verified/proven",
    }],
    new Date("2026-05-21T00:00:00.000Z"),
  );
  assert.doesNotMatch(markdown, /Bearer secret/);
});

test("no best/top/winner/loser/superiority language", () => {
  const markdown = renderProofMarkdown([], new Date("2026-05-21T00:00:00.000Z"));
  assert.doesNotMatch(markdown, /\bbest\b/i);
  assert.doesNotMatch(markdown, /\btop\b/i);
  assert.doesNotMatch(markdown, /\bwinner\b/i);
  assert.doesNotMatch(markdown, /\bloser\b/i);
  assert.doesNotMatch(markdown, /\bsuperiority\b/i);
});
