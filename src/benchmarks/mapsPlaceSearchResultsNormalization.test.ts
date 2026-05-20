import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveMapsPlaceSearchResultsEvidenceHealth,
  normalizeMapsPlaceSearchResults,
  type NormalizeMapsPlaceSearchResultsResult,
} from "./mapsPlaceSearchResultsNormalization";

const canonicalInput = {
  query: "coffee near Union Square San Francisco",
  location: "Union Square, San Francisco, CA",
  limit: 5,
};

test("Google Places-like response normalizes", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: {
      places: [
        {
          displayName: { text: "Blue Bottle Coffee" },
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
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.place_search_success, true);
  assert.equal(result.normalized.places.length, 1);
  assert.equal(result.normalized.places[0]?.name, "Blue Bottle Coffee");
  assert.equal(result.normalized.query_match, true);
  assert.equal(result.normalized.location_match, true);
});

test("StableEnrich Google Maps-like response normalizes", () => {
  const result = normalizeMapsPlaceSearchResults({
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
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.places[0]?.category, "Coffee Shop");
  assert.equal(result.normalized.places[0]?.review_count, 58);
  assert.equal(result.normalized.place_search_success, true);
});

test("nested data.results shape is extracted", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: {
      data: {
        results: [
          {
            place_name: "Sightglass Coffee",
            vicinity: "270 7th St, San Francisco, CA 94103",
            geometry: { location: { lat: 37.7764, lng: -122.4081 } },
            rating: 4.5,
            reviewCount: 140,
            type: "coffee_shop",
            url: "https://sightglasscoffee.com",
            formatted_phone_number: "+1 415-222-3333",
          },
        ],
      },
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.places.length, 1);
  assert.equal(result.normalized.places[0]?.name, "Sightglass Coffee");
});

test("businesses and local_results shapes are extracted", () => {
  const businesses = normalizeMapsPlaceSearchResults({
    parsedJson: {
      businesses: [
        {
          business_name: "The Coffee Movement",
          formatted_address: "1030 Washington St, San Francisco, CA",
          lat: 37.795,
          lng: -122.41,
          rating: 4.8,
          review_count: 400,
          category: "coffee",
          website: "https://coffee.example",
          phone: "+1 415-222-1111",
        },
      ],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  const localResults = normalizeMapsPlaceSearchResults({
    parsedJson: {
      local_results: [
        {
          name: "Home Coffee Roasters",
          address: "1222 Noriega St, San Francisco, CA",
          lat: 37.754,
          lng: -122.478,
          score: 4.4,
          user_ratings_total: 91,
          category: "coffee shop",
          website_url: "https://home.coffee",
          international_phone_number: "+1 415-444-1111",
        },
      ],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(businesses.normalized.place_search_success, true);
  assert.equal(localResults.normalized.place_search_success, true);
});

test("candidates/search_results/items shapes are extracted", () => {
  const cases = [
    { candidates: [{ name: "A", address: "San Francisco, CA" }] },
    { search_results: [{ name: "B", address: "San Francisco, CA" }] },
    { items: [{ name: "C", address: "San Francisco, CA" }] },
  ];

  for (const payload of cases) {
    const result = normalizeMapsPlaceSearchResults({
      parsedJson: payload,
      statusCode: 200,
      paidExecutionObserved: true,
      canonicalInput,
    });
    assert.equal(result.normalized.places.length, 1);
  }
});

test("missing optional fields emits caveats", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: {
      results: [
        {
          name: "Bare Place",
          address: "San Francisco, CA",
        },
      ],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  const codes = result.caveat_objects.map((c) => c.code);
  assert.ok(codes.includes("coordinates_missing"));
  assert.ok(codes.includes("rating_missing"));
  assert.ok(codes.includes("review_count_missing"));
  assert.ok(codes.includes("category_missing"));
  assert.ok(codes.includes("website_missing"));
  assert.ok(codes.includes("phone_missing"));
});

test("zero places adds no_places_returned", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: { results: [], total: 0 },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.place_search_success, false);
  assert.ok(result.caveat_objects.some((c) => c.code === "no_places_returned"));
});

test("402 payment-required only adds payment caveats", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: { error: "Payment Required" },
    statusCode: 402,
    paidExecutionObserved: false,
    canonicalInput,
  });

  const codes = result.caveat_objects.map((c) => c.code);
  assert.ok(codes.includes("payment_required_confirmed_only"));
  assert.ok(codes.includes("paid_payload_unobserved"));
});

test("405 method not allowed adds method_not_allowed", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: { error: "Method Not Allowed" },
    statusCode: 405,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "method_not_allowed"));
});

test("404 route not found adds route_not_found", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: { error: "Not Found" },
    statusCode: 404,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "route_not_found"));
});

test("non-JSON response adds non_json_text_response", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: "upstream timeout",
    responsePreview: "upstream timeout",
    statusCode: 502,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.ok(result.caveat_objects.some((c) => c.code === "non_json_text_response"));
});

