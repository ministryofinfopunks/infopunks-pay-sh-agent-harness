export interface CanonicalDocumentOcrInput {
  document_url: string;
  fallback_document_url?: string;
  expected_text_fragments: string[];
}

export type DocumentOcrCaveatCode =
  | "ocr_text_partial"
  | "expected_fragments_missing"
  | "document_input_unconfirmed"
  | "no_text_detected"
  | "confidence_missing"
  | "page_count_missing"
  | "async_result_unobserved"
  | "payment_required_confirmed_only"
  | "paid_payload_unobserved"
  | "non_json_text_response"
  | "status_code_unavailable"
  | "route_not_found"
  | "method_not_allowed"
  | "auth_required"
  | "unsupported_fixture_format";

export type CaveatSeverity = "info" | "warning" | "error";
export type EvidenceHealth = "recorded" | "caveated" | "degraded" | "unverified" | "scaffold";

export interface CaveatObject {
  code: DocumentOcrCaveatCode;
  severity: CaveatSeverity;
  affects_core_semantics: boolean;
  detail: string;
}

export interface DocumentOcrTextExtractionNormalizedOutput {
  text: string | null;
  text_fragments_detected: string[];
  expected_fragment_match_rate: number;
  ocr_success: boolean;
  character_count: number | null;
  page_count: number | null;
  confidence: number | null;
  status_evidence: string;
  raw_status_code: number | null;
  caveat_objects: CaveatObject[];
  evidence_health: EvidenceHealth;
}

export interface NormalizeDocumentOcrTextExtractionInput {
  parsedJson: unknown;
  responsePreview?: string;
  statusCode?: number | null;
  statusEvidence?: string;
  paidExecutionObserved?: boolean;
  canonicalInput?: CanonicalDocumentOcrInput;
}

export interface NormalizeDocumentOcrTextExtractionResult {
  normalized: DocumentOcrTextExtractionNormalizedOutput;
  caveat_objects: CaveatObject[];
}

export interface DocumentOcrEvidenceHealthInput {
  researchOnly?: boolean;
  paidAttempts?: number;
  paidSuccesses?: number;
  paidFailures?: number;
  successfulCharacterCounts?: number[];
  latest?: NormalizeDocumentOcrTextExtractionResult;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function deepFindFirstString(obj: unknown, keys: string[]): string | null {
  if (!isObject(obj)) {
    return null;
  }
  const lowered = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [obj];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current)) {
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (lowered.has(key.toLowerCase())) {
        const found = asNonEmptyString(value);
        if (found) {
          return found;
        }
      }
      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }
  return null;
}

function deepFindFirstNumber(obj: unknown, keys: string[]): number | null {
  if (!isObject(obj)) {
    return null;
  }
  const lowered = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [obj];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current)) {
      continue;
    }
    for (const [key, value] of Object.entries(current)) {
      if (lowered.has(key.toLowerCase())) {
        const found = asFiniteNumber(value);
        if (found !== null) {
          return found;
        }
      }
      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }
  return null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function addCaveat(list: CaveatObject[], code: DocumentOcrCaveatCode, detail: string): void {
  if (list.some((entry) => entry.code === code)) {
    return;
  }

  const severityByCode: Record<DocumentOcrCaveatCode, CaveatSeverity> = {
    ocr_text_partial: "warning",
    expected_fragments_missing: "warning",
    document_input_unconfirmed: "warning",
    no_text_detected: "warning",
    confidence_missing: "warning",
    page_count_missing: "warning",
    async_result_unobserved: "warning",
    payment_required_confirmed_only: "info",
    paid_payload_unobserved: "warning",
    non_json_text_response: "warning",
    status_code_unavailable: "warning",
    route_not_found: "error",
    method_not_allowed: "error",
    auth_required: "error",
    unsupported_fixture_format: "warning",
  };

  const affectsCoreByCode: Record<DocumentOcrCaveatCode, boolean> = {
    ocr_text_partial: true,
    expected_fragments_missing: true,
    document_input_unconfirmed: false,
    no_text_detected: true,
    confidence_missing: false,
    page_count_missing: false,
    async_result_unobserved: true,
    payment_required_confirmed_only: false,
    paid_payload_unobserved: true,
    non_json_text_response: true,
    status_code_unavailable: false,
    route_not_found: true,
    method_not_allowed: true,
    auth_required: true,
    unsupported_fixture_format: false,
  };

  list.push({
    code,
    severity: severityByCode[code],
    affects_core_semantics: affectsCoreByCode[code],
    detail,
  });
}

function collectTextsFromArray(input: unknown, fieldName: string): string[] {
  const out: string[] = [];
  if (!Array.isArray(input)) {
    return out;
  }
  for (const item of input) {
    if (!isObject(item)) {
      continue;
    }
    const found = asNonEmptyString(item[fieldName]);
    if (found) {
      out.push(found);
    }
  }
  return out;
}

