# Scaffold Readiness: audio-speech-transcription (2026-05-21)

- benchmark_id: `audio-speech-transcription`
- canonical_phrase:
  - `INFOPUNKS RADAR`
  - `EVIDENCE BEFORE SPEND`
  - `AUDIO BENCHMARK 001`
- candidate_count: `4`
- comparable_candidate_count: `3`
- recommended_state: `scaffold_ready`

- recommended_candidates:
  - `solana-foundation/google/speech` — `verified/unproven`, `candidate/unproven`
    - conclusion: transcription route is method-valid and payment-gated; comparable for canonical intent via shared fixture base64 transform (`audio.content`)
  - `solana-foundation/alibaba/speech` — `verified/unproven`, `candidate/unproven`
    - conclusion: transcription route is method-valid and payment-gated; comparable for canonical intent with direct fixture URL input (`input.file_url`)
  - `solana-foundation/alibaba/intelligentspeechinteraction` — `verified/unproven`, `candidate/unproven`
    - conclusion: transcription route is method-valid and payment-gated; comparable for canonical intent via shared fixture binary upload (`application/octet-stream`)

- rejected_or_blocked_candidates:
  - `solana-foundation/google/videointelligence` — `verified/unproven`, `rejected`
    - blocker: route is video-annotation-first (`videos:annotate`) rather than pure audio transcription, so lane comparability is not strict for this benchmark intent
    - blocker: input handling is video workflow oriented and would require video wrapping/compatibility assumptions not required by the canonical audio fixture flow

- fixture_requirement:
  - single stable public audio fixture URL required for all comparable candidates (recommended target): `https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav`
  - fallback fixture format: `https://radar.infopunks.fun/fixtures/audio-benchmark-001.mp3`

- missing_requirements:
  - hosted canonical fixture is not yet confirmed live and retrievable
  - route-level adapter mappings still needed for fixture transport parity:
    - Google Speech: hosted fixture bytes -> base64 -> `audio.content`
    - Alibaba Speech: hosted fixture URL -> `input.file_url` (+ async task retrieval mapping)
    - Alibaba Intelligent Speech Interaction: fixture download -> octet-stream body with `format`/`sample_rate`
  - normalization contract still needed for case, punctuation, and numeral handling of the canonical phrase fragments

- next_step:
  - Proceed to Radar scaffold with the three comparable `candidate/unproven` routes above (research-only state, no paid proof yet, no benchmark artifact, no route ranking).
