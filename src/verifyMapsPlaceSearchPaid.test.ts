import assert from "node:assert/strict";
import test from "node:test";

import type { LivePayShExecutionResult } from "./types";
import {
  deriveRouteState,
  getRouteConfigs,
  hashCanonicalInput,
  renderProofMarkdown,
  runPaidRoute,
  validateSafetyGate,
} from "./verifyMapsPlaceSearchPaid";

function fakeLiveResult(overrides: Partial<LivePayShExecutionResult> = {}): LivePayShExecutionResult {
  return {
    providerId: "solana-foundation/google/places",
    intent: "maps-place-search-results",
    endpointUrl: "https://places.google.gateway-402.com/v1/places:searchText",
    startedAt: new Date("2026-05-20T00:00:00.000Z").toISOString(),
    completedAt: new Date("2026-05-20T00:00:01.000Z").toISOString(),
    latencyMs: 1000,
    success: true,
    statusCode: 200,
    exitCode: 0,
    costUsd: null,
    settlementReference: null,
    responsePreview: "{}",
    parsedJsonAvailable: true,
    parsedJson: {
      places: [
        {
          name: "Blue Bottle Coffee",
          formatted_address: "66 Mint St, San Francisco, CA 94103",
          geometry: { location: { lat: 37.782, lng: -122.407 } },
          rating: 4.6,
          user_ratings_total: 181,
          types: ["coffee_shop"],
          website_url: "https://bluebottlecoffee.com",
          international_phone_number: "+1 415-000-0000",
          maps_url: "https://maps.google.com/?cid=1",
        },
      ],
      result_count: 1,
    },
    mode: "live_pay_sh_cli",
    ...overrides,
  };
}

test("route-specific body generation for Google Places", () => {
  const body = getRouteConfigs().google.buildBody({
    query: "coffee near Union Square San Francisco",
    location: "Union Square, San Francisco, CA",
    limit: 5,
  });

  assert.deepEqual(body, {
    textQuery: "coffee near Union Square San Francisco in Union Square, San Francisco, CA",
    maxResultCount: 5,
  });
});

test("route-specific body generation for StableEnrich Google Maps/local enrichment", () => {
  const body = getRouteConfigs().stableenrich.buildBody({
    query: "coffee near Union Square San Francisco",
    location: "Union Square, San Francisco, CA",
    limit: 5,
  });

  assert.deepEqual(body, {
    textQuery: "coffee near Union Square San Francisco in Union Square, San Francisco, CA",
    maxResultCount: 5,
  });
});

test("canonical input hash", () => {
  const hash = hashCanonicalInput({
    query: "coffee near Union Square San Francisco",
    location: "Union Square, San Francisco, CA",
    limit: 5,
  });

  assert.equal(hash, "0643d20a99e3aa47d3ca0f16bdc8ff5af7b2f888a5fa18f65ef6507c14333539");
});

test("successful Google Places paid fixture normalization", async () => {
  const proof = await runPaidRoute(getRouteConfigs().google, "h", async () => fakeLiveResult());
  assert.equal(proof.provider, "Google Places SearchText");
  assert.equal(proof.paid_execution_status, "succeeded");
  assert.equal(proof.place_search_success, true);
  assert.equal(proof.route_state, "verified/proven");
});

test("successful StableEnrich paid fixture normalization", async () => {
  const proof = await runPaidRoute(
    getRouteConfigs().stableenrich,
    "h",
    async () =>
      fakeLiveResult({
        providerId: "merit-systems/stableenrich/enrichment",
        endpointUrl: "https://stableenrich.dev/api/google-maps/text-search/partial",
        parsedJson: {
          local_results: [
            {
              title: "Cafe Encore",
              address: "123 Powell St, San Francisco, CA 94102",
              latitude: 37.787,
              longitude: -122.407,
              stars: 4.2,
              reviews_count: 58,
              categories: ["Coffee Shop"],
              website: "https://encore.example",
              phone: "+1 415-111-2222",
              source_url: "https://maps.example/place/encore",
            },
          ],
          count: 1,
        },
      }),
  );

  assert.equal(proof.provider, "StableEnrich Google Maps Text Search");
  assert.equal(proof.paid_execution_status, "succeeded");
  assert.equal(proof.place_search_success, true);
  assert.equal(proof.route_state, "verified/proven");
});

test("failed route remains candidate/unproven", async () => {
  const proof = await runPaidRoute(
    getRouteConfigs().google,
    "h",
    async () =>
      fakeLiveResult({
        success: false,
        exitCode: 1,
        statusCode: undefined,
        parsedJsonAvailable: false,
        responsePreview: "payment required",
      }),
  );

  assert.equal(proof.paid_execution_status, "failed");
  assert.equal(proof.route_state, "candidate/unproven");
});

test("zero places remains candidate/unproven and degraded", async () => {
  const proof = await runPaidRoute(
    getRouteConfigs().google,
    "h",
    async () =>
      fakeLiveResult({
        parsedJson: { places: [], result_count: 0 },
      }),
  );

  assert.equal(proof.paid_execution_status, "succeeded");
  assert.equal(proof.place_search_success, false);
  assert.equal(proof.route_state, "candidate/unproven");
  assert.equal(proof.evidence_health, "degraded");
});

