import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveAudioSpeechTranscriptionEvidenceHealth,
  normalizeAudioSpeechTranscription,
  type NormalizeAudioSpeechTranscriptionResult,
} from "./audioSpeechTranscriptionNormalization";

const canonicalInput = {
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
};

test("transcript field response", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      duration_seconds: 8,
      confidence: 0.98,
      audio_url: canonicalInput.audio_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.transcription_success, true);
  assert.equal(result.normalized.expected_fragment_match_rate, 1);
});

test("text field response", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      duration: 8,
      confidence: 0.95,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0.1, end: 0.4 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  assert.equal(result.normalized.transcription_success, true);
});

test("data.text response", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      data: {
        text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      },
      language: "en",
      duration_seconds: 8,
      confidence: 0.9,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0.1, end: 0.4 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  assert.equal(result.normalized.transcription_success, true);
});

test("alternatives[].transcript response", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      alternatives: [{ transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001" }],
      language: "en",
      duration_seconds: 8,
      confidence: 0.9,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0.1, end: 0.4 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  assert.equal(result.normalized.transcription_success, true);
});

test("channels[].alternatives[].transcript response", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      channels: [{ alternatives: [{ transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001" }] }],
      language: "en",
      duration_seconds: 8,
      confidence: 0.9,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0.1, end: 0.4 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  assert.equal(result.normalized.transcription_success, true);
});

test("segments[].text response", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      segments: [
        { text: "INFOPUNKS RADAR" },
        { text: "EVIDENCE BEFORE SPEND" },
        { text: "AUDIO BENCHMARK 001" },
      ],
      language: "en",
      duration_seconds: 8,
      confidence: 0.9,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0.1, end: 0.4 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  assert.equal(result.normalized.transcription_success, true);
});

test("words[].word joined response", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      words: [
        { word: "INFOPUNKS", start: 0, end: 1 },
        { word: "RADAR", start: 1, end: 2 },
        { word: "EVIDENCE", start: 2, end: 3 },
        { word: "BEFORE", start: 3, end: 4 },
        { word: "SPEND", start: 4, end: 5 },
        { word: "AUDIO", start: 5, end: 6 },
        { word: "BENCHMARK", start: 6, end: 7 },
        { word: "001", start: 7, end: 8 },
      ],
      language: "en",
      duration_seconds: 8,
      confidence: 0.9,
      audio_url: canonicalInput.audio_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  assert.equal(result.normalized.transcription_success, true);
});

test("001 vs zero zero one alternate matching", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK ZERO ZERO ONE",
      language: "en",
      duration_seconds: 8,
      confidence: 0.97,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.expected_fragment_match_rate, 1);
  assert.equal(result.normalized.transcription_success, true);
});

test("punctuation/case/whitespace normalization", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "  infopunks, radar!  evidence before spend...  audio benchmark 001  ",
      language: "en",
      duration_seconds: 8,
      confidence: 0.92,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.expected_fragment_match_rate, 1);
});

test("partial fragment detection", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR AUDIO BENCHMARK 001",
      language: "en",
      duration_seconds: 8,
      confidence: 0.8,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.expected_fragment_match_rate, 0.6667);
  assert.equal(result.normalized.transcription_success, true);
  assert.ok(result.caveat_objects.some((c) => c.code === "transcription_text_partial"));
});

test("zero transcript", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      language: "en",
      duration_seconds: 8,
      confidence: 0.8,
      audio_url: canonicalInput.audio_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.transcript, null);
  assert.ok(result.caveat_objects.some((c) => c.code === "no_transcript_detected"));
});

test("402 payment-required only", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: { error: "Payment Required" },
    statusCode: 402,
    paidExecutionObserved: false,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "payment_required_confirmed_only"));
  assert.ok(result.caveat_objects.some((c) => c.code === "paid_payload_unobserved"));
});

test("405 method not allowed", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: { error: "Method Not Allowed" },
    statusCode: 405,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "method_not_allowed"));
});

test("404 route not found", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: { error: "Not Found" },
    statusCode: 404,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "route_not_found"));
});

test("non-JSON response", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: "upstream timeout",
    statusCode: 502,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "non_json_text_response"));
});

test("pay_cli hidden status", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      duration_seconds: 8,
      confidence: 0.8,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: null,
    statusEvidence: "pay_cli_exit_0_status_unavailable",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.raw_status_code, null);
  assert.equal(result.normalized.status_evidence, "pay_cli_exit_0_status_unavailable");
  assert.ok(result.caveat_objects.some((c) => c.code === "status_code_unavailable"));
});

test("confidence missing", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      duration_seconds: 8,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "confidence_missing"));
});

test("duration missing", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      confidence: 0.8,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "duration_missing"));
});

test("unsupported audio format caveat", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      duration_seconds: 8,
      confidence: 0.9,
      content_type: "audio/mpeg",
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "unsupported_audio_format"));
});

test("audio/x-wav MIME caveat", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      duration_seconds: 8,
      confidence: 0.9,
      content_type: "audio/x-wav",
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "audio_fixture_mime_x_wav"));
});

function withLatest(result: NormalizeAudioSpeechTranscriptionResult): NormalizeAudioSpeechTranscriptionResult {
  return {
    normalized: result.normalized,
    caveat_objects: result.caveat_objects,
  };
}

test("evidence_health derivation", () => {
  const recordedLatest = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      duration_seconds: 8,
      confidence: 0.98,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  const recorded = deriveAudioSpeechTranscriptionEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 1,
    paidFailures: 0,
    successfulWordCounts: [recordedLatest.normalized.word_count ?? 0],
    latest: withLatest(recordedLatest),
  });
  assert.equal(recorded, "recorded");

  const caveatedLatest = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      audio_url: canonicalInput.audio_url,
    },
    statusCode: null,
    paidExecutionObserved: true,
    canonicalInput,
  });
  const caveated = deriveAudioSpeechTranscriptionEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 1,
    paidFailures: 0,
    latest: withLatest(caveatedLatest),
  });
  assert.equal(caveated, "caveated");

  const degraded = deriveAudioSpeechTranscriptionEvidenceHealth({
    paidAttempts: 3,
    paidSuccesses: 1,
    paidFailures: 2,
    successfulWordCounts: [0],
    latest: withLatest(caveatedLatest),
  });
  assert.equal(degraded, "degraded");

  const unverified = deriveAudioSpeechTranscriptionEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 0,
    paidFailures: 1,
  });
  assert.equal(unverified, "unverified");

  const scaffold = deriveAudioSpeechTranscriptionEvidenceHealth({
    researchOnly: true,
    paidAttempts: 0,
    paidSuccesses: 0,
    paidFailures: 0,
  });
  assert.equal(scaffold, "scaffold");
});

test("no best/top/winner/loser/superiority language", () => {
  const result = normalizeAudioSpeechTranscription({
    parsedJson: {
      transcript: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND AUDIO BENCHMARK 001",
      language: "en",
      duration_seconds: 8,
      confidence: 0.9,
      audio_url: canonicalInput.audio_url,
      words: [{ word: "INFOPUNKS", start: 0, end: 1 }],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  const serialized = JSON.stringify(result);
  const bannedTerms = ["best", "top", "winner", "loser", "superiority"];
  for (const term of bannedTerms) {
    assert.equal(serialized.toLowerCase().includes(term), false);
  }
});