function extractText(parsedJson: unknown): string | null {
  if (typeof parsedJson === "string") {
    return asNonEmptyString(parsedJson);
  }
  if (!isObject(parsedJson)) {
    return null;
  }

  const scalar =
    asNonEmptyString(parsedJson.text) ??
    asNonEmptyString(parsedJson.extracted_text) ??
    asNonEmptyString(parsedJson.full_text) ??
    asNonEmptyString(parsedJson.markdown) ??
    asNonEmptyString(parsedJson.content) ??
    deepFindFirstString(parsedJson, ["fullTextAnnotation.text"]) ??
    (isObject(parsedJson.data) ? asNonEmptyString((parsedJson.data as Record<string, unknown>).text) : null);

  if (scalar) {
    return normalizeWhitespace(scalar);
  }

  const rootPages = collectTextsFromArray(parsedJson.pages, "text");
  const rootBlocks = collectTextsFromArray(parsedJson.blocks, "text");
  const rootResults = collectTextsFromArray(parsedJson.results, "text");
  const annotations = collectTextsFromArray(parsedJson.textAnnotations, "description");

  const fullTextAnnotationText =
    isObject(parsedJson.fullTextAnnotation) ? asNonEmptyString(parsedJson.fullTextAnnotation.text) : null;
  if (fullTextAnnotationText) {
    return normalizeWhitespace(fullTextAnnotationText);
  }

  let dataPages: string[] = [];
  if (isObject(parsedJson.data)) {
    const data = parsedJson.data as Record<string, unknown>;
    dataPages = collectTextsFromArray(data.pages, "text");
  }

  const collected = [...rootPages, ...rootBlocks, ...rootResults, ...annotations, ...dataPages]
    .map((value) => normalizeWhitespace(value))
    .filter((value) => value.length > 0);

  if (collected.length === 0) {
    return null;
  }
  return collected.join("\n\n");
}

function detectPageCount(parsedJson: unknown): number | null {
  if (!isObject(parsedJson)) {
    return null;
  }
  if (Array.isArray(parsedJson.pages) && parsedJson.pages.length > 0) {
    return parsedJson.pages.length;
  }
  if (isObject(parsedJson.data) && Array.isArray((parsedJson.data as Record<string, unknown>).pages)) {
    const pages = (parsedJson.data as Record<string, unknown>).pages as unknown[];
    if (pages.length > 0) {
      return pages.length;
    }
  }
  return deepFindFirstNumber(parsedJson, ["page_count", "pages_count", "num_pages", "pageCount"]);
}

function detectConfidence(parsedJson: unknown): number | null {
  return deepFindFirstNumber(parsedJson, ["confidence", "avg_confidence", "mean_confidence", "score"]);
}

function hasPendingAsyncSignal(parsedJson: unknown): boolean {
  const status = deepFindFirstString(parsedJson, ["status", "state"]);
  if (!status) {
    return false;
  }
  return /pending|processing|queued|running/i.test(status);
}

function looksUnsupportedFixture(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  const lower = url.toLowerCase().split("?")[0] ?? "";
  const extension = lower.slice(lower.lastIndexOf(".") + 1);
  const supported = new Set(["png", "jpg", "jpeg", "pdf", "tif", "tiff", "bmp", "webp", "gif"]);
  if (extension.length === 0) {
    return false;
  }
  return !supported.has(extension);
}

