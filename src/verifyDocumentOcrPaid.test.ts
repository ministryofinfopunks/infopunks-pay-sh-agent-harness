import assert from "node:assert/strict";
import test from "node:test";

import type { LivePayShExecutionResult } from "./types";
import {
  deriveRouteState,
  fixtureUrlReturns200,
  getRouteConfigs,
  hashCanonicalInput,
  renderProofMarkdown,
  runPaidRoute,
  validateSafetyGate,
} from "./verifyDocumentOcrPaid";

function fakeLiveResult(overrides: Partial<LivePayShExecutionResult> = {}): LivePayShExecutionResult {
  return {
    providerId: "paysponge/reducto",
    intent: "document-ocr-text-extraction",
    endpointUrl: "https://api.paysponge.com/x402/purchase/svc_d672d90ggvqqygj60/parse",
    startedAt: new Date("2026-05-19T00:00:00.000Z").toISOString(),
    completedAt: new Date("2026-05-19T00:00:01.000Z").toISOString(),
    latencyMs: 1000,
    success: true,
    statusCode: 200,
    exitCode: 0,
    costUsd: null,
    settlementReference: null,
    responsePreview: "{}",
    parsedJsonAvailable: true,
    parsedJson: {
      text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
      page_count: 1,
      confidence: 0.97,
      document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
    },
    mode: "live_pay_sh_cli",
    ...overrides,
  };
}

test("fixture URL gate", async () => {
  const ok = await fixtureUrlReturns200(async () => ({ status: 200 }));
  assert.equal(ok, true);

  const fail = await fixtureUrlReturns200(async () => ({ status: 404 }));
  assert.equal(fail, false);
});

test("route-specific body generation for Reducto", () => {
  const body = getRouteConfigs().reducto.buildBody({
    document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
    fallback_document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.svg",
    expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "OCR BENCHMARK 001"],
  });

  assert.deepEqual(body, {
    input: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
    settings: {
      return_ocr_data: true,
      extraction_mode: "hybrid",
      ocr_system: "standard",
    },
  });
});

test("route-specific body generation for Google Vision DOCUMENT_TEXT_DETECTION", () => {
  const body = getRouteConfigs().vision.buildBody({
    document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
    fallback_document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.svg",
    expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "OCR BENCHMARK 001"],
  });

  assert.deepEqual(body, {
    requests: [
      {
        image: {
          source: {
            imageUri: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
          },
        },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  });
});

test("canonical input hash", () => {
  const hash = hashCanonicalInput({
    document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
    fallback_document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.svg",
    expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "OCR BENCHMARK 001"],
  });

  assert.equal(hash, "aee83aa83c58a59c79932b5b30418085e3988c2f9f1c635663f6e353fc80e927");
});

test("successful Reducto paid fixture normalization", async () => {
  const proof = await runPaidRoute(getRouteConfigs().reducto, "h", async () => fakeLiveResult());
  assert.equal(proof.provider, "PaySponge Reducto");
  assert.equal(proof.paid_execution_status, "succeeded");
  assert.equal(proof.expected_fragment_match_rate, 1);
  assert.equal(proof.ocr_success, true);
  assert.equal(proof.route_state, "verified/proven");
});

test("successful Vision paid fixture normalization", async () => {
  const proof = await runPaidRoute(
    getRouteConfigs().vision,
    "h",
    async () =>
      fakeLiveResult({
        providerId: "solana-foundation/google/vision",
        endpointUrl: "https://vision.google.gateway-402.com/v1/images:annotate",
        parsedJson: {
          fullTextAnnotation: {
            text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
            pages: [{ confidence: 0.95 }],
          },
          image_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
        },
      }),
  );

  assert.equal(proof.provider, "Google Vision");
  assert.equal(proof.paid_execution_status, "succeeded");
  assert.equal(proof.ocr_success, true);
  assert.equal(proof.route_state, "verified/proven");
});

