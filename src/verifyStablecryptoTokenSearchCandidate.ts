import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stablecryptoTokenSearchCandidate } from "./mappings/stablecryptoTokenSearchCandidate";

const VERIFIED_PROOF_REFERENCE = "live-proofs/stablecrypto-token-search-verified-unproven-2026-05-17.md";
const CANDIDATE_PROOF_REFERENCE = "live-proofs/stablecrypto-token-search-candidate-unverified-2026-05-17.md";
const VERIFIED_AT = "2026-05-17";

type ProbeMethod = "GET" | "POST";
type ProbeClassification = "verified_semantics" | "candidate_unverified" | "rejected";
type MappingStatus = "verified" | "candidate";
type EvidenceStatus = "unproven";

export type StablecryptoProbe = {
  method: ProbeMethod;
  endpoint: string;
  request_shape: string;
  query_term: string;
  status_code: number | null;
  content_type: string | null;
  payment_required_challenge_appears: boolean;
  safe_response_summary: string;
  classification: ProbeClassification;
  reason: string;
};

export type StablecryptoVerificationResult = {
  provider_id: string;
  benchmark_intent: "token search";
  candidate_endpoint: string;
  methods_tested: ProbeMethod[];
  query_terms_tested: string[];
  paid_execution_attempted: false;
  final_mapping_status: MappingStatus;
  final_execution_evidence_status: EvidenceStatus;
  response_shape_classification: "verified_semantics" | "candidate_unverified";
  proof_reference: string;
  probes: StablecryptoProbe[];
  notes: string;
};

type ProbeInput = {
  method: ProbeMethod;
  endpoint: string;
  queryTerm: string;
};

type ProbeHttpResponse = {
  status: number;
  contentType: string | null;
  bodyText: string;
};

type ProbeFn = (input: ProbeInput) => Promise<ProbeHttpResponse>;

export function sanitizeProofMarkdown(markdown: string): string {
  return markdown
    .replace(/(authorization|bearer|api[_-]?key|apikey|x-api-key|wallet|seed|mnemonic|signature|private[_-]?key)\s*[:=]\s*[^\n]+/gi, "$1: [REDACTED]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]");
}

function extractContentType(headers: Headers): string | null {
  const raw = headers.get("content-type");
  return raw ? raw.split(";")[0].trim().toLowerCase() : null;
}

function summarizeBody(bodyText: string): string {
  const trimmed = bodyText.replace(/\s+/g, " ").trim();
  if (!trimmed) return "empty body";
  return trimmed.slice(0, 180);
}

function hasPaymentChallenge(statusCode: number | null, body: string, contentType: string | null): boolean {
  if (statusCode === 402) return true;
  const combined = `${contentType ?? ""} ${body}`.toLowerCase();
  return /payment required|x402|402 payment|required payment|insufficient payment/.test(combined);
}

function looksTokenSearchLike(body: string): boolean {
  const lower = body.toLowerCase();
  return /token|symbol|name|address|coingecko|coins|pairs|search/.test(lower);
}

function classifyProbe(statusCode: number | null, paymentChallenge: boolean, body: string): { classification: ProbeClassification; reason: string } {
  if (statusCode === 404) {
    return {
      classification: "candidate_unverified",
      reason: "Endpoint path returned 404 for this probe.",
    };
  }

  if (statusCode !== null && statusCode >= 200 && statusCode < 300 && looksTokenSearchLike(body)) {
    return {
      classification: "verified_semantics",
      reason: "Valid route behavior observed with token-search-like response shape.",
    };
  }

  if (paymentChallenge) {
    return {
      classification: "verified_semantics",
      reason: "Unpaid payment-required challenge observed for this method/request shape.",
    };
  }

  if (statusCode !== null && statusCode >= 500) {
    return {
      classification: "candidate_unverified",
      reason: "Server error observed; semantics not confirmed.",
    };
  }

  return {
    classification: "rejected",
    reason: "Route behavior did not confirm token-search semantics for this probe.",
  };
}

export async function defaultProbeHttp(input: ProbeInput): Promise<ProbeHttpResponse> {
  const url =
    input.method === "GET"
      ? `${input.endpoint}?query=${encodeURIComponent(input.queryTerm)}`
      : input.endpoint;

  const response = await fetch(url, {
    method: input.method,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
    },
    body: input.method === "POST" ? JSON.stringify({ query: input.queryTerm }) : undefined,
  });

  const bodyText = await response.text();
  return {
    status: response.status,
    contentType: extractContentType(response.headers),
    bodyText,
  };
}

