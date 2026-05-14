import test from "node:test";
import assert from "node:assert/strict";
import { routeProvider } from "./router";
import { ProviderCatalogEntry, RadarSignal } from "./types";

const providers: ProviderCatalogEntry[] = [
  {
    id: "pay-a",
    name: "Pay A",
    region: "us-east",
    catalogPriority: 1,
    category: "finance",
  },
  {
    id: "pay-b",
    name: "Pay B",
    region: "us-east",
    catalogPriority: 2,
    category: "payment",
  },
  {
    id: "ocr-x",
    name: "OCR X",
    region: "us-west",
    catalogPriority: 3,
    category: "ocr",
  },
];

const radarSignals: RadarSignal[] = [
  {
    providerId: "pay-a",
    trustScore: 92,
    degradationActive: false,
    signalScore: 80,
    latencyMs: 120,
  },
  {
    providerId: "pay-b",
    trustScore: 90,
    degradationActive: false,
    signalScore: 84,
    latencyMs: 140,
  },
  {
    providerId: "ocr-x",
    trustScore: 99,
    degradationActive: false,
    signalScore: 99,
    latencyMs: 40,
  },
];

test("payments request must not select OCR provider", () => {
  const routed = routeProvider({
    providers,
    radarSignals,
    minTrustScore: 70,
    requestedCategory: "payments",
    intent: "select provider for a payout request",
  });

  assert.notEqual(routed.selectedProvider?.id, "ocr-x");
  assert.ok(["pay-a", "pay-b"].includes(routed.selectedProvider?.id ?? ""));
  const ocrRejection = routed.rejectedProviders.find((provider) => provider.providerId === "ocr-x");
  assert.ok(ocrRejection);
  assert.ok(ocrRejection.reasons.some((reason) => reason === "category_mismatch:ocr!=payments"));
});

test("category filter returns only matching or aliased providers", () => {
  const routed = routeProvider({
    providers,
    radarSignals,
    minTrustScore: 70,
    requestedCategory: "payments",
  });

  const eligibleIds = new Set(
    routed.candidateProviders
      .map((provider) => provider.id)
      .filter((providerId) => !routed.rejectedProviders.some((rejection) => rejection.providerId === providerId)),
  );

  assert.deepEqual([...eligibleIds].sort(), ["pay-b"]);
  assert.equal(routed.categoryMatch, true);
});

test("payments category alias accepts finance providers", () => {
  const routed = routeProvider({
    providers,
    radarSignals,
    minTrustScore: 70,
    requestedCategory: "payments",
  });

  const financeProviderRejection = routed.rejectedProviders.find(
    (provider) => provider.providerId === "pay-a",
  );

  assert.ok(financeProviderRejection);
  assert.ok(
    financeProviderRejection.reasons.every((reason) => !reason.startsWith("category_mismatch:")),
  );
});

test("no category match returns blocked route or explicit fallback marker", () => {
  const routed = routeProvider({
    providers,
    radarSignals,
    minTrustScore: 70,
    requestedCategory: "speech",
  });

  assert.equal(routed.categoryMatch, false);
  assert.equal(routed.selectedProvider, null);
  assert.equal(routed.decision, "route_blocked");
  assert.equal(routed.fallbackCategoryUsed, false);
  assert.ok(
    routed.rejectedProviders.every((provider) =>
      provider.reasons.some((reason) => reason.startsWith("category_mismatch:")),
    ),
  );
});
