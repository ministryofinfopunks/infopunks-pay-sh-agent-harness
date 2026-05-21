# Audio Speech Transcription Shape Diagnostic (2026-05-21)

- benchmark_id: audio-speech-transcription
- canonical_input: {"audio_url":"https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav","language":"en-US","expected_text_fragments":["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","AUDIO BENCHMARK 001"],"accepted_alternates":{"AUDIO BENCHMARK 001":["AUDIO BENCHMARK ZERO ZERO ONE","AUDIO BENCHMARK DOUBLE ZERO ONE","AUDIO BENCHMARK O O ONE"]}}
- canonical_phrase: INFOPUNKS RADAR | EVIDENCE BEFORE SPEND | AUDIO BENCHMARK 001
- fixture_metadata: {"http_status":200,"content_type":"audio/x-wav","size_bytes":224258,"wav_pcm":true,"bits_per_sample":16,"channels":1,"sample_rate_hz":22050}

## Route Metadata Summary
- route_id: solana-foundation/google/speech
  provider: Google Speech
  detail_file: /Users/ahdilm/.config/pay/skills/detail/5ab4e23018b47c5.json
  endpoint: https://speech.google.gateway-402.com/v1/speech:recognize
  supports_audio_url: true
  supports_base64_content: true
  supports_encoding_config: true
  supports_sample_rate_config: true
  supports_language_code_config: true
  supports_model_config: true
  file_format_constraints: ["audio.content expects base64 bytes (WAV header included for LINEAR16)","audio.uri field is Google Cloud Storage URI oriented (gs://...)"]
- route_id: solana-foundation/alibaba/speech
  provider: Alibaba Speech
  detail_file: /Users/ahdilm/.config/pay/skills/detail/78b0e00da3812005.json
  endpoint: https://speech.alibaba.gateway-402.com/api/v1/services/audio/asr/transcription
  supports_audio_url: true
  supports_base64_content: false
  supports_encoding_config: false
  supports_sample_rate_config: false
  supports_language_code_config: true
  supports_model_config: true
  file_format_constraints: ["AsrSubmitRequest schema requires input.file_url","model enum restricted to qwen3-asr-flash-filetrans","async submission requires X-DashScope-Async: enable"]

## Unpaid Variants Tested
- route=solana-foundation/google/speech variant=audio_url_only supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- route=solana-foundation/google/speech variant=audio_url_plus_language supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- route=solana-foundation/google/speech variant=audio_url_plus_encoding_LINEAR16 supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- route=solana-foundation/google/speech variant=audio_url_plus_sampleRateHertz_22050 supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- route=solana-foundation/google/speech variant=base64_audio_content_plus_encoding_LINEAR16 supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- route=solana-foundation/google/speech variant=base64_audio_content_plus_sampleRateHertz_22050 supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- route=solana-foundation/google/speech variant=languageCode_en_US supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- route=solana-foundation/alibaba/speech variant=audio_url_only supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- route=solana-foundation/alibaba/speech variant=audio_url_plus_language supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402
- route=solana-foundation/alibaba/speech variant=audio_url_plus_encoding_LINEAR16 supported=false status_code=null payment_challenge_detected=false status_evidence=unsupported_variant_not_probed
- route=solana-foundation/alibaba/speech variant=audio_url_plus_sampleRateHertz_22050 supported=false status_code=null payment_challenge_detected=false status_evidence=unsupported_variant_not_probed
- route=solana-foundation/alibaba/speech variant=base64_audio_content_plus_encoding_LINEAR16 supported=false status_code=null payment_challenge_detected=false status_evidence=unsupported_variant_not_probed
- route=solana-foundation/alibaba/speech variant=base64_audio_content_plus_sampleRateHertz_22050 supported=false status_code=null payment_challenge_detected=false status_evidence=unsupported_variant_not_probed
- route=solana-foundation/alibaba/speech variant=languageCode_en_US supported=true status_code=402 payment_challenge_detected=true status_evidence=status_code_observed_402

