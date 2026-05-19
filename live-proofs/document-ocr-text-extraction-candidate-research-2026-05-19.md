# document-ocr-text-extraction candidate research (2026-05-19)

## Scope
- Benchmark candidate: `document-ocr-text-extraction`
- Category: `document-ai`
- Intent: extract text from the same simple document/image fixture
- Canonical input target:

```json
{
  "document_url": "<public fixture URL>",
  "expected_text_fragments": [
    "INFOPUNKS RADAR",
    "EVIDENCE BEFORE SPEND",
    "OCR BENCHMARK 001"
  ]
}
```

- Source of route inventory: `~/.config/pay/skills/detail/*.json`
- Search terms used: `reducto`, `vision`, `ocr`, `text detection`, `document text`, `parse`, `document`, `image annotation`
- Probe policy: unpaid only (`curl -i` without payment settlement)

## Candidate 1
- provider: `paysponge/reducto`
- endpoint: `https://api.paysponge.com/x402/purchase/svc_d672d90ggvqqygj60/parse`
- method: `POST`
- request shape:
  - required: `input` (document reference)
  - accepted `input` forms in schema text: public URL, presigned S3 URL, `reducto://...`, `jobid://...`, list of URLs
  - OCR-related options available (for example `settings.return_ocr_data`, `settings.extraction_mode`, `settings.ocr_system`)
- canonical input feasibility:
  - `document_url` mapping is direct (`input: "<public fixture URL>"`)
  - expected text fragments likely recoverable via parse blocks/chunks/OCR fields
- unpaid status evidence:
  - unpaid `POST` probe returned `HTTP/2 402`
  - response included `payment-required` and x402 challenge payload with `resource.url=https://api.paysponge.com/parse`
  - wrong method check: `GET` on `/parse` returned `HTTP/2 404` (`Endpoint not found`)
- payment challenge detected: `true`
- semantic fit:
  - accepts document/image input: `true` (URL-based doc input)
  - returns or promises OCR text: `true` (`/parse` described as OCR + structured chunks/blocks)
  - likely exposes extracted text or text annotations: `true` (OCR line/word schemas and block/chunk content present)
- caveat_objects:
  - unpaid gate prevented confirmation of exact response field path to normalize canonical text fragments
  - no direct base64 body input shape is clearly advertised for this route (URL/reference-centric)
- conclusion:
  - candidate/unproven: `candidate`
  - verified/unproven: `verified` (route+method+paid gate+OCR semantics), `unproven` (normalization path under paid response)
  - rejected: `false`

## Candidate 2
- provider: `solana-foundation/google/vision`
- endpoint: `https://vision.google.gateway-402.com/v1/images:annotate`
- method: `POST`
- request shape:
  - required top-level: `requests[]`
  - OCR feature: `features[].type = "TEXT_DETECTION"` or `"DOCUMENT_TEXT_DETECTION"`
  - image input forms: `image.content` (base64 bytes) or `image.source.imageUri` (public image URL)
- canonical input feasibility:
  - `document_url` maps to `image.source.imageUri` for image fixture URLs
  - for PDF/TIFF route, file APIs exist but require different input config semantics
- unpaid status evidence:
  - unpaid `POST` probe to `/v1/images:annotate` returned `HTTP/2 402`
  - response body reported `error: payment_required`, `payment.protocol: mpp`, endpoint path/method, and pricing dimension
  - wrong method check: `GET` on `/v1/images:annotate` returned `HTTP/2 404`
  - file OCR route probe (`POST /v1/files:annotate`) with non-GCS URL returned `HTTP/2 400 INVALID_ARGUMENT` (`Invalid GCS path`), confirming stricter file-input shape
- payment challenge detected: `true` (for `v1/images:annotate`)
- semantic fit:
  - accepts document/image input: `true` (image URL and base64 for image endpoint; file endpoint exists for PDF/TIFF via file config)
  - returns or promises OCR text: `true` (text detection/document text detection semantics in spec)
  - likely exposes extracted text or text annotations: `true` (annotate response schemas include text annotation objects)
- caveat_objects:
  - direct PDF URL is not accepted by file route as `gcsSource.uri`; file OCR lane likely needs GCS URI or base64 content path
  - unpaid gate prevents confirming final normalized field path for canonical expected fragments
- conclusion:
  - candidate/unproven: `candidate`
  - verified/unproven: `verified` (route+method+paid gate+OCR semantics), `unproven` (paid output normalization)
  - rejected: `false`

## Excluded routes/classes
- Vision routes that are label/object/safe-search only for this benchmark intent: excluded as primary candidates when OCR feature is not requested.
- Any route discovered with only generic image annotation wording and no text extraction feature path: excluded.

## Canonical fixture blocker
- No hosted public fixture URL for the exact canonical text was identified in this repo during this pass.
- Blocker: cannot finalize canonical `document_url` without a stable public asset.
- Recommended safe path:
  1. Commit a tiny PNG/PDF fixture into this repository under a deterministic path (for example `fixtures/ocr-benchmark-001.png`).
  2. Serve it via repository raw hosting on the main/default branch (stable immutable URL convention).
  3. Reuse that same URL across both routes for comparability.

## Lane recommendation (research outcome only)
- This lane has high probability of yielding two comparable paid-proven routes:
  1. `paysponge/reducto` `POST /parse` (document-first OCR parse)
  2. `solana-foundation/google/vision` `POST /v1/images:annotate` with `DOCUMENT_TEXT_DETECTION` (image OCR)
- Current status: route viability verified with unpaid probes; benchmark not recorded; no paid execution performed.