test("partial OCR remains caveated", async () => {
  const proof = await runPaidRoute(
    getRouteConfigs().reducto,
    "h",
    async () =>
      fakeLiveResult({
        parsedJson: {
          text: "INFOPUNKS RADAR OCR BENCHMARK 001",
          page_count: 1,
          confidence: 0.9,
          document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
        },
      }),
  );

  assert.equal(proof.ocr_success, true);
  assert.equal(proof.expected_fragment_match_rate, 0.6667);
  assert.equal(proof.evidence_health, "caveated");
});

test("failed route remains candidate/unproven", async () => {
  const proof = await runPaidRoute(
    getRouteConfigs().vision,
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

test("route_state/evidence_health distinction", () => {
  const state = deriveRouteState({
    paidCallSuccess: true,
    normalized: {
      normalized: {
        text: "INFOPUNKS RADAR OCR BENCHMARK 001",
        text_fragments_detected: ["INFOPUNKS RADAR", "OCR BENCHMARK 001"],
        expected_fragment_match_rate: 0.6667,
        ocr_success: true,
        character_count: 31,
        page_count: 1,
        confidence: 0.8,
        status_evidence: "pay_cli_exit_0_status_unavailable",
        raw_status_code: null,
        caveat_objects: [],
        evidence_health: "caveated",
      },
      caveat_objects: [
        {
          code: "ocr_text_partial",
          severity: "warning",
          affects_core_semantics: true,
          detail: "partial",
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
        benchmark_id: "document-ocr-text-extraction",
        provider: "PaySponge Reducto",
        endpoint: "https://api.paysponge.com/x402/purchase/svc_d672d90ggvqqygj60/parse",
        method: "POST",
        canonical_input_hash: "abc",
        document_url: "https://radar.infopunks.fun/fixtures/ocr-benchmark-001.png",
        expected_text_fragments: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "OCR BENCHMARK 001"],
        route_specific_body: { input: "https://x" },
        paid_execution_status: "succeeded",
        cli_exit_code: 0,
        status_evidence: "authorization: Bearer secret",
        normalized_output: {
          text: "INFOPUNKS RADAR EVIDENCE BEFORE SPEND OCR BENCHMARK 001",
          text_fragments_detected: ["INFOPUNKS RADAR", "EVIDENCE BEFORE SPEND", "OCR BENCHMARK 001"],
          expected_fragment_match_rate: 1,
          ocr_success: true,
          character_count: 54,
          page_count: 1,
          confidence: 0.98,
          status_evidence: "authorization: Bearer secret",
          raw_status_code: 200,
          caveat_objects: [],
          evidence_health: "recorded",
        },
        expected_fragment_match_rate: 1,
        ocr_success: true,
        sample_extracted_text_preview: "INFOPUNKS RADAR",
        caveat_objects: [],
        evidence_health: "recorded",
        route_state: "verified/proven",
      },
    ],
    new Date("2026-05-19T00:00:00.000Z"),
  );

  assert.doesNotMatch(markdown, /Bearer secret/);
  assert.match(markdown, /winner_claimed: false/);
});

test("no best/top/superiority language", () => {
  const markdown = renderProofMarkdown([], new Date("2026-05-19T00:00:00.000Z"));
  assert.doesNotMatch(markdown, /\bbest\b/i);
  assert.doesNotMatch(markdown, /\btop\b/i);
  assert.doesNotMatch(markdown, /\bsuperior\b/i);
});

test("safety gate reason coverage", () => {
  assert.equal(validateSafetyGate({}, true, true).reason, "LIVE_PAYSH_EXECUTION_not_true");
  assert.equal(
    validateSafetyGate({ LIVE_PAYSH_EXECUTION: "true" }, true, true).reason,
    "PAYSH_EXECUTION_MODE_not_pay_cli",
  );
  assert.equal(
    validateSafetyGate({ LIVE_PAYSH_EXECUTION: "true", PAYSH_EXECUTION_MODE: "pay_cli" }, true, false).reason,
    "fixture_url_not_200",
  );
});
