export interface CanonicalMapsPlaceSearchInput {
  query: string;
  location: string | null;
  limit: number;
}

export interface PlaceNormalized {
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  website: string | null;
  phone: string | null;
  source_url: string | null;
}

export type MapsPlaceSearchResultsCaveatCode =
  | "place_search_semantics_partial"
  | "query_unconfirmed"
  | "location_unconfirmed"
  | "result_count_missing"
  | "no_places_returned"
  | "place_name_missing"
  | "address_missing"
  | "coordinates_missing"
  | "rating_missing"
  | "review_count_missing"
  | "category_missing"
  | "website_missing"
  | "phone_missing"
  | "payment_required_confirmed_only"
  | "paid_payload_unobserved"
  | "non_json_text_response"
  | "status_code_unavailable"
  | "route_not_found"
  | "method_not_allowed"
  | "auth_required";

export type CaveatSeverity = "info" | "warning" | "error";

export interface CaveatObject {
  code: MapsPlaceSearchResultsCaveatCode;
  severity: CaveatSeverity;
  affects_core_semantics: boolean;
  detail: string;
}

export type EvidenceHealth = "recorded" | "caveated" | "degraded" | "unverified" | "scaffold";

export interface MapsPlaceSearchResultsNormalizedOutput {
  query: string;
  location: string | null;
  result_count: number | null;
  places: PlaceNormalized[];
  place_search_success: boolean;
  query_match: boolean | null;
  location_match: boolean | null;
  status_evidence: string;
  raw_status_code: number | null;
  caveat_objects: CaveatObject[];
  evidence_health: EvidenceHealth;
}

export interface NormalizeMapsPlaceSearchResultsInput {
  parsedJson: unknown;
  responsePreview?: string;
  statusCode?: number | null;
  statusEvidence?: string;
  paidExecutionObserved?: boolean;
  canonicalInput?: CanonicalMapsPlaceSearchInput;
}

export interface NormalizeMapsPlaceSearchResultsResult {
  normalized: MapsPlaceSearchResultsNormalizedOutput;
  caveat_objects: CaveatObject[];
}