test("pay_cli hidden status adds status_code_unavailable", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: {
      places: [
        {
          name: "Blue Bottle",
          address: "66 Mint St, San Francisco, CA",
          lat: 37.782,
          lng: -122.407,
          rating: 4.6,
          review_count: 181,
          category: "coffee",
          website: "https://bluebottlecoffee.com",
          phone: "+1 415-000-0000",
        },
      ],
    },
    statusCode: null,
    statusEvidence: "pay_cli exit code 0 and parsed response body",
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(result.normalized.raw_status_code, null);
  assert.equal(result.normalized.status_evidence, "pay_cli exit code 0 and parsed response body");
  assert.ok(result.caveat_objects.some((c) => c.code === "status_code_unavailable"));
});

test("query/location matching", () => {
  const match = normalizeMapsPlaceSearchResults({
    parsedJson: {
      results: [
        {
          name: "Union Square Coffee Bar",
          address: "333 Post St, San Francisco, CA 94108",
          lat: 37.788,
          lng: -122.408,
          rating: 4.5,
          review_count: 50,
          category: "coffee shop",
          website: "https://union.example",
          phone: "+1 415-333-2222",
        },
      ],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  const nonMatch = normalizeMapsPlaceSearchResults({
    parsedJson: {
      results: [
        {
          name: "Taco Spot",
          address: "Austin, TX",
          lat: 30.2672,
          lng: -97.7431,
          rating: 4.4,
          review_count: 42,
          category: "restaurant",
          website: "https://taco.example",
          phone: "+1 512-000-0000",
        },
      ],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(match.normalized.query_match, true);
  assert.equal(match.normalized.location_match, true);
  assert.equal(nonMatch.normalized.query_match, false);
  assert.equal(nonMatch.normalized.location_match, false);
  assert.ok(nonMatch.caveat_objects.some((c) => c.code === "query_unconfirmed"));
  assert.ok(nonMatch.caveat_objects.some((c) => c.code === "location_unconfirmed"));
});

function withLatest(result: NormalizeMapsPlaceSearchResultsResult): NormalizeMapsPlaceSearchResultsResult {
  return {
    normalized: result.normalized,
    caveat_objects: result.caveat_objects,
  };
}

test("evidence_health derivation", () => {
  const recordedLatest = normalizeMapsPlaceSearchResults({
    parsedJson: {
      places: [
        {
          name: "Blue Bottle Coffee",
          address: "66 Mint St, San Francisco, CA",
          lat: 37.782,
          lng: -122.407,
          rating: 4.6,
          review_count: 181,
          category: "coffee",
          website: "https://bluebottlecoffee.com",
          phone: "+1 415-000-0000",
        },
      ],
      result_count: 1,
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });
  recordedLatest.caveat_objects.length = 0;

  const caveatedLatest = normalizeMapsPlaceSearchResults({
    parsedJson: {
      places: [
        {
          name: "Blue Bottle Coffee",
          address: "66 Mint St, San Francisco, CA",
          lat: 37.782,
          lng: -122.407,
          rating: 4.6,
          review_count: 181,
          category: "coffee",
        },
      ],
    },
    statusCode: null,
    paidExecutionObserved: true,
    canonicalInput,
  });

  const degradedLatest = normalizeMapsPlaceSearchResults({
    parsedJson: { results: [] },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  assert.equal(deriveMapsPlaceSearchResultsEvidenceHealth({ paidAttempts: 0, paidSuccesses: 0 }), "unverified");
  assert.equal(
    deriveMapsPlaceSearchResultsEvidenceHealth({
      paidAttempts: 1,
      paidSuccesses: 1,
      successfulResultCounts: [1],
      latest: withLatest(recordedLatest),
    }),
    "recorded",
  );
  assert.equal(
    deriveMapsPlaceSearchResultsEvidenceHealth({
      paidAttempts: 1,
      paidSuccesses: 1,
      successfulResultCounts: [1],
      latest: withLatest(caveatedLatest),
    }),
    "caveated",
  );
  assert.equal(
    deriveMapsPlaceSearchResultsEvidenceHealth({
      paidAttempts: 1,
      paidSuccesses: 1,
      successfulResultCounts: [0],
      latest: withLatest(degradedLatest),
    }),
    "degraded",
  );
  assert.equal(deriveMapsPlaceSearchResultsEvidenceHealth({ researchOnly: true }), "scaffold");
});

test("no best/top/winner/loser/superiority language", () => {
  const result = normalizeMapsPlaceSearchResults({
    parsedJson: {
      results: [
        {
          name: "Cafe Example",
          address: "San Francisco, CA",
        },
      ],
    },
    statusCode: 200,
    paidExecutionObserved: true,
    canonicalInput,
  });

  const blob = JSON.stringify(result);
  assert.equal(/\b(best|top|winner|loser|superiority)\b/i.test(blob), false);
});