test("route_state/evidence_health distinction", () => {
  const state = deriveRouteState({
    paidCallSuccess: true,
    normalized: {
      normalized: {
        query: "coffee near Union Square San Francisco",
        location: "Union Square, San Francisco, CA",
        result_count: 1,
        places: [
          {
            name: "Blue Bottle Coffee",
            address: "66 Mint St, San Francisco, CA",
            latitude: 37.782,
            longitude: -122.407,
            rating: null,
            review_count: null,
            category: null,
            website: null,
            phone: null,
            source_url: null,
          },
        ],
        place_search_success: true,
        query_match: true,
        location_match: true,
        status_evidence: "pay_cli_exit_0_status_unavailable",
        raw_status_code: null,
        caveat_objects: [],
        evidence_health: "caveated",
      },
      caveat_objects: [
        {
          code: "status_code_unavailable",
          severity: "warning",
          affects_core_semantics: false,
          detail: "status hidden",
        },
      ],
    },
  });

  assert.equal(state, "verified/proven");
});

test("proof safe output", () => {
  const markdown = renderProofMarkdown(
    [
      {
        benchmark_id: "maps-place-search-results",
        provider: "Google Places SearchText",
        endpoint: "https://places.google.gateway-402.com/v1/places:searchText",
        method: "POST",
        canonical_input_hash: "abc",
        canonical_input: {
          query: "coffee near Union Square San Francisco",
          location: "Union Square, San Francisco, CA",
          limit: 5,
        },
        route_specific_body: { textQuery: "coffee", maxResultCount: 5 },
        paid_execution_status: "succeeded",
        cli_exit_code: 0,
        status_evidence: "authorization: Bearer secret",
        normalized_output: {
          query: "coffee near Union Square San Francisco",
          location: "Union Square, San Francisco, CA",
          result_count: 1,
          places: [
            {
              name: "Blue Bottle Coffee",
              address: "66 Mint St, San Francisco, CA",
              latitude: 37.782,
              longitude: -122.407,
              rating: 4.6,
              review_count: 181,
              category: "coffee",
              website: "https://bluebottlecoffee.com",
              phone: "+1 415-000-0000",
              source_url: "https://maps.google.com/?cid=1",
            },
          ],
          place_search_success: true,
          query_match: true,
          location_match: true,
          status_evidence: "authorization: Bearer secret",
          raw_status_code: 200,
          caveat_objects: [],
          evidence_health: "recorded",
        },
        result_count: 1,
        place_search_success: true,
        query_match: true,
        location_match: true,
        sample_normalized_place_fields: [],
        caveat_objects: [],
        evidence_health: "recorded",
        route_state: "verified/proven",
      },
    ],
    new Date("2026-05-20T00:00:00.000Z"),
  );

  assert.doesNotMatch(markdown, /Bearer secret/);
  assert.doesNotMatch(markdown, /\bwinner\b/i);
});

test("no best/top/winner/loser/superiority language", () => {
  const markdown = renderProofMarkdown([], new Date("2026-05-20T00:00:00.000Z"));
  assert.doesNotMatch(markdown, /\bbest\b/i);
  assert.doesNotMatch(markdown, /\btop\b/i);
  assert.doesNotMatch(markdown, /\bwinner\b/i);
  assert.doesNotMatch(markdown, /\bloser\b/i);
  assert.doesNotMatch(markdown, /\bsuperiority\b/i);
});

test("Tripadvisor is excluded from paid proof", () => {
  const routes = Object.values(getRouteConfigs());
  assert.equal(routes.some((route) => route.providerId === "paysponge/tripadvisor"), false);

  const markdown = renderProofMarkdown([], new Date("2026-05-20T00:00:00.000Z"));
  assert.match(markdown, /Excluded from paid proof: paysponge\/tripadvisor\./);
});

test("safety gate reason coverage", () => {
  assert.equal(
    validateSafetyGate({}, {
      researchConfirmed: true,
      readinessConfirmed: true,
      normalizerConfirmed: true,
      schemaEvidenceConfirmed: true,
    }).reason,
    "LIVE_PAYSH_EXECUTION_not_true",
  );

  assert.equal(
    validateSafetyGate({ LIVE_PAYSH_EXECUTION: "true" }, {
      researchConfirmed: true,
      readinessConfirmed: true,
      normalizerConfirmed: true,
      schemaEvidenceConfirmed: true,
    }).reason,
    "PAYSH_EXECUTION_MODE_not_pay_cli",
  );

  assert.equal(
    validateSafetyGate({ LIVE_PAYSH_EXECUTION: "true", PAYSH_EXECUTION_MODE: "pay_cli" }, {
      researchConfirmed: true,
      readinessConfirmed: true,
      normalizerConfirmed: true,
      schemaEvidenceConfirmed: false,
    }).reason,
    "comparable_route_schema_evidence_missing",
  );
});