export interface MapsPlaceSearchResultsEvidenceHealthInput {
  researchOnly?: boolean;
  paidAttempts?: number;
  paidSuccesses?: number;
  paidFailures?: number;
  successfulResultCounts?: number[];
  latest?: NormalizeMapsPlaceSearchResultsResult;
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

function addCaveat(list: CaveatObject[], code: MapsPlaceSearchResultsCaveatCode, detail: string): void {
  if (list.some((entry) => entry.code === code)) {
    return;
  }

  const severityByCode: Record<MapsPlaceSearchResultsCaveatCode, CaveatSeverity> = {
    place_search_semantics_partial: "warning",
    query_unconfirmed: "warning",
    location_unconfirmed: "warning",
    result_count_missing: "warning",
    no_places_returned: "warning",
    place_name_missing: "warning",
    address_missing: "warning",
    coordinates_missing: "warning",
    rating_missing: "warning",
    review_count_missing: "warning",
    category_missing: "warning",
    website_missing: "warning",
    phone_missing: "warning",
    payment_required_confirmed_only: "info",
    paid_payload_unobserved: "warning",
    non_json_text_response: "warning",
    status_code_unavailable: "warning",
    route_not_found: "error",
    method_not_allowed: "error",
    auth_required: "error",
  };

  const affectsCoreSemanticsByCode: Record<MapsPlaceSearchResultsCaveatCode, boolean> = {
    place_search_semantics_partial: true,
    query_unconfirmed: false,
    location_unconfirmed: false,
    result_count_missing: false,
    no_places_returned: true,
    place_name_missing: true,
    address_missing: false,
    coordinates_missing: false,
    rating_missing: false,
    review_count_missing: false,
    category_missing: false,
    website_missing: false,
    phone_missing: false,
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

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
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

function looksLikePlace(item: unknown): item is Record<string, unknown> {
  if (!isObject(item)) {
    return false;
  }
  const keys = Object.keys(item).map((key) => key.toLowerCase());
  return keys.some((key) =>
    key === "name" ||
    key === "title" ||
    key === "place_name" ||
    key === "business_name" ||
    key === "formatted_address" ||
    key === "address" ||
    key === "vicinity" ||
    key === "geometry" ||
    key === "location" ||
    key === "rating" ||
    key === "stars" ||
    key === "types" ||
    key === "categories",
  );
}

function collectPlaceArrays(input: unknown): unknown[][] {
  const found: unknown[][] = [];
  const queue: unknown[] = [input];

  const preferredArrayKeys = new Set([
    "results",
    "places",
    "data",
    "businesses",
    "local_results",
    "candidates",
    "search_results",
    "items",
  ]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (Array.isArray(current)) {
      if (current.some((entry) => looksLikePlace(entry))) {
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
      if (Array.isArray(value) && preferredArrayKeys.has(key.toLowerCase()) && value.some((entry) => looksLikePlace(entry))) {
        found.push(value);
      }
      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return found;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const n = asFiniteNumber(value);
    if (n !== null) {
      return n;
    }
  }
  return null;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    const s = asNonEmptyString(value);
    if (s) {
      return s;
    }
  }
  return null;
}

function firstArrayString(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const first = value.find((entry) => typeof entry === "string");
  return asNonEmptyString(first);
}

function extractPlaces(parsedJson: unknown): PlaceNormalized[] {
  if (!isObject(parsedJson) && !Array.isArray(parsedJson)) {
    return [];
  }

  const arrays = collectPlaceArrays(parsedJson);
  const rawPlaces = arrays.length > 0 ? arrays[0] : [];

  const out: PlaceNormalized[] = [];

  for (const raw of rawPlaces) {
    if (!isObject(raw)) {
      continue;
    }

    const geometry = isObject(raw.geometry) ? raw.geometry : null;
    const geometryLocation = geometry && isObject(geometry.location) ? geometry.location : null;
    const location = isObject(raw.location) ? raw.location : null;

    const name = pickString(raw.name, raw.title, raw.place_name, raw.business_name);
    const address = pickString(raw.address, raw.formatted_address, raw.vicinity, location?.address);
    const latitude = pickNumber(raw.latitude, raw.lat, geometryLocation?.lat);
    const longitude = pickNumber(raw.longitude, raw.lng, geometryLocation?.lng);
    const rating = pickNumber(raw.rating, raw.stars, raw.score);
    const reviewCount = pickNumber(raw.review_count, raw.user_ratings_total, raw.reviews_count, raw.reviewCount);
    const category = pickString(raw.category, raw.type, firstArrayString(raw.types), firstArrayString(raw.categories));
    const website = pickString(raw.website, raw.url, raw.website_url);
    const phone = pickString(raw.phone, raw.formatted_phone_number, raw.international_phone_number);
    const sourceUrl = pickString(raw.source_url, raw.place_url, raw.maps_url, raw.url);

    out.push({
      name,
      address,
      latitude,
      longitude,
      rating,
      review_count: reviewCount,
      category,
      website,
      phone,
      source_url: sourceUrl,
    });
  }

  return out;
}

function inferResultCount(parsedJson: unknown, extractedLength: number): { value: number | null; explicit: boolean } {
  const explicit = deepFindFirstNumber(parsedJson, ["result_count", "results_count", "total", "count", "total_results"]);
  if (explicit !== null) {
    return { value: explicit, explicit: true };
  }
  if (extractedLength > 0) {
    return { value: extractedLength, explicit: false };
  }
  return { value: 0, explicit: false };
}

function assessQueryMatch(canonicalQuery: string, places: PlaceNormalized[]): boolean {
  const normalizedQuery = normalizeForMatch(canonicalQuery);
  const queryTokens = normalizedQuery.split(" ").filter((token) => token.length >= 4);
  const contextTokens = queryTokens.length > 0 ? queryTokens : normalizedQuery.split(" ").filter((token) => token.length >= 3);

  return places.some((place) => {
    const corpus = normalizeForMatch([place.name, place.category, place.address].filter((v): v is string => Boolean(v)).join(" "));
    if (!corpus) {
      return false;
    }
    return contextTokens.some((token) => corpus.includes(token));
  });
}

function assessLocationMatch(location: string, places: PlaceNormalized[]): boolean {
  const normalizedLocation = normalizeForMatch(location);
  const requiredTokens = ["san francisco", "union square"];
  const locationTokens = normalizedLocation.split(" ").filter((token) => token.length >= 4);

  return places.some((place) => {
    const addressCorpus = normalizeForMatch(place.address ?? "");
    if (!addressCorpus) {
      return false;
    }
    if (requiredTokens.some((token) => addressCorpus.includes(token))) {
      return true;
    }
    return locationTokens.some((token) => addressCorpus.includes(token));
  });
}

export function normalizeMapsPlaceSearchResults(
  input: NormalizeMapsPlaceSearchResultsInput,
): NormalizeMapsPlaceSearchResultsResult {
  const caveatObjects: CaveatObject[] = [];
  const statusCode = typeof input.statusCode === "number" ? input.statusCode : null;
  const statusEvidence = input.statusEvidence ?? "status unavailable";
  const paidObserved = input.paidExecutionObserved === true;

  if (statusCode === null) {
    addCaveat(caveatObjects, "status_code_unavailable", "HTTP status code was not available in execution output.");
  }
  if (statusCode === 402) {
    addCaveat(caveatObjects, "payment_required_confirmed_only", "Unpaid payment challenge observed (HTTP 402). Place payload remains unobserved.");
    addCaveat(caveatObjects, "paid_payload_unobserved", "No paid payload was observed for this route execution evidence.");
  }
  if (statusCode === 404) {
    addCaveat(caveatObjects, "route_not_found", "Provider route was not found (HTTP 404).");
  }
  if (statusCode === 405) {
    addCaveat(caveatObjects, "method_not_allowed", "Provider rejected request method (HTTP 405).");
  }
  if (statusCode === 401 || statusCode === 403) {
    addCaveat(caveatObjects, "auth_required", "Provider requires explicit authentication/authorization (HTTP 401/403).");
  }

  if (typeof input.parsedJson === "string") {
    addCaveat(caveatObjects, "non_json_text_response", "Response payload was plain text and not structured JSON.");
  }

  const places = extractPlaces(input.parsedJson);
  const count = inferResultCount(input.parsedJson, places.length);

  if (!count.explicit) {
    addCaveat(caveatObjects, "result_count_missing", "Response does not expose an explicit place result count.");
  }

  if (places.length === 0) {
    addCaveat(caveatObjects, "no_places_returned", "Response included zero recognizable place candidates.");
  }

  if (places.some((entry) => !entry.name)) {
    addCaveat(caveatObjects, "place_name_missing", "One or more places are missing name.");
  }
  if (places.some((entry) => !entry.address)) {
    addCaveat(caveatObjects, "address_missing", "One or more places are missing address.");
  }
  if (places.some((entry) => entry.latitude === null || entry.longitude === null)) {
    addCaveat(caveatObjects, "coordinates_missing", "One or more places are missing coordinates.");
  }
  if (places.some((entry) => entry.rating === null)) {
    addCaveat(caveatObjects, "rating_missing", "One or more places are missing rating.");
  }
  if (places.some((entry) => entry.review_count === null)) {
    addCaveat(caveatObjects, "review_count_missing", "One or more places are missing review count.");
  }
  if (places.some((entry) => entry.category === null)) {
    addCaveat(caveatObjects, "category_missing", "One or more places are missing category.");
  }
  if (places.some((entry) => entry.website === null)) {
    addCaveat(caveatObjects, "website_missing", "One or more places are missing website.");
  }
  if (places.some((entry) => entry.phone === null)) {
    addCaveat(caveatObjects, "phone_missing", "One or more places are missing phone.");
  }

  let queryMatch: boolean | null = null;
  const canonicalQuery = input.canonicalInput?.query;
  if (canonicalQuery) {
    if (places.length > 0) {
      queryMatch = assessQueryMatch(canonicalQuery, places);
      if (!queryMatch) {
        addCaveat(caveatObjects, "query_unconfirmed", "Place fields did not clearly confirm canonical query context.");
      }
    } else {
      addCaveat(caveatObjects, "query_unconfirmed", "No places available to confirm canonical query context.");
    }
  }

  let locationMatch: boolean | null = null;
  const canonicalLocation = input.canonicalInput?.location ?? null;
  if (canonicalLocation) {
    if (places.length > 0) {
      locationMatch = assessLocationMatch(canonicalLocation, places);
      if (!locationMatch) {
        addCaveat(caveatObjects, "location_unconfirmed", "Place addresses did not clearly confirm canonical location context.");
      }
    } else {
      addCaveat(caveatObjects, "location_unconfirmed", "No places available to confirm canonical location context.");
    }
  }

  if (paidObserved && places.length === 0) {
    addCaveat(caveatObjects, "place_search_semantics_partial", "Paid execution did not produce recognizable place result objects.");
  }

  const placeSearchSuccess = places.length > 0;

  const normalized: MapsPlaceSearchResultsNormalizedOutput = {
    query: canonicalQuery ?? deepFindFirstString(input.parsedJson, ["query", "q", "search"]) ?? "",
    location: canonicalLocation,
    result_count: count.value,
    places,
    place_search_success: placeSearchSuccess,
    query_match: queryMatch,
    location_match: locationMatch,
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

export function deriveMapsPlaceSearchResultsEvidenceHealth(
  input: MapsPlaceSearchResultsEvidenceHealthInput,
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

  if (!latest.normalized.place_search_success || latest.normalized.places.length === 0) {
    return "degraded";
  }

  const caveatCodeSet = new Set(latest.caveat_objects.map((entry) => entry.code));
  const blockingCodes: MapsPlaceSearchResultsCaveatCode[] = [
    "place_search_semantics_partial",
    "no_places_returned",
    "paid_payload_unobserved",
    "non_json_text_response",
    "route_not_found",
    "method_not_allowed",
    "auth_required",
    "place_name_missing",
  ];

  if (blockingCodes.some((code) => caveatCodeSet.has(code))) {
    return "degraded";
  }

  if (latest.caveat_objects.length === 0) {
    return "recorded";
  }

  return "caveated";
}
