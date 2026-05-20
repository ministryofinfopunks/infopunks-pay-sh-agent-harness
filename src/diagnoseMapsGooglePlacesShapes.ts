import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { executeLivePayShCall, type ExecuteLivePayShCallInput } from "./livePayShExecutor";
import {
  deriveMapsPlaceSearchResultsEvidenceHealth,
  normalizeMapsPlaceSearchResults,
  type CaveatObject,
  type MapsPlaceSearchResultsNormalizedOutput,
} from "./benchmarks/mapsPlaceSearchResultsNormalization";

const BENCHMARK_ID = "maps-place-search-results";
const PROVIDER_ID = "solana-foundation/google/places";
const ENDPOINT = "https://places.google.gateway-402.com/v1/places:searchText";
const METHOD = "POST" as const;
const PAY_SKILLS_DETAIL_DIR = path.join(os.homedir(), ".config/pay/skills/detail");
const FORBIDDEN_LANGUAGE = /\b(best|top|winner|loser|superiority)\b/i;

export const CANONICAL_INPUT = {
  query: "coffee near Union Square San Francisco",
  location: "Union Square, San Francisco, CA",
  limit: 5,
} as const;

const SENSITIVE_PATTERNS = [
  /authorization\s*[:=]\s*[^\n]+/gi,
  /x-payment\s*[:=]\s*[^\n]+/gi,
  /payment-signature\s*[:=]\s*[^\n]+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s,;)]+/gi,
];

export type RouteState = "verified/proven" | "candidate/unproven" | "rejected";

