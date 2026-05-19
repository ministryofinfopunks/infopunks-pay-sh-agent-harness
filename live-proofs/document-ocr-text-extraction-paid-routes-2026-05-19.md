# Document OCR Text Extraction Paid Route Verification

- generated_at: 2026-05-19T15:09:28.703Z
- benchmark_id: document-ocr-text-extraction
- canonical_input: {"document_url":"https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png","fallback_document_url":"https://radar.infopunks.fun/fixtures/ocr-benchmark-001.svg","expected_text_fragments":["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","OCR BENCHMARK 001"]}
- winner_claimed: false

## PaySponge Reducto
- benchmark_id: document-ocr-text-extraction
- provider: PaySponge Reducto
- endpoint: https://api.paysponge.com/x402/purchase/svc_d672d90ggvqqygj60/parse
- method: POST
- canonical_input_hash: aee83aa83c58a59c79932b5b30418085e3988c2f9f1c635663f6e353fc80e927
- document_url: https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png
- expected_text_fragments: ["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","OCR BENCHMARK 001"]
- route_specific_body: {"input":"https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png","settings":{"return_ocr_data":true,"extraction_mode":"hybrid","ocr_system":"standard"}}
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"text":"# INFOPUNKS RADAR # EVIDENCE BEFORE SPEND OCR BENCHMARK 001","text_fragments_detected":["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","OCR BENCHMARK 001"],"expected_fragment_match_rate":1,"ocr_success":true,"character_count":59,"page_count":1,"confidence":0.992015540599823,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."}],"evidence_health":"caveated"}
- expected_fragment_match_rate: 1
- ocr_success: true
- sample extracted text preview: # INFOPUNKS RADAR # EVIDENCE BEFORE SPEND OCR BENCHMARK 001
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."}]
- evidence_health: caveated
- route_state: verified/proven

## Google Vision
- benchmark_id: document-ocr-text-extraction
- provider: Google Vision
- endpoint: https://vision.google.gateway-402.com/v1/images:annotate
- method: POST
- canonical_input_hash: aee83aa83c58a59c79932b5b30418085e3988c2f9f1c635663f6e353fc80e927
- document_url: https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png
- expected_text_fragments: ["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","OCR BENCHMARK 001"]
- route_specific_body: {"requests":[{"image":{"source":{"imageUri":"https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png"}},"features":[{"type":"DOCUMENT_TEXT_DETECTION"}]}]}
- paid_execution_status: succeeded
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"text":"INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001","text_fragments_detected":["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","OCR BENCHMARK 001"],"expected_fragment_match_rate":1,"ocr_success":true,"character_count":55,"page_count":1,"confidence":0.98702735,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."}],"evidence_health":"caveated"}
- expected_fragment_match_rate: 1
- ocr_success: true
- sample extracted text preview: INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."}]
- evidence_health: caveated
- route_state: verified/proven

No 5-run benchmark artifact generated.
No benchmark recorded claim.
No winner claim.