## Paid Retry
### Google Speech
- selected_paid_retry_body: {"config":{"languageCode":"en-US","model":"latest_long","encoding":"LINEAR16","sampleRateHertz":22050},"audio":{"content":"[base64_redacted_length_299012]"}}
- paid_retry_attempted: true
- paid_retry_count: 1
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"transcript":null,"transcript_fragments_detected":[],"expected_fragment_match_rate":0,"transcription_success":false,"language":null,"duration_seconds":null,"confidence":0.71067923,"word_count":null,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"no_transcript_detected","severity":"warning","affects_core_semantics":true,"detail":"No transcript text was detected in the response payload."},{"code":"expected_fragments_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more expected transcript fragments were not detected."},{"code":"duration_missing","severity":"warning","affects_core_semantics":false,"detail":"Audio duration was not present in the response."},{"code":"language_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Language was not confirmed in the response payload."},{"code":"word_timestamps_missing","severity":"warning","affects_core_semantics":false,"detail":"Word-level timestamps were not present in the response payload."},{"code":"audio_input_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response does not clearly echo the canonical audio fixture URL."}],"evidence_health":"degraded"}
- transcript preview: 
- expected_fragment_match_rate: 0
- transcription_success: false
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"no_transcript_detected","severity":"warning","affects_core_semantics":true,"detail":"No transcript text was detected in the response payload."},{"code":"expected_fragments_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more expected transcript fragments were not detected."},{"code":"duration_missing","severity":"warning","affects_core_semantics":false,"detail":"Audio duration was not present in the response."},{"code":"language_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Language was not confirmed in the response payload."},{"code":"word_timestamps_missing","severity":"warning","affects_core_semantics":false,"detail":"Word-level timestamps were not present in the response payload."},{"code":"audio_input_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response does not clearly echo the canonical audio fixture URL."}]
- evidence_health: degraded
- route_state: candidate/unproven
### Alibaba Speech
- selected_paid_retry_body: {"model":"qwen3-asr-flash-filetrans","input":{"file_url":"https://radar.infopunks.fun/fixtures/audio-benchmark-001.wav"},"parameters":{"language_hints":["en-US"],"enable_itn":true}}
- paid_retry_attempted: true
- paid_retry_count: 1
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"transcript":null,"transcript_fragments_detected":[],"expected_fragment_match_rate":0,"transcription_success":false,"language":"en-US","duration_seconds":null,"confidence":null,"word_count":null,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"no_transcript_detected","severity":"warning","affects_core_semantics":true,"detail":"No transcript text was detected in the response payload."},{"code":"expected_fragments_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more expected transcript fragments were not detected."},{"code":"confidence_missing","severity":"warning","affects_core_semantics":false,"detail":"Transcription confidence was not present in the response."},{"code":"duration_missing","severity":"warning","affects_core_semantics":false,"detail":"Audio duration was not present in the response."},{"code":"word_timestamps_missing","severity":"warning","affects_core_semantics":false,"detail":"Word-level timestamps were not present in the response payload."}],"evidence_health":"degraded"}
- transcript preview: 
- expected_fragment_match_rate: 0
- transcription_success: false
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"no_transcript_detected","severity":"warning","affects_core_semantics":true,"detail":"No transcript text was detected in the response payload."},{"code":"expected_fragments_missing","severity":"warning","affects_core_semantics":true,"detail":"One or more expected transcript fragments were not detected."},{"code":"confidence_missing","severity":"warning","affects_core_semantics":false,"detail":"Transcription confidence was not present in the response."},{"code":"duration_missing","severity":"warning","affects_core_semantics":false,"detail":"Audio duration was not present in the response."},{"code":"word_timestamps_missing","severity":"warning","affects_core_semantics":false,"detail":"Word-level timestamps were not present in the response payload."}]
- evidence_health: degraded
- route_state: candidate/unproven

## Guardrails
- benchmark_artifact_created: false
- benchmark_record_marked: false
- comparison_claim_made: false

## Conclusion
- solana-foundation/google/speech: candidate/unproven
- solana-foundation/alibaba/speech: candidate/unproven
