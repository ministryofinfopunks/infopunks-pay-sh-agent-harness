export interface CanonicalWebSearchInput {
  query: string;
  limit: number;
}

export interface WebSearchResultNormalized {
  title: string | null;
  url: string | null;
  snippet: string | null;
  source: string | null;
  published_at: string | null;
}

export type DataWebSearchResultsCaveatCode =
  | "web_search_semantics_partial"
  | "query_unconfirmed"
  | "result_count_missing"
  | "no_results_returned"
  | "result_title_missing"
  | "result_url_missing"
  | "result_snippet_missing"
  | "source_missing"
  | "published_at_missing"
  | "payment_required_confirmed_only"
  | "paid_payload_unobserved"
  | "non_json_text_response"
  | "status_code_unavailable"
  | "route_not_found"
  | "method_not_allowed"
  | "auth_required";

export type CaveatSeverity = "info" | "warning" | "error";

export interface CaveatObject {
  code: DataWebSearchResultsCaveatCode;
  severity: CaveatSeverity;
  affects_core_semantics: boolean;
  detail: string;
}

export type EvidenceHealth = "recorded" | "caveated" | "degraded" | "unverified" | "scaffold";

export interface DataWebSearchResultsNormalizedOutput {
  query: string;
  result_count: number | null;
  results: WebSearchResultNormalized[];
  search_success: boolean;
  query_match: boolean | null;
  status_evidence: string;
  raw_status_code: number | null;
  caveat_objects: CaveatObject[];
  evidence_health: EvidenceHealth;
}

export interface NormalizeDataWebSearchResultsInput {
  parsedJson: unknown;
  responsePreview?: string;
  statusCode?: number | null;
  statusEvidence?: string;
  paidExecutionObserved?: boolean;
  canonicalInput?: CanonicalWebSearchInput;
}

export interface NormalizeDataWebSearchResultsResult {
  normalized: DataWebSearchResultsNormalizedOutput;
  caveat_objects: CaveatObject[];
}

export interface DataWebSearchResultsEvidenceHealthInput {
  researchOnly?: boolean;
  paidAttempts?: number;
  paidSuccesses?: number;
  paidFailures?: number;
  successfulResultCounts?: number[];
  latest?: NormalizeDataWebSearchResultsResult;
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

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase();
}

function addCaveat(list: CaveatObject[], code: DataWebSearchResultsCaveatCode, detail: string): void {
  if (list.some((entry) => entry.code === code)) {
    return;
  }

  const severityByCode: Record<DataWebSearchResultsCaveatCode, CaveatSeverity> = {
    web_search_semantics_partial: "warning",
    query_unconfirmed: "warning",
    result_count_missing: "warning",
    no_results_returned: "warning",
    result_title_missing: "warning",
    result_url_missing: "warning",
    result_snippet_missing: "warning",
    source_missing: "warning",
    published_at_missing: "warning",
    payment_required_confirmed_only: "info",
    paid_payload_unobserved: "warning",
    non_json_text_response: "warning",
    status_code_unavailable: "warning",
    route_not_found: "error",
    method_not_allowed: "error",
    auth_required: "error",
  };

  const affectsCoreSemanticsByCode: Record<DataWebSearchResultsCaveatCode, boolean> = {
    web_search_semantics_partial: true,
    query_unconfirmed: false,
    result_count_missing: false,
    no_results_returned: true,
    result_title_missing: false,
    result_url_missing: true,
    result_snippet_missing: false,
    source_missing: false,
    published_at_missing: false,
    payment_required_confirmed_only: false,
    paid_payload_unobserved: true,
    non_json_text_response: true,
    status_code_unavailable: false,
    route_not_found: true,
    method_not_allowed: true,
    auth_required: true,
  };

  list.push({
    code,
    severity: severityByCode[code],
    affects_core_semantics: affectsCoreSemanticsByCode[code],
    detail,
  });
}

function looksLikeResult(item: unknown): item is Record<string, unknown> {
  if (!isObject(item)) {
    return false;
  }
  const keys = Object.keys(item).map((key) => key.toLowerCase());
  return keys.some((key) =>
    key === "title" ||
    key === "name" ||
    key === "headline" ||
    key === "url" ||
    key === "link" ||
    key === "href" ||
    key === "snippet" ||
    key === "description" ||
    key === "summary" ||
    key === "content",
  );
}