export interface RequestVariant {
  label: string;
  body: Record<string, unknown>;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface UnpaidProbeResult {
  label: string;
  status_code: number | null;
  payment_challenge_detected: boolean;
  status_evidence: string;
  response_preview: string;
}

export interface SkillMetadataSummary {
  detail_file: string | null;
  endpoint: string;
  supports: {
    textQuery: boolean;
    maxResultCount: boolean;
    includedType: boolean;
    locationBiasCircle: boolean;
    locationBiasRectangle: boolean;
    fieldsQueryParam: boolean;
    xGoogFieldMaskHeader: boolean;
  };
}

export function paidExecutionEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.LIVE_PAYSH_EXECUTION === "true" && env.PAYSH_EXECUTION_MODE === "pay_cli";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function statusEvidence(statusCode: number | null, exitCode: number | null, errorReason?: string): string {
  if (statusCode !== null) {
    return `status_code_observed_${statusCode}`;
  }
  if (exitCode !== null) {
    return errorReason ? `pay_cli_exit_${exitCode}_${errorReason}` : `pay_cli_exit_${exitCode}_status_unavailable`;
  }
  return errorReason ? `status_unavailable_${errorReason}` : "status_unavailable";
}

export function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export function isProofLanguageSafe(markdown: string): boolean {
  return !FORBIDDEN_LANGUAGE.test(markdown);
}

export async function inspectGooglePlacesSkillDetail(detailDir = PAY_SKILLS_DETAIL_DIR): Promise<SkillMetadataSummary> {
  const fallback: SkillMetadataSummary = {
    detail_file: null,
    endpoint: ENDPOINT,
    supports: {
      textQuery: true,
      maxResultCount: true,
      includedType: false,
      locationBiasCircle: false,
      locationBiasRectangle: false,
      fieldsQueryParam: false,
      xGoogFieldMaskHeader: false,
    },
  };

  try {
    const entries = await readdir(detailDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const abs = path.join(detailDir, entry.name);
      const raw = await readFile(abs, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!isObject(parsed) || parsed.fqn !== PROVIDER_ID) {
        continue;
      }

      const text = JSON.stringify(parsed);
      const endpoint = ENDPOINT;
      return {
        detail_file: abs,
        endpoint,
        supports: {
          textQuery: text.includes("textQuery"),
          maxResultCount: text.includes("maxResultCount"),
          includedType: text.includes("includedType"),
          locationBiasCircle: text.includes("locationBias") && text.includes("circle"),
          locationBiasRectangle: text.includes("locationBias") && text.includes("rectangle"),
          fieldsQueryParam: text.includes("\"name\":\"fields\"") || text.includes("/components/parameters/fields"),
          xGoogFieldMaskHeader: text.includes("X-Goog-FieldMask"),
        },
      };
    }
  } catch {
    return fallback;
  }
  return fallback;
}

export function buildCandidateVariants(metadata: SkillMetadataSummary): RequestVariant[] {
  const variants: RequestVariant[] = [];
  const textQuery = `${CANONICAL_INPUT.query} in ${CANONICAL_INPUT.location}`;
  const simpleTextQuery = "coffee shops Union Square San Francisco";

  variants.push({ label: "textQuery+maxResultCount", body: { textQuery, maxResultCount: CANONICAL_INPUT.limit } });

  if (metadata.supports.includedType) {
    variants.push({
      label: "textQuery+maxResultCount+includedType",
      body: { textQuery, maxResultCount: CANONICAL_INPUT.limit, includedType: "cafe" },
    });
  }

  if (metadata.supports.locationBiasCircle) {
    variants.push({
      label: "textQuery+maxResultCount+locationBias.circle",
      body: {
        textQuery,
        maxResultCount: CANONICAL_INPUT.limit,
        locationBias: {
          circle: {
            center: { latitude: 37.78799, longitude: -122.40744 },
            radius: 1200,
          },
        },
      },
    });
  }

  if (metadata.supports.locationBiasRectangle) {
    variants.push({
      label: "textQuery+maxResultCount+locationBias.rectangle",
      body: {
        textQuery,
        maxResultCount: CANONICAL_INPUT.limit,
        locationBias: {
          rectangle: {
            low: { latitude: 37.782, longitude: -122.413 },
            high: { latitude: 37.792, longitude: -122.403 },
          },
        },
      },
    });
  }

  variants.push({ label: "simple-textQuery", body: { textQuery: simpleTextQuery, maxResultCount: CANONICAL_INPUT.limit } });

  if (metadata.supports.fieldsQueryParam) {
    variants.push({
      label: "textQuery+maxResultCount+fields-query-param",
      body: { textQuery, maxResultCount: CANONICAL_INPUT.limit },
      queryParams: { fields: "places.displayName,places.formattedAddress,places.location" },
    });
  }

  if (metadata.supports.xGoogFieldMaskHeader) {
    variants.push({
      label: "textQuery+maxResultCount+x-goog-fieldmask-header",
      body: { textQuery, maxResultCount: CANONICAL_INPUT.limit },
      headers: { "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location" },
    });
  }

  return variants;
}

export function selectPaidRetryVariant(variants: RequestVariant[]): RequestVariant {
  const rank = [
    "textQuery+maxResultCount+includedType",
    "textQuery+maxResultCount+locationBias.circle",
    "textQuery+maxResultCount+locationBias.rectangle",
    "textQuery+maxResultCount",
    "simple-textQuery",
    "textQuery+maxResultCount+fields-query-param",
    "textQuery+maxResultCount+x-goog-fieldmask-header",
  ];
  for (const label of rank) {
    const found = variants.find((v) => v.label === label);
    if (found) {
      return found;
    }
  }
  return variants[0] ?? { label: "fallback", body: { textQuery: CANONICAL_INPUT.query, maxResultCount: CANONICAL_INPUT.limit } };
}

function withQueryParams(endpoint: string, queryParams?: Record<string, string>): string {
  if (!queryParams || Object.keys(queryParams).length === 0) {
    return endpoint;
  }
  const url = new URL(endpoint);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function unpaidProbe(variant: RequestVariant): Promise<UnpaidProbeResult> {
  const url = withQueryParams(ENDPOINT, variant.queryParams);
  try {
    const response = await fetch(url, {
      method: METHOD,
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        ...(variant.headers ?? {}),
      },
      body: JSON.stringify(variant.body),
    });
    const bodyText = await response.text();
    return {
      label: variant.label,
      status_code: response.status,
      payment_challenge_detected: response.status === 402 || Boolean(response.headers.get("payment-required") || response.headers.get("www-authenticate")),
      status_evidence: `status_code_observed_${response.status}`,
      response_preview: bodyText.slice(0, 300),
    };
  } catch (error) {
    return {
      label: variant.label,
      status_code: null,
      payment_challenge_detected: false,
      status_evidence: `probe_error_${error instanceof Error ? error.message : String(error)}`,
      response_preview: "",
    };
  }
}

export function deriveRouteState(input: { paidExecutionSucceeded: boolean; normalized: MapsPlaceSearchResultsNormalizedOutput; caveats: CaveatObject[] }): RouteState {
  const hardReject = input.caveats.some((c) => c.code === "route_not_found" || c.code === "method_not_allowed" || c.code === "auth_required");
  if (hardReject) {
    return "rejected";
  }
  if (input.paidExecutionSucceeded && input.normalized.place_search_success && input.normalized.places.length > 0) {
    return "verified/proven";
  }
  return "candidate/unproven";
}

export function unpaidRouteState(): RouteState {
  return "candidate/unproven";
}

export function renderProofMarkdown(input: {
  now: Date;
  metadata: SkillMetadataSummary;
  variants: RequestVariant[];
  unpaid: UnpaidProbeResult[];
  selectedPaidRetryVariant: RequestVariant;
  paidRetryAttempted: boolean;
  paid: null | {
    paid_execution_status: "succeeded" | "failed";
    cli_exit_code: number | null;
    status_evidence: string;
    normalized_output: MapsPlaceSearchResultsNormalizedOutput;
    result_count: number | null;
    place_search_success: boolean;
    query_match: boolean | null;
    location_match: boolean | null;
    caveat_objects: CaveatObject[];
    evidence_health: MapsPlaceSearchResultsNormalizedOutput["evidence_health"];
    route_state: RouteState;
  };
}): string {
  const lines: string[] = [
    `# Google Places Shape Diagnostic (${input.now.toISOString().slice(0, 10)})`,
    "",
    `- benchmark_id: ${BENCHMARK_ID}`,
    `- canonical_input: ${JSON.stringify(CANONICAL_INPUT)}`,
    `- unpaid variants tested: ${JSON.stringify(input.variants.map((v) => v.label))}`,
    `- selected_paid_retry_variant: ${input.selectedPaidRetryVariant.label}`,
    `- paid_retry_attempted: ${String(input.paidRetryAttempted)}`,
    `- paid_retry_count: ${input.paidRetryAttempted ? "1" : "0"}`,
    `- endpoint: ${ENDPOINT}`,
    `- route_specific_body: ${JSON.stringify(input.selectedPaidRetryVariant.body)}`,
    "",
    "## Skill Metadata",
    `- detail_file: ${input.metadata.detail_file ?? "not_found"}`,
    `- request_field_support: ${JSON.stringify(input.metadata.supports)}`,
    "",
    "## Unpaid Probe Status Evidence",
  ];

  for (const row of input.unpaid) {
    lines.push(
      `- ${row.label}: status_code=${row.status_code === null ? "null" : String(row.status_code)} payment_challenge_detected=${String(row.payment_challenge_detected)} status_evidence=${row.status_evidence}`,
    );
  }

  if (input.paid) {
    lines.push("", "## Paid Retry");
    lines.push(`- paid_execution_status: ${input.paid.paid_execution_status}`);
    lines.push(`- cli_exit_code: ${input.paid.cli_exit_code === null ? "null" : String(input.paid.cli_exit_code)}`);
    lines.push(`- status_evidence: ${input.paid.status_evidence}`);
    lines.push(`- normalized_output: ${JSON.stringify(input.paid.normalized_output)}`);
    lines.push(`- result_count: ${input.paid.result_count === null ? "null" : String(input.paid.result_count)}`);
    lines.push(`- place_search_success: ${String(input.paid.place_search_success)}`);
    lines.push(`- query_match: ${input.paid.query_match === null ? "null" : String(input.paid.query_match)}`);
    lines.push(`- location_match: ${input.paid.location_match === null ? "null" : String(input.paid.location_match)}`);
    lines.push(`- caveat_objects: ${JSON.stringify(input.paid.caveat_objects)}`);
    lines.push(`- evidence_health: ${input.paid.evidence_health}`);
    lines.push(`- route_state: ${input.paid.route_state}`);
  } else {
    lines.push("", "## Paid Retry");
    lines.push("- paid_execution_status: skipped");
    lines.push("- cli_exit_code: null");
    lines.push("- status_evidence: paid_retry_skipped_env_gate_not_satisfied");
    lines.push("- normalized_output: null");
    lines.push("- result_count: null");
    lines.push("- place_search_success: false");
    lines.push("- query_match: null");
    lines.push("- location_match: null");
    lines.push("- caveat_objects: []");
    lines.push("- evidence_health: unverified");
    lines.push("- route_state: candidate/unproven");
  }

  lines.push("", "## Guardrails");
  lines.push("- benchmark_artifact_created: false");
  lines.push("- benchmark_record_marked: false");
  lines.push("- comparison_claim_made: false");
  lines.push("- excluded_routes: [\"stableenrich\", \"tripadvisor\"]");

  lines.push("", "## Conclusion");
  lines.push(`- conclusion: ${input.paid?.route_state ?? "candidate/unproven"}`);

  const markdown = sanitizeProofMarkdown(lines.join("\n"));
  if (!isProofLanguageSafe(markdown)) {
    throw new Error("Proof includes prohibited comparison language.");
  }
  return markdown;
}

async function main(): Promise<void> {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const proofPath = path.resolve(process.cwd(), `live-proofs/maps-place-search-results-google-places-shape-diagnostic-${datePart}.md`);
  const metadata = await inspectGooglePlacesSkillDetail();
  const variants = buildCandidateVariants(metadata);
  const unpaid = await Promise.all(variants.map((variant) => unpaidProbe(variant)));
  const selected = selectPaidRetryVariant(variants);

  let paid: null | {
    paid_execution_status: "succeeded" | "failed";
    cli_exit_code: number | null;
    status_evidence: string;
    normalized_output: MapsPlaceSearchResultsNormalizedOutput;
    result_count: number | null;
    place_search_success: boolean;
    query_match: boolean | null;
    location_match: boolean | null;
    caveat_objects: CaveatObject[];
    evidence_health: MapsPlaceSearchResultsNormalizedOutput["evidence_health"];
    route_state: RouteState;
  } = null;

  const doPaidRetry = paidExecutionEnabled(process.env);
  if (doPaidRetry) {
    const paidCallInput: ExecuteLivePayShCallInput = {
      providerId: PROVIDER_ID,
      intent: BENCHMARK_ID,
      endpointUrl: withQueryParams(ENDPOINT, selected.queryParams),
      method: METHOD,
      bodyJson: selected.body,
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        ...(selected.headers ?? {}),
      },
    };
    const paidResult = await executeLivePayShCall(paidCallInput);
    const paidSucceeded = paidResult.success;
    const evidence = statusEvidence(paidResult.statusCode ?? null, paidResult.exitCode ?? null, paidResult.errorReason);
    const normalizedResult = normalizeMapsPlaceSearchResults({
      parsedJson: paidResult.parsedJsonAvailable ? paidResult.parsedJson ?? {} : paidResult.responsePreview,
      responsePreview: paidResult.responsePreview,
      statusCode: paidResult.statusCode ?? null,
      statusEvidence: evidence,
      paidExecutionObserved: paidSucceeded,
      canonicalInput: CANONICAL_INPUT,
    });
    const evidenceHealth = deriveMapsPlaceSearchResultsEvidenceHealth({
      paidAttempts: 1,
      paidSuccesses: paidSucceeded ? 1 : 0,
      paidFailures: paidSucceeded ? 0 : 1,
      successfulResultCounts: paidSucceeded ? [normalizedResult.normalized.places.length] : [],
      latest: normalizedResult,
    });
    const mergedNormalized = { ...normalizedResult.normalized, evidence_health: evidenceHealth, caveat_objects: normalizedResult.caveat_objects };
    paid = {
      paid_execution_status: paidSucceeded ? "succeeded" : "failed",
      cli_exit_code: paidResult.exitCode ?? null,
      status_evidence: evidence,
      normalized_output: mergedNormalized,
      result_count: mergedNormalized.result_count,
      place_search_success: mergedNormalized.place_search_success,
      query_match: mergedNormalized.query_match,
      location_match: mergedNormalized.location_match,
      caveat_objects: normalizedResult.caveat_objects,
      evidence_health: evidenceHealth,
      route_state: deriveRouteState({
        paidExecutionSucceeded: paidSucceeded,
        normalized: mergedNormalized,
        caveats: normalizedResult.caveat_objects,
      }),
    };
  }

  const markdown = renderProofMarkdown({
    now,
    metadata,
    variants,
    unpaid,
    selectedPaidRetryVariant: selected,
    paidRetryAttempted: doPaidRetry,
    paid,
  });

  await mkdir(path.dirname(proofPath), { recursive: true });
  await writeFile(proofPath, `${markdown}\n`, "utf8");
  console.log(proofPath);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
