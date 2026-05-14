import test from "node:test";
import assert from "node:assert/strict";
import { LivePayShExecutionResult } from "./types";
import { recommendProviderStatus, evaluateApplicationResult } from "./demoVerifyProviderMapping";

function baseResult(overrides: Partial<LivePayShExecutionResult>): LivePayShExecutionResult {
  return {
    providerId: "test-provider",
    intent: "verify test",
    startedAt: new Date(0).toISOString(),
    completedAt: new Date(1).toISOString(),
    latencyMs: 1,
    success: true,
    exitCode: 0,
    costUsd: null,
    settlementReference: null,
    responsePreview: "{}",
    parsedJsonAvailable: true,
    mode: "live_pay_sh_cli",
    ...overrides,
  };
}

test("endpoint not registered should not verify", () => {
  const result = baseResult({
    responsePreview: JSON.stringify({
      error: "Endpoint not found",
      message: "This endpoint is not registered for this service. Only registered endpoints can be called.",
    }),
    parsedJson: {
      error: "Endpoint not found",
      message: "This endpoint is not registered for this service. Only registered endpoints can be called.",
    },
  });
  const app = evaluateApplicationResult(result, "research_answer");
  const status = recommendProviderStatus(result, "research_answer");
  assert.equal(app.applicationSuccess, false);
  assert.equal(status, "rejected");
});

test("Google Places FieldMask 400 should not verify", () => {
  const result = baseResult({
    responsePreview: JSON.stringify({
      error: {
        code: 400,
        message: "FieldMask is a required parameter.",
        status: "INVALID_ARGUMENT",
      },
    }),
    parsedJson: {
      error: {
        code: 400,
        message: "FieldMask is a required parameter.",
        status: "INVALID_ARGUMENT",
      },
    },
  });
  const app = evaluateApplicationResult(result, "places_search");
  const status = recommendProviderStatus(result, "places_search");
  assert.equal(app.applicationSuccess, false);
  assert.equal(status, "rejected");
});

test("Google Vision labelAnnotations should verify", () => {
  const result = baseResult({
    responsePreview: JSON.stringify({
      responses: [{ labelAnnotations: [{ description: "White", score: 0.9 }] }],
    }),
    parsedJson: {
      responses: [{ labelAnnotations: [{ description: "White", score: 0.9 }] }],
    },
  });
  const app = evaluateApplicationResult(result, "image_labels");
  const status = recommendProviderStatus(result, "image_labels");
  assert.equal(app.applicationSuccess, true);
  assert.equal(status, "verified_pay_cli_success");
});

test("research_answer should verify from top-level results array", () => {
  const result = baseResult({
    responsePreview: JSON.stringify({ id: "abc", results: [{ snippet: "..." }] }),
    parsedJson: { id: "abc", results: [{ snippet: "..." }] },
    success: true,
    parsedJsonAvailable: true,
  });
  const app = evaluateApplicationResult(result, "research_answer");
  const status = recommendProviderStatus(result, "research_answer");
  assert.equal(app.applicationSuccess, true);
  assert.equal(status, "verified_pay_cli_success");
});

test("truncated preview parse failure should still verify using full parsedJson", () => {
  const result = baseResult({
    responsePreview: "{\"id\":\"abc\",\"results\":[",
    parsedJson: { id: "abc", results: [{ snippet: "..." }] },
    parsedJsonAvailable: true,
    success: true,
  });
  const app = evaluateApplicationResult(result, "research_answer");
  const status = recommendProviderStatus(result, "research_answer");
  assert.equal(app.applicationSuccess, true);
  assert.equal(status, "verified_pay_cli_success");
});
