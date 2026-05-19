# Document OCR Text Extraction Benchmark Runs

- benchmark_id: document-ocr-text-extraction
- category: document-ai
- generated_at: 2026-05-19T15:17:56.907Z
- canonical_input: {"document_url":"https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png","expected_text_fragments":["INFOPUNKS RADAR","EVIDENCE BEFORE SPEND","OCR BENCHMARK 001"]}
- canonical_input_hash: c311578a84a290deb731de40ba4419c756a0a17ba92688a68eb11ca96bf37f7d
- winner_status: no_clear_winner
- winner_claimed: false

## Route Summaries

| route_id | provider | attempted_runs | successful_runs | success_rate | ocr_success_rate | expected_fragment_match_rate_avg | expected_fragment_match_rate_median | full_match_rate | text_detection_rate | character_count_median | confidence_detection_rate | page_count_detection_rate | median_latency_ms | p95_latency_ms | evidence_health |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| paysponge-reducto-parse | PaySponge Reducto | 5 | 5 | 1 | 1 | 1 | 1 | 1 | 1 | 59 | 1 | 1 | 13404 | 14501 | caveated |
| google-vision-images-annotate | Google Vision | 5 | 5 | 1 | 1 | 1 | 1 | 1 | 1 | 55 | 1 | 1 | 6404 | 6597 | caveated |

## Run-Level Summaries

| run_number | provider | route_id | paid_execution_status | cli_exit_code | latency_ms | status_evidence | ocr_success | expected_fragment_match_rate | character_count | confidence | page_count | evidence_health | proof_reference |
|---:|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---|---|
| 1 | PaySponge Reducto | paysponge-reducto-parse | succeeded | 0 | 14035 | pay_cli_exit_0_status_unavailable | true | 1 | 59 | 0.992015540599823 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |
| 1 | Google Vision | google-vision-images-annotate | succeeded | 0 | 6597 | pay_cli_exit_0_status_unavailable | true | 1 | 55 | 0.98702735 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |
| 2 | PaySponge Reducto | paysponge-reducto-parse | succeeded | 0 | 14501 | pay_cli_exit_0_status_unavailable | true | 1 | 59 | 0.992015540599823 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |
| 2 | Google Vision | google-vision-images-annotate | succeeded | 0 | 6423 | pay_cli_exit_0_status_unavailable | true | 1 | 55 | 0.9866249 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |
| 3 | PaySponge Reducto | paysponge-reducto-parse | succeeded | 0 | 13404 | pay_cli_exit_0_status_unavailable | true | 1 | 59 | 0.992015540599823 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |
| 3 | Google Vision | google-vision-images-annotate | succeeded | 0 | 5993 | pay_cli_exit_0_status_unavailable | true | 1 | 55 | 0.9866249 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |
| 4 | PaySponge Reducto | paysponge-reducto-parse | succeeded | 0 | 12813 | pay_cli_exit_0_status_unavailable | true | 1 | 59 | 0.992015540599823 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |
| 4 | Google Vision | google-vision-images-annotate | succeeded | 0 | 6102 | pay_cli_exit_0_status_unavailable | true | 1 | 55 | 0.98702735 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |
| 5 | PaySponge Reducto | paysponge-reducto-parse | succeeded | 0 | 12485 | pay_cli_exit_0_status_unavailable | true | 1 | 59 | 0.992015540599823 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |
| 5 | Google Vision | google-vision-images-annotate | succeeded | 0 | 6404 | pay_cli_exit_0_status_unavailable | true | 1 | 55 | 0.98702735 | 1 | caveated | live-proofs/document-ocr-text-extraction-paid-routes-2026-05-19.md |

## Structured Caveats

### PaySponge Reducto (paysponge-reducto-parse)
- caveat_objects: [{"code":"status_code_unavailable","count":5,"severity":"warning","affects_core_semantics":false}]
- evidence_health: caveated

### Google Vision (google-vision-images-annotate)
- caveat_objects: [{"code":"status_code_unavailable","count":5,"severity":"warning","affects_core_semantics":false}]
- evidence_health: caveated