function collectResultArrays(input: unknown): unknown[][] {
  const found: unknown[][] = [];
  const queue: unknown[] = [input];

  const preferredArrayKeys = new Set([
    "results",
    "organic",
    "items",
    "data",
    "webresults",
    "searchresults",
    "documents",
  ]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (Array.isArray(current)) {
      if (current.some((entry) => looksLikeResult(entry))) {
        found.push(current);
      }
      for (const entry of current) {
        if (isObject(entry) || Array.isArray(entry)) {
          queue.push(entry);
        }
      }
      continue;
    }

    if (!isObject(current)) {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (Array.isArray(value) && preferredArrayKeys.has(key.toLowerCase()) && value.some((entry) => looksLikeResult(entry))) {
        found.push(value);
      }
      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return found;
}

function deriveSourceFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function extractResults(parsedJson: unknown): WebSearchResultNormalized[] {
  if (!isObject(parsedJson) && !Array.isArray(parsedJson)) {
    return [];
  }

  const arrays = collectResultArrays(parsedJson);
  const rawResults = arrays.length > 0 ? arrays[0] : [];

  const out: WebSearchResultNormalized[] = [];
  for (const raw of rawResults) {
    if (!isObject(raw)) {
      continue;
    }

    const title = asNonEmptyString(raw.title) ?? asNonEmptyString(raw.name) ?? asNonEmptyString(raw.headline) ?? null;
    const url =
      asNonEmptyString(raw.url) ??
      asNonEmptyString(raw.link) ??
      asNonEmptyString(raw.href) ??
      asNonEmptyString(raw.source_url) ??
      null;
    const snippet =
      asNonEmptyString(raw.snippet) ??
      asNonEmptyString(raw.text) ??
      asNonEmptyString(raw.description) ??
      asNonEmptyString(raw.summary) ??
      asNonEmptyString(raw.content) ??
      null;
    const source =
      asNonEmptyString(raw.source) ??
      asNonEmptyString(raw.domain) ??
      asNonEmptyString(raw.site) ??
      asNonEmptyString(raw.hostname) ??
      deriveSourceFromUrl(url);
    const publishedAt =
      asNonEmptyString(raw.published_at) ??
      asNonEmptyString(raw.publishedDate) ??
      asNonEmptyString(raw.date) ??
      asNonEmptyString(raw.timestamp) ??
      null;

    out.push({
      title,
      url,
      snippet,
      source,
      published_at: publishedAt,
    });
  }

  return out;
}

function inferResultCount(parsedJson: unknown, extractedLength: number): { value: number | null; explicit: boolean } {
  const explicit = deepFindFirstNumber(parsedJson, ["result_count", "results_count", "total", "count"]);
  if (explicit !== null) {
    return { value: explicit, explicit: true };
  }
  if (extractedLength > 0) {
    return { value: extractedLength, explicit: false };
  }
  return { value: 0, explicit: false };
}

export function normalizeDataWebSearchResults(
  input: NormalizeDataWebSearchResultsInput,
): NormalizeDataWebSearchResultsResult {
  const caveatObjects: CaveatObject[] = [];
  const statusCode = typeof input.statusCode === "number" ? input.statusCode : null;
  const statusEvidence = input.statusEvidence ?? "status unavailable";
  const paidObserved = input.paidExecutionObserved === true;

  if (statusCode === null) {
    addCaveat(caveatObjects, "status_code_unavailable", "HTTP status code was not available in execution output.");
  }
  if (statusCode === 402) {
    addCaveat(caveatObjects, "payment_required_confirmed_only", "Unpaid payment challenge observed (HTTP 402). Web search payload remains unobserved.");
    addCaveat(caveatObjects, "paid_payload_unobserved", "No paid payload was observed for this route execution evidence.");
  }
  if (statusCode === 404) {
    addCaveat(caveatObjects, "route_not_found", "Provider route was not found (HTTP 404).");
  }
  if (statusCode === 405) {
    addCaveat(caveatObjects, "method_not_allowed", "Provider rejected request method (HTTP 405).");
  }
  if (statusCode === 401) {
    addCaveat(caveatObjects, "auth_required", "Provider requires explicit authentication/authorization (HTTP 401).");
  }

  if (typeof input.parsedJson === "string") {
    addCaveat(caveatObjects, "non_json_text_response", "Response payload was plain text and not structured JSON.");
  }

  const results = extractResults(input.parsedJson);
  const count = inferResultCount(input.parsedJson, results.length);

  if (!count.explicit) {
    addCaveat(caveatObjects, "result_count_missing", "Response does not expose an explicit result count.");
  }

  if (results.length === 0) {
    addCaveat(caveatObjects, "no_results_returned", "Paid response included zero search results.");
  }

  if (results.some((entry) => !entry.title)) {
    addCaveat(caveatObjects, "result_title_missing", "One or more results are missing title.");
  }
  if (results.some((entry) => !entry.url)) {
    addCaveat(caveatObjects, "result_url_missing", "One or more results are missing URL.");
  }
  if (results.some((entry) => !entry.snippet)) {
    addCaveat(caveatObjects, "result_snippet_missing", "One or more results are missing snippet.");
  }
  if (results.some((entry) => !entry.source)) {
    addCaveat(caveatObjects, "source_missing", "One or more results are missing source/domain.");
  }
  if (results.some((entry) => !entry.published_at)) {
    addCaveat(caveatObjects, "published_at_missing", "One or more results are missing published_at timestamp.");
  }

  const queryEcho = deepFindFirstString(input.parsedJson, ["query", "q", "search", "searchTerm", "search_term"]);
  let queryMatch: boolean | null = null;
  if (input.canonicalInput?.query) {
    if (queryEcho) {
      queryMatch = normalizeForMatch(queryEcho).includes(normalizeForMatch(input.canonicalInput.query));
    } else {
      addCaveat(caveatObjects, "query_unconfirmed", "Response does not echo query text; query match could not be confirmed.");
    }
  }

  const searchSuccess = results.length > 0 && (statusCode === null || statusCode < 400);

  if (paidObserved && results.length === 0) {
    addCaveat(caveatObjects, "web_search_semantics_partial", "Paid execution did not produce recognizable web search result objects.");
  }

  const normalized: DataWebSearchResultsNormalizedOutput = {
    query: input.canonicalInput?.query ?? queryEcho ?? "",
    result_count: count.value,
    results,
    search_success: searchSuccess,
    query_match: queryMatch,
    status_evidence: statusEvidence,
    raw_status_code: statusCode,
    caveat_objects: caveatObjects,
    evidence_health: "caveated",
  };

  return {
    normalized,
    caveat_objects: caveatObjects,
  };
}

export function deriveDataWebSearchResultsEvidenceHealth(
  input: DataWebSearchResultsEvidenceHealthInput,
): EvidenceHealth {
  if (input.researchOnly) {
    return "scaffold";
  }

  const paidAttempts = input.paidAttempts ?? 0;
  const paidSuccesses = input.paidSuccesses ?? 0;
  const paidFailures = input.paidFailures ?? Math.max(0, paidAttempts - paidSuccesses);

  if (paidAttempts === 0 || paidSuccesses === 0) {
    return "unverified";
  }

  const zeroCountAcrossSuccesses = (input.successfulResultCounts ?? []).length > 0
    && (input.successfulResultCounts ?? []).every((count) => count <= 0);
  if (paidFailures >= 2 || zeroCountAcrossSuccesses) {
    return "degraded";
  }

  const latest = input.latest;
  if (!latest) {
    return "caveated";
  }

  const caveats = latest.caveat_objects ?? [];
  const hasTitleAndUrl = latest.normalized.results.some((entry) => Boolean(entry.title && entry.url));

  if (!hasTitleAndUrl) {
    return "degraded";
  }

  const caveatCodeSet = new Set(caveats.map((entry) => entry.code));
  const caveatedCodes = [
    "query_unconfirmed",
    "result_count_missing",
    "result_snippet_missing",
    "source_missing",
    "published_at_missing",
    "status_code_unavailable",
  ] satisfies DataWebSearchResultsCaveatCode[];

  if (caveats.length === 0) {
    return "recorded";
  }

  if (caveatedCodes.some((code) => caveatCodeSet.has(code))) {
    return "caveated";
  }

  const hasHardSemanticGap = caveats.some((entry) =>
    entry.code === "web_search_semantics_partial" ||
    entry.code === "no_results_returned" ||
    entry.code === "paid_payload_unobserved" ||
    entry.code === "non_json_text_response" ||
    entry.code === "route_not_found" ||
    entry.code === "method_not_allowed" ||
    entry.code === "auth_required" ||
    entry.code === "result_url_missing",
  );

  return hasHardSemanticGap ? "degraded" : "caveated";
}