export async function runStablecryptoProbes(
  endpoint: string,
  probeFn: ProbeFn = defaultProbeHttp,
): Promise<StablecryptoProbe[]> {
  const queryTerms = ["SOL", "ETH", "BTC"];
  const methods: ProbeMethod[] = ["GET", "POST"];
  const probes: StablecryptoProbe[] = [];

  for (const method of methods) {
    for (const term of queryTerms) {
      const requestShape = method === "GET" ? "querystring:?query=<TERM>" : "json:{\"query\":\"<TERM>\"}";
      try {
        const result = await probeFn({ method, endpoint, queryTerm: term });
        const paymentChallenge = hasPaymentChallenge(result.status, result.bodyText, result.contentType);
        const classified = classifyProbe(result.status, paymentChallenge, result.bodyText);

        probes.push({
          method,
          endpoint,
          request_shape: requestShape,
          query_term: term,
          status_code: result.status,
          content_type: result.contentType,
          payment_required_challenge_appears: paymentChallenge,
          safe_response_summary: summarizeBody(result.bodyText),
          classification: classified.classification,
          reason: classified.reason,
        });
      } catch (error) {
        probes.push({
          method,
          endpoint,
          request_shape: requestShape,
          query_term: term,
          status_code: null,
          content_type: null,
          payment_required_challenge_appears: false,
          safe_response_summary: sanitizeProofMarkdown(`probe_error: ${error instanceof Error ? error.message : String(error)}`).slice(0, 180),
          classification: "candidate_unverified",
          reason: "Probe failed before semantic confirmation.",
        });
      }
    }
  }

  return probes;
}

export function evaluateStablecryptoVerification(
  probes: StablecryptoProbe[],
  endpoint: string,
): StablecryptoVerificationResult {
  const pathExists = probes.some((p) => p.status_code !== 404 && p.status_code !== null);
  const hasAcceptedMethodShape = probes.some((p) => p.classification === "verified_semantics");
  const queryShapeUsed = probes.some((p) => p.request_shape.includes("query"));
  const tokenSearchPlausible = probes.some(
    (p) => p.classification === "verified_semantics" || /token-search/i.test(p.reason),
  );

  const verified = pathExists && hasAcceptedMethodShape && queryShapeUsed && tokenSearchPlausible;

  const finalMappingStatus: MappingStatus = verified ? "verified" : "candidate";
  const finalProofReference = verified ? VERIFIED_PROOF_REFERENCE : CANDIDATE_PROOF_REFERENCE;

  const notes = verified
    ? "Endpoint path, method, request shape, token-search intent, and unpaid route challenge/behavior verified. Paid execution not attempted. Not benchmark-ready."
    : "Metadata suggests token-search candidate, but endpoint/method/request shape could not be verified. Not benchmark-ready.";

  return {
    provider_id: stablecryptoTokenSearchCandidate.provider_id,
    benchmark_intent: "token search",
    candidate_endpoint: endpoint,
    methods_tested: ["GET", "POST"],
    query_terms_tested: ["SOL", "ETH", "BTC"],
    paid_execution_attempted: false,
    final_mapping_status: finalMappingStatus,
    final_execution_evidence_status: "unproven",
    response_shape_classification: verified ? "verified_semantics" : "candidate_unverified",
    proof_reference: finalProofReference,
    probes,
    notes,
  };
}

export function renderProofMarkdown(result: StablecryptoVerificationResult, now = new Date()): string {
  const lines: string[] = [
    "# StableCrypto Token Search Route Verification (Unpaid)",
    "",
    `- generated_at: ${now.toISOString()}`,
    `- provider_id: ${result.provider_id}`,
    `- benchmark_intent: ${result.benchmark_intent}`,
    `- candidate endpoint: ${result.candidate_endpoint}`,
    `- methods tested: ${result.methods_tested.join(", ")}`,
    `- query terms tested: ${result.query_terms_tested.join(", ")}`,
    `- paid_execution_attempted: ${result.paid_execution_attempted}`,
    `- final mapping_status: ${result.final_mapping_status}`,
    `- final execution_evidence_status: ${result.final_execution_evidence_status}`,
    `- response shape classification: ${result.response_shape_classification}`,
    `- proof_source: infopunks-pay-sh-agent-harness`,
    `- proof_reference: ${result.proof_reference}`,
    `- verified_at: ${VERIFIED_AT}`,
    `- notes: ${result.notes}`,
    "",
    "## Probe Evidence",
    "",
    "| method | endpoint | request_shape | query_term | status_code | content_type | payment_required_challenge_appears | classification | reason | safe_response_summary |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const probe of result.probes) {
    lines.push(
      `| ${probe.method} | ${probe.endpoint} | ${probe.request_shape} | ${probe.query_term} | ${probe.status_code ?? "null"} | ${probe.content_type ?? "null"} | ${probe.payment_required_challenge_appears} | ${probe.classification} | ${probe.reason} | ${probe.safe_response_summary.replace(/\|/g, "\\|")} |`,
    );
  }

  lines.push("", "No benchmark-ready claim.", "No winner claim.");
  return sanitizeProofMarkdown(lines.join("\n"));
}

export async function verifyStablecryptoTokenSearchCandidate(now = new Date()): Promise<StablecryptoVerificationResult> {
  const endpoint = stablecryptoTokenSearchCandidate.endpoint_url;
  const probes = await runStablecryptoProbes(endpoint);
  const result = evaluateStablecryptoVerification(probes, endpoint);

  const proofPath = path.resolve(process.cwd(), result.proof_reference);
  await mkdir(path.dirname(proofPath), { recursive: true });
  await writeFile(proofPath, `${renderProofMarkdown(result, now)}\n`, "utf8");

  return result;
}

if (require.main === module) {
  verifyStablecryptoTokenSearchCandidate()
    .then((result) => {
      console.log(`StableCrypto token-search verification complete: ${result.proof_reference}`);
      console.log(`mapping_status=${result.final_mapping_status} execution_evidence_status=${result.final_execution_evidence_status}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