export function normalizeDocumentOcrTextExtraction(
  input: NormalizeDocumentOcrTextExtractionInput,
): NormalizeDocumentOcrTextExtractionResult {
  const caveatObjects: CaveatObject[] = [];
  const statusCode = typeof input.statusCode === "number" ? input.statusCode : null;
  const statusEvidence = input.statusEvidence ?? "status unavailable";

  if (statusCode === null) {
    addCaveat(caveatObjects, "status_code_unavailable", "HTTP status code was not available in execution output.");
  }
  if (statusCode === 402) {
    addCaveat(caveatObjects, "payment_required_confirmed_only", "Unpaid payment challenge observed (HTTP 402). OCR payload remains unobserved.");
    addCaveat(caveatObjects, "paid_payload_unobserved", "No paid OCR payload was observed for this route execution evidence.");
  }
  if (statusCode === 405) {
    addCaveat(caveatObjects, "method_not_allowed", "Provider rejected method for this route (HTTP 405).");
  }
  if (statusCode === 404) {
    addCaveat(caveatObjects, "route_not_found", "Provider route was not found (HTTP 404).");
  }
  if (statusCode === 401 || statusCode === 403) {
    addCaveat(caveatObjects, "auth_required", "Provider requires explicit authentication/authorization (HTTP 401/403).");
  }
  if (typeof input.parsedJson === "string") {
    addCaveat(caveatObjects, "non_json_text_response", "Response payload was plain text and not structured JSON.");
  }

  const text = extractText(input.parsedJson);
  const normalizedText = text ? normalizeWhitespace(text) : null;
  const characterCount = normalizedText ? normalizedText.length : null;
  const pageCount = detectPageCount(input.parsedJson);
  const confidence = detectConfidence(input.parsedJson);

  if (hasPendingAsyncSignal(input.parsedJson) && !normalizedText) {
    addCaveat(caveatObjects, "async_result_unobserved", "OCR route indicates async processing state without observable extracted text payload.");
  }
  if (!normalizedText) {
    addCaveat(caveatObjects, "no_text_detected", "OCR response did not include any detectable text content.");
  }
  if (confidence === null) {
    addCaveat(caveatObjects, "confidence_missing", "OCR response did not expose confidence.");
  }
  if (pageCount === null) {
    addCaveat(caveatObjects, "page_count_missing", "OCR response did not expose page count.");
  }

  const expectedFragments = input.canonicalInput?.expected_text_fragments ?? [];
  const textForMatch = normalizedText ? normalizeForMatch(normalizedText) : "";
  const detected = expectedFragments.filter((fragment) => {
    const normalizedFragment = normalizeForMatch(fragment);
    return normalizedFragment.length > 0 && textForMatch.includes(normalizedFragment);
  });

  const matchRate = expectedFragments.length > 0 ? detected.length / expectedFragments.length : 0;
  const ocrSuccess = detected.length >= 2;

  if (detected.length < expectedFragments.length) {
    addCaveat(caveatObjects, "expected_fragments_missing", "Not all expected OCR benchmark fragments were detected in extracted text.");
  }
  if (detected.length > 0 && detected.length < expectedFragments.length) {
    addCaveat(caveatObjects, "ocr_text_partial", "Only a subset of expected OCR benchmark fragments was detected.");
  }

  const canonicalUrl = input.canonicalInput?.document_url ?? null;
  if (looksUnsupportedFixture(canonicalUrl)) {
    addCaveat(caveatObjects, "unsupported_fixture_format", "Canonical fixture format may not be supported reliably by this OCR route.");
  }

  const echoedDocumentUrl = deepFindFirstString(input.parsedJson, ["document_url", "image_url", "url", "source_url", "file_url"]);
  if (canonicalUrl) {
    if (!echoedDocumentUrl) {
      addCaveat(caveatObjects, "document_input_unconfirmed", "Response did not echo an input document URL; canonical input match is unconfirmed.");
    } else if (normalizeForMatch(echoedDocumentUrl) !== normalizeForMatch(canonicalUrl)) {
      addCaveat(caveatObjects, "document_input_unconfirmed", "Response echoed a document URL that differs from canonical input.");
    }
  } else {
    addCaveat(caveatObjects, "document_input_unconfirmed", "Canonical document input was not provided for input-match confirmation.");
  }

  const normalized: DocumentOcrTextExtractionNormalizedOutput = {
    text: normalizedText,
    text_fragments_detected: detected,
    expected_fragment_match_rate: Number(matchRate.toFixed(4)),
    ocr_success: ocrSuccess,
    character_count: characterCount,
    page_count: pageCount,
    confidence,
    status_evidence: statusEvidence,
    raw_status_code: statusCode,
    caveat_objects: caveatObjects,
    evidence_health: "unverified",
  };

  return {
    normalized,
    caveat_objects: caveatObjects,
  };
}

export function deriveDocumentOcrEvidenceHealth(input: DocumentOcrEvidenceHealthInput): EvidenceHealth {
  if (input.researchOnly) {
    return "scaffold";
  }

  const paidSuccesses = input.paidSuccesses ?? 0;
  const paidFailures = input.paidFailures ?? 0;
  if (paidSuccesses < 1) {
    return "unverified";
  }
  if (paidFailures >= 2) {
    return "degraded";
  }

  const successfulCharacterCounts = input.successfulCharacterCounts ?? [];
  if (successfulCharacterCounts.length > 0 && successfulCharacterCounts.every((count) => count <= 0)) {
    return "degraded";
  }

  const latest = input.latest;
  if (!latest) {
    return "caveated";
  }

  const codes = new Set(latest.caveat_objects.map((entry) => entry.code));
  if (codes.has("no_text_detected")) {
    return "degraded";
  }

  const blockingCodes = new Set<DocumentOcrCaveatCode>([
    "route_not_found",
    "method_not_allowed",
    "auth_required",
    "paid_payload_unobserved",
    "async_result_unobserved",
  ]);
  const hasBlocking = latest.caveat_objects.some((entry) => blockingCodes.has(entry.code));

  const caveatedSignalCodes = new Set<DocumentOcrCaveatCode>([
    "confidence_missing",
    "page_count_missing",
    "status_code_unavailable",
    "document_input_unconfirmed",
    "unsupported_fixture_format",
    "ocr_text_partial",
    "expected_fragments_missing",
  ]);
  const hasCaveatedSignals = latest.caveat_objects.some((entry) => caveatedSignalCodes.has(entry.code));

  if (latest.normalized.ocr_success && latest.normalized.expected_fragment_match_rate >= 1 && !hasBlocking && !hasCaveatedSignals) {
    return "recorded";
  }
  return "caveated";
}
