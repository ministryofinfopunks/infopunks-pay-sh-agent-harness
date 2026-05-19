export interface CanonicalRedditPostSearchInput {
  query: string;
  limit: number;
}

export interface RedditPostNormalized {
  title: string | null;
  url: string | null;
  permalink: string | null;
  subreddit: string | null;
  author: string | null;
  created_at: string | null;
  score: number | null;
  snippet: string | null;
}

export type SocialDataRedditPostSearchCaveatCode =
  | "reddit_search_semantics_partial"
  | "query_unconfirmed"
  | "result_count_missing"
  | "no_posts_returned"
  | "post_url_missing"
  | "subreddit_missing"
  | "author_missing"
  | "timestamp_missing"
  | "payment_required_confirmed_only"
  | "paid_payload_unobserved"
  | "non_json_text_response"
  | "status_code_unavailable"
  | "route_not_found"
  | "auth_required";

export type CaveatSeverity = "info" | "warning" | "error";

export interface CaveatObject {
  code: SocialDataRedditPostSearchCaveatCode;
  severity: CaveatSeverity;
  affects_core_semantics: boolean;
  detail: string;
}

export type EvidenceHealth = "recorded" | "caveated" | "degraded" | "unverified" | "scaffold";

export interface SocialDataRedditPostSearchNormalizedOutput {
  query: string;
  result_count: number | null;
  posts: RedditPostNormalized[];
  search_success: boolean;
  query_match: boolean | null;
  status_evidence: string;
  raw_status_code: number | null;
  caveat_objects: CaveatObject[];
  evidence_health: EvidenceHealth;
}

export interface NormalizeSocialDataRedditPostSearchInput {
  parsedJson: unknown;
  responsePreview?: string;
  statusCode?: number | null;
  statusEvidence?: string;
  paidExecutionObserved?: boolean;
  canonicalInput?: CanonicalRedditPostSearchInput;
}

export interface NormalizeSocialDataRedditPostSearchResult {
  normalized: SocialDataRedditPostSearchNormalizedOutput;
  caveat_objects: CaveatObject[];
}

