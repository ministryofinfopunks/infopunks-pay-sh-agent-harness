import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveDocumentOcrEvidenceHealth,
  normalizeDocumentOcrTextExtraction,
  type NormalizeDocumentOcrTextExtractionResult,
} from "./documentOcrTextExtractionNormalization";

const canonicalInput = {
  document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
  fallback_document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.svg",
  expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "OCR BENCHMARK 001"],
};

test("Reducto-like response with text normalizes", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      text: "INFOPUNKS RADAR\nEVIDENCE BEFORE SPEND\nOCR BENCHMARK 001",
      page_count: 1,
      confidence: 0.98,
      document_url: canonicalInput.document_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.ocr_success, true);
  assert.equal(result.normalized.expected_fragment_match_rate, 1);
  assert.equal(result.normalized.page_count, 1);
});

test("Vision-like response with fullTextAnnotation.text normalizes", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      fullTextAnnotation: {
        text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
      },
      confidence: 0.93,
      pages: [{}, {}],
      image_url: canonicalInput.document_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.ocr_success, true);
  assert.equal(result.normalized.page_count, 2);
});

test("textAnnotations response normalizes", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      textAnnotations: [
        { description: "INFOPUNKS RADAR" },
        { description: "EVIDENCE BEFORE SPEND" },
        { description: "OCR BENCHMARK 001" },
      ],
      confidence: 0.9,
      page_count: 1,
      document_url: canonicalInput.document_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.ocr_success, true);
  assert.equal(result.normalized.text_fragments_detected.length, 3);
});

test("pages[].text response normalizes", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      pages: [{ text: "INFOPUNKS RADAR" }, { text: "EVIDENCE BEFORE SPEND OCR BENCHMARK 001" }],
      confidence: 0.88,
      document_url: canonicalInput.document_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.page_count, 2);
  assert.equal(result.normalized.ocr_success, true);
});

test("partial fragment detection adds partial caveats", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      text: "INFOPUNKS RADAR ... OCR BENCHMARK 001",
      confidence: 0.8,
      page_count: 1,
      document_url: canonicalInput.document_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.ocr_success, true);
  assert.equal(result.normalized.expected_fragment_match_rate, 0.6667);
  assert.ok(result.caveat_objects.some((entry) => entry.code === "ocr_text_partial"));
});

test("whitespace and case-insensitive matching works", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      text: "  infopunks    radar\n\n evidence before   spend \n OCR benchmark 001 ",
      confidence: 0.8,
      page_count: 1,
      document_url: canonicalInput.document_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.expected_fragment_match_rate, 1);
  assert.equal(result.normalized.ocr_success, true);
});

test("zero text adds no_text_detected", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      page_count: 1,
      confidence: 0.77,
      document_url: canonicalInput.document_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.text, null);
  assert.ok(result.caveat_objects.some((entry) => entry.code === "no_text_detected"));
});

test("402 payment-required only adds caveats", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: { error: "Payment Required" },
    statusCode: 402,
    paidExecutionObserved: false,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "payment_required_confirmed_only"));
  assert.ok(result.caveat_objects.some((entry) => entry.code === "paid_payload_unobserved"));
});

test("405 method not allowed adds method_not_allowed", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: { error: "Method Not Allowed" },
    statusCode: 405,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "method_not_allowed"));
});

test("404 route not found adds route_not_found", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: { error: "Not Found" },
    statusCode: 404,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "route_not_found"));
});

test("non-JSON response adds non_json_text_response", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: "upstream timeout",
    statusCode: 502,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "non_json_text_response"));
});

test("pay_cli hidden status adds status_code_unavailable", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
      page_count: 1,
      confidence: 0.9,
      document_url: canonicalInput.document_url,
    },
    statusCode: null,
    statusEvidence: "pay_cli_exit_0_status_unavailable",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.raw_status_code, null);
  assert.equal(result.normalized.status_evidence, "pay_cli_exit_0_status_unavailable");
  assert.ok(result.caveat_objects.some((entry) => entry.code === "status_code_unavailable"));
});

test("confidence missing adds confidence_missing", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
      page_count: 1,
      document_url: canonicalInput.document_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "confidence_missing"));
});

test("unsupported fixture format caveat appears", () => {
  const result = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
      page_count: 1,
      confidence: 0.9,
      document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.svg",
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput: {
      ...canonicalInput,
      document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.svg",
    },
  });

  assert.ok(result.caveat_objects.some((entry) => entry.code === "unsupported_fixture_format"));
});

function withLatest(result: NormalizeDocumentOcrTextExtractionResult): NormalizeDocumentOcrTextExtractionResult {
  return {
    normalized: result.normalized,
    caveat_objects: result.caveat_objects,
  };
}

test("evidence_health derivation", () => {
  const recordedLatest = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
      page_count: 1,
      confidence: 0.97,
      document_url: canonicalInput.document_url,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  const recorded = deriveDocumentOcrEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 1,
    paidFailures: 0,
    successfulCharacterCounts: [recordedLatest.normalized.character_count ?? 0],
    latest: withLatest(recordedLatest),
  });
  assert.equal(recorded, "recorded");

  const caveatedLatest = normalizeDocumentOcrTextExtraction({
    parsedJson: {
      text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
      document_url: canonicalInput.document_url,
    },
    statusCode: null,
    paidExecutionObserved: true,
    canonicalInput,
  });
  const caveated = deriveDocumentOcrEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 1,
    paidFailures: 0,
    latest: withLatest(caveatedLatest),
  });
  assert.equal(caveated, "caveated");

  const degraded = deriveDocumentOcrEvidenceHealth({
    paidAttempts: 3,
    paidSuccesses: 1,
    paidFailures: 2,
    successfulCharacterCounts: [0],
    latest: withLatest(caveatedLatest),
  });
  assert.equal(degraded, "degraded");

  const unverified = deriveDocumentOcrEvidenceHealth({
    paidAttempts: 1,
    paidSuccesses: 0,
    paidFailures: 1,
  });
  assert.equal(unverified, "unverified");

  const scaffold = deriveDocumentOcrEvidenceHealth({
    researchOnly: true,
    paidAttempts: 0,
    paidSuccesses: 0,
    paidFailures: 0,
  });
  assert.equal(scaffold, "scaffold");
});
