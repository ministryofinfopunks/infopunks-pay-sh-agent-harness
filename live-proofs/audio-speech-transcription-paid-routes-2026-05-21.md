# Audio Speech Transcription Paid Route Verification

- generated_at: 2026-05-21T00:46:05.288Z
- benchmark_id: audio-speech-transcription
- canonical_input: {"audio_url":"https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav","language":"en","expected_text_fragments":["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","AUDIO BENCHMARK 001"],"accepted_alternates":{"AUDIO BENCHMARK 001":["AUDIO BENCHMARK ZERO ZERO ONE","AUDIO BENCHMARK DOUBLE ZERO ONE","AUDIO BENCHMARK O O ONE"]}}

## Google Speech Recognize
- benchmark_id: audio-speech-transcription
- provider: Google Speech Recognize
- endpoint: https://speech.google.gateway-402.com/v1/speech:recognize
- method: POST
- canonical_input_hash: 43ee2f0a2ab3e4a64e058566b3259eb35182c63f2a3cf93fdd0b3fa25a409132
- canonical_input: {"audio_url":"https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav","language":"en","expected_text_fragments":["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","AUDIO BENCHMARK 001"],"accepted_alternates":{"AUDIO BENCHMARK 001":["AUDIO BENCHMARK ZERO ZERO ONE","AUDIO BENCHMARK DOUBLE ZERO ONE","AUDIO BENCHMARK O O ONE"]}}
- route_specific_body: {"config":{"languageCode":"en"},"audio":{"content":"[base64_redacted_length_299012]"}}
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"transcript":null,"transcript_fragments_detected":[],"expected_fragment_match_rate":0,"transcription_success":false,"language":null,"duration_seconds":null,"confidence":0.78792214,"word_count":null,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"no_transcript_detected","severity":"warning","affects_core_semantics":true,"detail":"No transcript text was detected in the response payload."},{"code":"expected_fragments_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more expected transcript fragments were not detected."},{"code":"duration_missing","severity":"warning","affects_core_semantics":false,"detail":"Audio duration was not present in the response."},{"code":"language_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Language was not confirmed in the response payload."},{"code":"word_timestamps_missing","severity":"warning","affects_core_semantics":false,"detail":"Word-level timestamps were not present in the response payload."},{"code":"audio_input_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response does not clearly echo the canonical audio fixture URL."}],"evidence_health":"degraded"}
- transcript preview: 
- expected_fragment_match_rate: 0
- transcription_success: false
- language: null
- duration_seconds: null
- confidence: 0.78792214
- word_count: null
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"no_transcript_detected","severity":"warning","affects_core_semantics":true,"detail":"No transcript text was detected in the response payload."},{"code":"expected_fragments_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more expected transcript fragments were not detected."},{"code":"duration_missing","severity":"warning","affects_core_semantics":false,"detail":"Audio duration was not present in the response."},{"code":"language_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Language was not confirmed in the response payload."},{"code":"word_timestamps_missing","severity":"warning","affects_core_semantics":false,"detail":"Word-level timestamps were not present in the response payload."},{"code":"audio_input_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response does not clearly echo the canonical audio fixture URL."}]
- evidence_health: degraded
- route_state: candidate/unproven

## Alibaba Speech Transcription
- benchmark_id: audio-speech-transcription
- provider: Alibaba Speech Transcription
- endpoint: https://speech.alibaba.gateway-402.com/api/v1/services/audio/asr/transcription
- method: POST
- canonical_input_hash: 43ee2f0a2ab3e4a64e058566b3259eb35182c63f2a3cf93fdd0b3fa25a409132
- canonical_input: {"audio_url":"https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav","language":"en","expected_text_fragments":["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","AUDIO BENCHMARK 001"],"accepted_alternates":{"AUDIO BENCHMARK 001":["AUDIO BENCHMARK ZERO ZERO ONE","AUDIO BENCHMARK DOUBLE ZERO ONE","AUDIO BENCHMARK O O ONE"]}}
- route_specific_body: {"model":"qwen3-asr-flash-filetrans","input":{"file_url":"https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav"},"parameters":{"language_hints":["en"],"enable_itn":true}}
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"transcript":null,"transcript_fragments_detected":[],"expected_fragment_match_rate":0,"transcription_success":false,"language":"en","duration_seconds":null,"confidence":null,"word_count":null,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"no_transcript_detected","severity":"warning","affects_core_semantics":true,"detail":"No transcript text was detected in the response payload."},{"code":"expected_fragments_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more expected transcript fragments were not detected."},{"code":"confidence_missing","severity":"warning","affects_core_semantics":false,"detail":"Transcription confidence was not present in the response."},{"code":"duration_missing","severity":"warning","affects_core_semantics":false,"detail":"Audio duration was not present in the response."},{"code":"word_timestamps_missing","severity":"warning","affects_core_semantics":false,"detail":"Word-level timestamps were not present in the response payload."}],"evidence_health":"degraded"}
- transcript preview: 
- expected_fragment_match_rate: 0
- transcription_success: false
- language: en
- duration_seconds: null
- confidence: null
- word_count: null
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"no_transcript_detected","severity":"warning","affects_core_semantics":true,"detail":"No transcript text was detected in the response payload."},{"code":"expected_fragments_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more expected transcript fragments were not detected."},{"code":"confidence_missing","severity":"warning","affects_core_semantics":false,"detail":"Transcription confidence was not present in the response."},{"code":"duration_missing","severity":"warning","affects_core_semantics":false,"detail":"Audio duration was not present in the response."},{"code":"word_timestamps_missing","severity":"warning","affects_core_semantics":false,"detail":"Word-level timestamps were not present in the response payload."}]
- evidence_health: degraded
- route_state: candidate/unproven

winner_claimed: false
No 5-run benchmark artifact generated.
No benchmark recorded claim.