export interface SocialDataRedditPostSearchEvidenceHealthInput {
  researchOnly?: boolean;
  paidAttempts?: number;
  paidSuccesses?: number;
  paidFailures?: number;
  successfulPostCounts?: number[];
  latest?: NormalizeSocialDataRedditPostSearchResult;
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

function deepFindFirstBoolean(obj: unknown, keys: string[]): boolean | null {
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
      if (lowered.has(key.toLowerCase()) && typeof value === "boolean") {
        return value;
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

function looksLikePost(item: unknown): item is Record<string, unknown> {
  if (!isObject(item)) {
    return false;
  }
  const keys = Object.keys(item).map((key) => key.toLowerCase());
  return keys.some((key) =>
    key === "title" ||
    key === "permalink" ||
    key === "subreddit" ||
    key === "author" ||
    key === "selftext" ||
    key === "snippet" ||
    key === "createdat" ||
    key === "created_at" ||
    key === "url",
  );
}

function collectPostArrays(input: unknown): unknown[][] {
  const found: unknown[][] = [];
  const queue: unknown[] = [input];

  while (queue.length > 0) {
    const current = queue.shift();

    if (Array.isArray(current)) {
      if (current.some((entry) => looksLikePost(entry))) {
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

    for (const value of Object.values(current)) {
      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return found;
}

function extractPosts(parsedJson: unknown): RedditPostNormalized[] {
  if (!isObject(parsedJson) && !Array.isArray(parsedJson)) {
    return [];
  }

  const arrays = collectPostArrays(parsedJson);
  const rawPosts = arrays.length > 0 ? arrays[0] : [];

  const out: RedditPostNormalized[] = [];
  for (const raw of rawPosts) {
    if (!isObject(raw)) {
      continue;
    }

    const title = asNonEmptyString(raw.title) ?? asNonEmptyString(raw.name) ?? null;
    const url = asNonEmptyString(raw.url) ?? asNonEmptyString(raw.link) ?? null;
    const permalink = asNonEmptyString(raw.permalink) ?? null;
    const subreddit = asNonEmptyString(raw.subreddit) ?? asNonEmptyString(raw.subreddit_name_prefixed) ?? null;
    const author = asNonEmptyString(raw.author) ?? asNonEmptyString(raw.username) ?? null;
    const created_at = asNonEmptyString(raw.created_at) ?? asNonEmptyString(raw.createdAt) ?? null;
    const score = asFiniteNumber(raw.score);
    const snippet = asNonEmptyString(raw.snippet) ?? asNonEmptyString(raw.selftext) ?? null;

    out.push({
      title,
      url,
      permalink,
      subreddit,
      author,
      created_at,
      score,
      snippet,
    });
  }

  return out;
}

function addCaveat(list: CaveatObject[], code: SocialDataRedditPostSearchCaveatCode, detail: string): void {
  if (list.some((entry) => entry.code === code)) {
    return;
  }

  const severityByCode: Record<SocialDataRedditPostSearchCaveatCode, CaveatSeverity> = {
    reddit_search_semantics_partial: "warning",
    query_unconfirmed: "warning",
    result_count_missing: "warning",
    no_posts_returned: "warning",
    post_url_missing: "warning",
    subreddit_missing: "warning",
    author_missing: "warning",
    timestamp_missing: "warning",
    payment_required_confirmed_only: "info",
    paid_payload_unobserved: "warning",
    non_json_text_response: "warning",
    status_code_unavailable: "warning",
    route_not_found: "error",
    auth_required: "error",
  };

  const affectsCoreByCode: Record<SocialDataRedditPostSearchCaveatCode, boolean> = {
    reddit_search_semantics_partial: true,
    query_unconfirmed: false,
    result_count_missing: false,
    no_posts_returned: true,
    post_url_missing: false,
    subreddit_missing: false,
    author_missing: false,
    timestamp_missing: false,
    payment_required_confirmed_only: false,
    paid_payload_unobserved: true,
    non_json_text_response: true,
    status_code_unavailable: false,
    route_not_found: true,
    auth_required: true,
  };

  list.push({
    code,
    severity: severityByCode[code],
    affects_core_semantics: affectsCoreByCode[code],
    detail,
  });
}

export function normalizeSocialDataRedditPostSearch(
  input: NormalizeSocialDataRedditPostSearchInput,
): NormalizeSocialDataRedditPostSearchResult {
  const caveatObjects: CaveatObject[] = [];
  const statusCode = typeof input.statusCode === "number" ? input.statusCode : null;
  const statusEvidence = input.statusEvidence ?? "status unavailable";
  const canonicalQuery = input.canonicalInput?.query ?? "";
  const paidObserved = input.paidExecutionObserved === true;

  if (statusCode === null) {
    addCaveat(caveatObjects, "status_code_unavailable", "HTTP status code was not available in execution output.");
  }
  if (statusCode === 402) {
    addCaveat(caveatObjects, "payment_required_confirmed_only", "Unpaid payment challenge observed (HTTP 402). Reddit search payload remains unobserved.");
    addCaveat(caveatObjects, "paid_payload_unobserved", "No paid payload was observed for this route execution evidence.");
  }
  if (statusCode === 404) {
    addCaveat(caveatObjects, "route_not_found", "Provider route was not found (HTTP 404).");
  }
  if (statusCode === 401 || statusCode === 403) {
    addCaveat(caveatObjects, "auth_required", "Provider requires explicit authentication/authorization.");
  }

  if (typeof input.parsedJson === "string") {
    addCaveat(caveatObjects, "non_json_text_response", "Response payload was plain text and not structured JSON.");
  }

  const echoedQuery =
    deepFindFirstString(input.parsedJson, ["query", "keywords", "q"]) ??
    deepFindFirstString(input.parsedJson, ["searchQuery"]) ??
    deepFindFirstString(input.parsedJson, ["searchContext"]);

  let queryMatch: boolean | null = null;
  if (canonicalQuery) {
    if (echoedQuery) {
      queryMatch = normalizeForMatch(echoedQuery) === normalizeForMatch(canonicalQuery);
    } else {
      addCaveat(caveatObjects, "query_unconfirmed", "Response does not echo query text; query match could not be confirmed.");
    }
  }

  const posts = extractPosts(input.parsedJson);
  const explicitResultCount =
    deepFindFirstNumber(input.parsedJson, ["result_count", "resultCount", "count", "total"]) ??
    deepFindFirstNumber(input.parsedJson, ["searchContext", "resultCount"]);

  if (explicitResultCount === null) {
    addCaveat(caveatObjects, "result_count_missing", "Response does not expose an explicit result count.");
  }

  if (posts.length === 0 && paidObserved) {
    addCaveat(caveatObjects, "no_posts_returned", "Paid response included zero posts.");
  }

  if (posts.length > 0) {
    if (posts.some((post) => !post.url && !post.permalink)) {
      addCaveat(caveatObjects, "post_url_missing", "One or more posts are missing both url and permalink.");
    }
    if (posts.some((post) => !post.subreddit)) {
      addCaveat(caveatObjects, "subreddit_missing", "One or more posts are missing subreddit.");
    }
    if (posts.some((post) => !post.author)) {
      addCaveat(caveatObjects, "author_missing", "One or more posts are missing author.");
    }
    if (posts.some((post) => !post.created_at)) {
      addCaveat(caveatObjects, "timestamp_missing", "One or more posts are missing created_at timestamp.");
    }
  }

  if (paidObserved && posts.length === 0 && statusCode !== 402 && statusCode !== 404) {
    addCaveat(caveatObjects, "reddit_search_semantics_partial", "Paid execution did not produce recognizable Reddit post objects.");
  }

  const explicitSuccess = deepFindFirstBoolean(input.parsedJson, ["search_success", "success"]);
  const searchSuccess = explicitSuccess ?? posts.length > 0;

  const provisional: SocialDataRedditPostSearchNormalizedOutput = {
    query: canonicalQuery || echoedQuery || "",
    result_count: explicitResultCount,
    posts,
    search_success: searchSuccess,
    query_match: queryMatch,
    status_evidence: statusEvidence,
    raw_status_code: statusCode,
    caveat_objects: caveatObjects,
    evidence_health: "caveated",
  };

  const evidenceHealth = deriveSocialDataRedditPostSearchEvidenceHealth({
    paidAttempts: paidObserved ? 1 : 0,
    paidSuccesses: paidObserved && statusCode !== null && statusCode >= 200 && statusCode < 300 ? 1 : 0,
    paidFailures: paidObserved && !(statusCode !== null && statusCode >= 200 && statusCode < 300) ? 1 : 0,
    latest: {
      normalized: provisional,
      caveat_objects: caveatObjects,
    },
  });

  const normalized: SocialDataRedditPostSearchNormalizedOutput = {
    ...provisional,
    caveat_objects: caveatObjects,
    evidence_health: evidenceHealth,
  };

  return {
    normalized,
    caveat_objects: caveatObjects,
  };
}

export function deriveSocialDataRedditPostSearchEvidenceHealth(
  input: SocialDataRedditPostSearchEvidenceHealthInput,
): EvidenceHealth {
  const researchOnly = input.researchOnly === true;
  const paidAttempts = input.paidAttempts ?? 0;
  const paidSuccesses = input.paidSuccesses ?? 0;
  const paidFailures = input.paidFailures ?? Math.max(0, paidAttempts - paidSuccesses);
  const latest = input.latest;

  if (researchOnly && paidAttempts === 0) {
    return "scaffold";
  }

  if (paidAttempts === 0 || paidSuccesses === 0) {
    return "unverified";
  }

  if (paidFailures >= 2) {
    return "degraded";
  }

  if (Array.isArray(input.successfulPostCounts) && input.successfulPostCounts.length > 0 && input.successfulPostCounts.every((v) => v === 0)) {
    return "degraded";
  }

  const normalized = latest?.normalized;
  const caveats = latest?.caveat_objects ?? [];
  const posts = normalized?.posts ?? [];

  if (posts.length === 0) {
    return "degraded";
  }

  const hasRecordedPost = posts.some((post) => Boolean(post.title && (post.url || post.permalink) && post.subreddit));
  if (!hasRecordedPost) {
    return "caveated";
  }

  if (normalized?.raw_status_code === null) {
    return "caveated";
  }

  if (normalized?.query_match !== true || normalized.result_count === null) {
    return "caveated";
  }

  const caveatedCodes = new Set<SocialDataRedditPostSearchCaveatCode>([
    "query_unconfirmed",
    "result_count_missing",
    "post_url_missing",
    "subreddit_missing",
    "author_missing",
    "timestamp_missing",
    "reddit_search_semantics_partial",
    "status_code_unavailable",
  ]);

  if (caveats.some((entry) => caveatedCodes.has(entry.code))) {
    return "caveated";
  }

  return "recorded";
}
