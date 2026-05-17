import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateStablecryptoVerification,
  renderProofMarkdown,
  sanitizeProofMarkdown,
  StablecryptoProbe,
} from "./verifyStablecryptoTokenSearchCandidate";
import { stablecryptoTokenSearchCandidate } from "./mappings/stablecryptoTokenSearchCandidate";

function makeProbe(overrides: Partial<StablecryptoProbe> = {}): StablecryptoProbe {
  return {
    method: "GET",
    endpoint: stablecryptoTokenSearchCandidate.endpoint_url,
    request_shape: "querystring:?query=<TERM>",
    query_term: "SOL",
    status_code: 402,
    content_type: "application/json",
    payment_required_challenge_appears: true,
    safe_response_summary: "payment required",
    classification: "verified_semantics",
    reason: "Unpaid payment-required challenge observed for this method/request shape.",
    ...overrides,
  };
}

test("promotes to verified/unproven only when route semantics are confirmed", () => {
  const result = evaluateStablecryptoVerification(
    [makeProbe(), makeProbe({ method: "POST", request_shape: 'json:{"query":"<TERM>"}', query_term: "ETH" })],
    stablecryptoTokenSearchCandidate.endpoint_url,
  );

  assert.equal(result.final_mapping_status, "verified");
  assert.equal(result.final_execution_evidence_status, "unproven");
  assert.equal(result.paid_execution_attempted, false);
  assert.equal(result.response_shape_classification, "verified_semantics");
});

test("all 404 probes keep candidate/unproven", () => {
  const probes: StablecryptoProbe[] = [
    makeProbe({ status_code: 404, payment_required_challenge_appears: false, classification: "candidate_unverified" }),
    makeProbe({ method: "POST", request_shape: 'json:{"query":"<TERM>"}', status_code: 404, payment_required_challenge_appears: false, classification: "candidate_unverified" }),
  ];

  const result = evaluateStablecryptoVerification(probes, stablecryptoTokenSearchCandidate.endpoint_url);

  assert.equal(result.final_mapping_status, "candidate");
  assert.equal(result.final_execution_evidence_status, "unproven");
  assert.equal(result.paid_execution_attempted, false);
  assert.equal(result.response_shape_classification, "candidate_unverified");
});

test("address lookup semantics are not accepted as clean token search", () => {
  const result = evaluateStablecryptoVerification(
    [
      makeProbe({
        status_code: 200,
        payment_required_challenge_appears: false,
        classification: "rejected",
        reason: "Route behavior did not confirm token-search semantics for this probe.",
        safe_response_summary: "address lookup only",
      }),
    ],
    stablecryptoTokenSearchCandidate.endpoint_url,
  );

  assert.equal(result.final_mapping_status, "candidate");
  assert.equal(result.final_execution_evidence_status, "unproven");
});

test("proof markdown contains required safety statements and no benchmark/winner claim", () => {
  const result = evaluateStablecryptoVerification([makeProbe()], stablecryptoTokenSearchCandidate.endpoint_url);
  const markdown = renderProofMarkdown(result, new Date("2026-05-17T00:00:00.000Z"));

  assert.match(markdown, /paid_execution_attempted: false/);
  assert.match(markdown, /No benchmark-ready claim\./);
  assert.match(markdown, /No winner claim\./);
  assert.doesNotMatch(markdown, /benchmark[-_ ]ready:\s*true/i);
  assert.doesNotMatch(markdown, /winner_claimed:\s*true/i);
});

test("sanitizer redacts auth and wallet-like data", () => {
  const markdown = sanitizeProofMarkdown(
    "authorization: Bearer abc\nwallet: 0x123\napi_key: key\nsignature: sig\nseed: phrase\nprivate_key: secret",
  );

  assert.doesNotMatch(markdown, /Bearer abc/);
  assert.doesNotMatch(markdown, /wallet:\s*0x123/);
  assert.doesNotMatch(markdown, /api_key:\s*key/);
  assert.doesNotMatch(markdown, /signature:\s*sig/);
  assert.doesNotMatch(markdown, /seed:\s*phrase/);
  assert.doesNotMatch(markdown, /private_key:\s*secret/);
  assert.match(markdown, /\[REDACTED\]/);
});
