import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCandidateVariants,
  CANONICAL_INPUT,
  deriveRouteState,
  inspectGooglePlacesSkillDetail,
  isProofLanguageSafe,
  renderProofMarkdown,
  sanitizeProofMarkdown,
  selectPaidRetryVariant,
  unpaidRouteState,
  type SkillMetadataSummary,
} from "./diagnoseMapsGooglePlacesShapes";

test("package script exists", async () => {
  const pkg = JSON.parse(await readFile(path.resolve(process.cwd(), "package.json"), "utf8")) as { scripts?: Record<string, string> };
  assert.equal(pkg.scripts?.["diagnose:maps-google-places-shapes"], "tsx src/diagnoseMapsGooglePlacesShapes.ts");
});

test("chooses exactly one paid retry body", () => {
  const metadata: SkillMetadataSummary = {
    detail_file: "/tmp/detail.json",
    endpoint: "https://places.google.gateway-402.com/v1/places:searchText",
    supports: {
      textQuery: true,
      maxResultCount: true,
      includedType: true,
      locationBiasCircle: true,
      locationBiasRectangle: true,
      fieldsQueryParam: true,
      xGoogFieldMaskHeader: false,
    },
  };
  const variants = buildCandidateVariants(metadata);
  const selected = selectPaidRetryVariant(variants);
  const selectedCount = variants.filter((v) => v.label === selected.label).length;
  assert.equal(selectedCount, 1);
  assert.ok(selected.body.textQuery);
});

test("unpaid probes do not promote route", () => {
  assert.equal(unpaidRouteState(), "candidate/unproven");
});

test("paid zero-place response remains candidate/unproven", () => {
  const routeState = deriveRouteState({
    paidExecutionSucceeded: true,
    normalized: {
      query: CANONICAL_INPUT.query,
      location: CANONICAL_INPUT.location,
      result_count: 0,
      places: [],
      place_search_success: false,
      query_match: false,
      location_match: false,
      status_evidence: "status_code_observed_200",
      raw_status_code: 200,
      caveat_objects: [],
      evidence_health: "degraded",
    },
    caveats: [],
  });
  assert.equal(routeState, "candidate/unproven");
});

test("paid place response becomes verified/proven", () => {
  const routeState = deriveRouteState({
    paidExecutionSucceeded: true,
    normalized: {
      query: CANONICAL_INPUT.query,
      location: CANONICAL_INPUT.location,
      result_count: 1,
      places: [
        {
          name: "Cafe",
          address: "San Francisco, CA",
          latitude: 1,
          longitude: 1,
          rating: 4.5,
          review_count: 100,
          category: "coffee shop",
          website: "https://example.com",
          phone: "+1 000",
          source_url: "https://maps.google.com",
        },
      ],
      place_search_success: true,
      query_match: true,
      location_match: true,
      status_evidence: "status_code_observed_200",
      raw_status_code: 200,
      caveat_objects: [],
      evidence_health: "recorded",
    },
    caveats: [],
  });
  assert.equal(routeState, "verified/proven");
});

test("stableenrich is not executed and tripadvisor is excluded by script design", () => {
  const source = renderProofMarkdown({
    now: new Date("2026-05-20T00:00:00.000Z"),
    metadata: {
      detail_file: null,
      endpoint: "https://places.google.gateway-402.com/v1/places:searchText",
      supports: {
        textQuery: true,
        maxResultCount: true,
        includedType: true,
        locationBiasCircle: true,
        locationBiasRectangle: true,
        fieldsQueryParam: false,
        xGoogFieldMaskHeader: false,
      },
    },
    variants: [{ label: "textQuery+maxResultCount", body: { textQuery: "coffee", maxResultCount: 5 } }],
    unpaid: [{ label: "textQuery+maxResultCount", status_code: 402, payment_challenge_detected: true, status_evidence: "status_code_observed_402", response_preview: "" }],
    selectedPaidRetryVariant: { label: "textQuery+maxResultCount", body: { textQuery: "coffee", maxResultCount: 5 } },
    paidRetryAttempted: false,
    paid: null,
  });
  assert.ok(source.includes("excluded_routes: [\"stableenrich\", \"tripadvisor\"]"));
});

test("no benchmark artifact or claim language", () => {
  const markdown = renderProofMarkdown({
    now: new Date("2026-05-20T00:00:00.000Z"),
    metadata: {
      detail_file: null,
      endpoint: "https://places.google.gateway-402.com/v1/places:searchText",
      supports: {
        textQuery: true,
        maxResultCount: true,
        includedType: true,
        locationBiasCircle: true,
        locationBiasRectangle: true,
        fieldsQueryParam: false,
        xGoogFieldMaskHeader: false,
      },
    },
    variants: [{ label: "textQuery+maxResultCount", body: { textQuery: "coffee", maxResultCount: 5 } }],
    unpaid: [{ label: "textQuery+maxResultCount", status_code: 402, payment_challenge_detected: true, status_evidence: "status_code_observed_402", response_preview: "" }],
    selectedPaidRetryVariant: { label: "textQuery+maxResultCount", body: { textQuery: "coffee", maxResultCount: 5 } },
    paidRetryAttempted: false,
    paid: null,
  });
  assert.ok(markdown.includes("benchmark_artifact_created: false"));
  assert.ok(markdown.includes("comparison_claim_made: false"));
  assert.equal(isProofLanguageSafe(markdown), true);
});

test("proof safe output", () => {
  const unsafe = "authorization: Bearer secret-token";
  const safe = sanitizeProofMarkdown(unsafe);
  assert.equal(safe.includes("secret-token"), false);
});

test("local skill detail inspection resolves endpoint and core fields", async () => {
  const detail = await inspectGooglePlacesSkillDetail();
  assert.equal(detail.endpoint, "https://places.google.gateway-402.com/v1/places:searchText");
  assert.equal(detail.supports.textQuery, true);
  assert.equal(detail.supports.maxResultCount, true);
});
