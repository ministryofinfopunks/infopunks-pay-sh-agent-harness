# audio-speech-transcription candidate research (2026-05-21)

## Scope
- benchmark_id: `audio-speech-transcription`
- category: `audio-ai`
- intent: transcribe the same short audio fixture into normalized text
- canonical phrase:
  - `INFOPUNKS RADAR`
  - `EVIDENCE BEFORE SPEND`
  - `AUDIO BENCHMARK 001`
- canonical input candidate:

```json
{
  "audio_url": "<future stable public audio fixture URL>",
  "expected_text_fragments": [
    "INFOPUNKS RADAR",
    "EVIDENCE BEFORE SPEND",
    "AUDIO BENCHMARK 001"
  ],
  "language": "en"
}
```

- sources inspected:
  - live Pay catalog via `pay skills search ...`, `pay skills endpoints ...`
  - local skill detail metadata: `~/.config/pay/skills/detail/*.json`
- search terms run:
  - `speech`, `transcription`, `transcribe`, `audio`, `voice`, `whisper`, `speech-to-text`, `stt`, `recognize`, `recognition`, `google speech`, `audio intelligence`
- probe policy: unpaid only (method/route/payment challenge checks with `curl -i`, no payment settlement)

## Candidate 1
- provider: `solana-foundation/google/speech`
- endpoint: `https://speech.google.gateway-402.com/v1/speech:recognize`
- method: `POST`
- request shape:
  - `config.languageCode` (required)
  - audio input via either:
    - `audio.content` (base64 bytes)
    - `audio.uri` (schema says GCS URI only)
  - optional transcript richness flags: `enableWordTimeOffsets`, `enableWordConfidence`, punctuation options
- accepted audio formats if known:
  - `LINEAR16`, `FLAC`, `MULAW`, `AMR`, `AMR_WB`, `OGG_OPUS`, `SPEEX_WITH_HEADER_BYTE`, `MP3`, `WEBM_OPUS` (via `config.encoding`)
- public URL input support:
  - not general HTTP URL in schema; `audio.uri` is documented as `gs://...` only
- base64 input support:
  - yes (`audio.content`)
- output likely includes transcript text:
  - yes (`results[].alternatives[].transcript`)
- language hint support:
  - yes (`config.languageCode`, plus alternatives)
- canonical input feasibility:
  - feasible if canonical fixture can be converted to base64 and sent via `audio.content`
  - direct `audio_url` mapping is limited by GCS-only URI constraint
- unpaid status evidence:
  - `POST /v1/speech:recognize` returned `HTTP/2 402` with MPP `www-authenticate` payment challenge
  - endpoint/method echoed in response body (`method: POST`, `path: v1/speech:recognize`)
- payment challenge detected: `true`
- semantic fit:
  - accepts audio input: `true`
  - returns transcript text: `true`
  - likely exposes confidence/timestamps/language: `true`
- fixture requirements:
  - preferred shared fixture strategy for comparability: host `https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav` and convert to base64 for this route
- caveat_objects:
  - no unpaid proof yet that non-GCS HTTP URL is accepted in `audio.uri`
  - normalization behavior (case/punctuation/numerals) remains paid-unproven
- conclusion:
  - candidate/unproven: `candidate`
  - verified/unproven: `verified` (route+method+payment gate+schema fit), `unproven` (paid output normalization)
  - rejected: `false`

## Candidate 2
- provider: `solana-foundation/alibaba/speech`
- endpoint: `https://speech.alibaba.gateway-402.com/api/v1/services/audio/asr/transcription`
- method: `POST`
- request shape:
  - header required: `X-DashScope-Async: enable`
  - body schema:
    - `model` (currently `qwen3-asr-flash-filetrans`)
    - `input.file_url` (URI)
    - optional `parameters.language_hints[]`, `parameters.enable_itn`, `parameters.channel_id[]`
  - async follow-up route: `GET /api/v1/tasks/{taskId}`
- accepted audio formats if known:
  - not explicitly enumerated in cached schema text
- public URL input support:
  - yes (`input.file_url`)
- base64 input support:
  - not documented in current schema
- output likely includes transcript text:
  - async task response includes `result.transcription_url` (transcript retrieval path implied)
- language hint support:
  - yes (`parameters.language_hints[]`)
- canonical input feasibility:
  - direct mapping from canonical `audio_url` to `input.file_url`
  - language can be hinted for English
- unpaid status evidence:
  - `POST /api/v1/services/audio/asr/transcription` returned `HTTP/2 402` with MPP `www-authenticate` payment challenge
  - endpoint/method echoed in response body (`method: POST`, `path: api/v1/services/audio/asr/transcription`)
- payment challenge detected: `true`
- semantic fit:
  - accepts audio input: `true`
  - returns transcript text: `likely true` (via `transcription_url` after task completion)
  - likely exposes confidence/timestamps/language if available: `unproven`
- fixture requirements:
  - needs stable public downloadable audio URL (recommended: `https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav` or `.mp3`)
- caveat_objects:
  - asynchronous flow requires second retrieval step; direct transcript field not shown in submit response
  - no base64 pathway documented
- conclusion:
  - candidate/unproven: `candidate`
  - verified/unproven: `verified` (route+method+payment gate+input fit), `unproven` (paid transcript payload mapping)
  - rejected: `false`

## Candidate 3
- provider: `solana-foundation/alibaba/intelligentspeechinteraction`
- endpoint: `https://intelligentspeechinteraction.alibaba.gateway-402.com/stream/v1/asr`
- method: `POST`
- request shape:
  - query params required: `format` (`pcm|wav|opus`), `sample_rate` (`8000|16000`)
  - body required: raw `application/octet-stream` binary audio
- accepted audio formats if known:
  - `pcm`, `wav`, `opus`
- public URL input support:
  - no direct URL field in request; requires binary upload
- base64 input support:
  - not documented (binary octet-stream expected)
- output likely includes transcript text:
  - yes (`AsrResponse.result` string)
- language hint support:
  - not exposed in the discovered schema
- canonical input feasibility:
  - feasible with pre-download + binary upload transform from canonical hosted fixture
- unpaid status evidence:
  - `POST /stream/v1/asr?format=wav&sample_rate=16000` returned `HTTP/2 402` with MPP challenge
  - response body confirms endpoint path/method and pricing dimension
- payment challenge detected: `true`
- semantic fit:
  - accepts audio input: `true`
  - returns transcript text: `true`
  - likely exposes confidence/timestamps/language if available: `false/unproven` (not visible in schema)
- fixture requirements:
  - same stable hosted fixture can be downloaded client-side and sent as octet-stream
- caveat_objects:
  - no explicit language parameter for control
  - less rich transcript metadata than Google Speech route
- conclusion:
  - candidate/unproven: `candidate`
  - verified/unproven: `verified` (route+method+payment gate+transcript field), `unproven` (normalization consistency)
  - rejected: `false`

## Candidate 4
- provider: `solana-foundation/google/videointelligence`
- endpoint: `https://videointelligence.google.gateway-402.com/v1/videos:annotate`
- method: `POST`
- request shape:
  - video annotation request with `features: ["SPEECH_TRANSCRIPTION"]`
  - supports `inputContent` (base64 bytes) or `inputUri` (`gs://...` only)
  - language in `videoContext.speechTranscriptionConfig.languageCode`
- accepted audio formats if known:
  - not a pure audio route; expects video workflow
- public URL input support:
  - not generic HTTP URL in `inputUri` (GCS only)
- base64 input support:
  - yes (`inputContent`, for video payload)
- output likely includes transcript text:
  - yes in speech transcription results, but via asynchronous video annotation responses
- language hint support:
  - yes
- canonical input feasibility:
  - weak for this lane because benchmark intent is pure audio transcription, not video annotation
- unpaid status evidence:
  - `POST /v1/videos:annotate` returned `HTTP/2 402` with payment challenge
- payment challenge detected: `true`
- semantic fit:
  - accepts audio input: `partial` (within video route)
  - returns transcript text: `likely true`
  - likely exposes confidence/timestamps/language if available: `likely true`
- fixture requirements:
  - would require video-wrapped or video-compatible input path
- caveat_objects:
  - not directly comparable to pure audio STT routes for canonical benchmark intent
- conclusion:
  - candidate/unproven: `unproven`
  - verified/unproven: `verified` (route+payment gate), `unproven` (lane comparability)
  - rejected: `true`

## Exclusions
- `solana-foundation/google/texttospeech` and `solana-foundation/alibaba/texttospeech`: rejected (speech synthesis only)
- `dtelecom/voice`: rejected (voice credits/infra, no transcript output route)
- speech-adjacent non-transcription routes (audio generation, phone/SMS-only, classification-only): excluded

## Fixture blocker and safe recommendation
- No confirmed hosted canonical audio fixture was found during this pass.
- Blocker: canonical `audio_url` cannot yet be validated against route inputs.
- Recommended stable fixture path (do not create in this step):
  - `https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav`
  - fallback: `https://radar.infopunks.fun/fixtures/audio-benchmark-001.mp3`

## Recommendation
- readiness decision: `scaffold_ready`
- rationale:
  - at least two plausible comparable transcription routes are present and unpaid-verified as payment-gated/method-correct:
    - `solana-foundation/google/speech` `POST /v1/speech:recognize`
    - `solana-foundation/alibaba/speech` `POST /api/v1/services/audio/asr/transcription`
  - both are transcription-intent routes and can consume equivalent audio input representations from the same hosted fixture (URL directly for Alibaba Speech; base64 transform for Google Speech)
- notes:
  - this is research-only output; no fixture created, no paid execution, no benchmark artifact, no Radar scaffold, no winners claimed
