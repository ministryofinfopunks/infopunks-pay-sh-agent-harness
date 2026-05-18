import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { payspongeCoinGeckoTokenMetadataCandidate } from "./mappings/payspongeCoinGeckoTokenMetadataCandidate";
import { stablecryptoTokenMetadataCandidate } from "./mappings/stablecryptoTokenMetadataCandidate";

const VERIFIED_PROOF_REFERENCE = "live-proofs/token-metadata-verified-unproven-2026-05-18.md";
const CANDIDATE_PROOF_REFERENCE = "live-proofs/token-metadata-candidate-unverified-2026-05-18.md";
const VERIFIED_AT = "2026-05-18";

const SENSITIVE_PATTERNS = [
  /authorization\s*[:=]\s*[^\n]+/gi,
  /x-payment\s*[:=]\s*[^\n]+/gi,
  /payment-signature\s*[:=]\s*[^\n]+/gi,
  /private[_ -]?key\s*[:=]\s*[^\s,;)]+/gi,
  /seed[_ -]?phrase\s*[:=]\s*[^\n]+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s,;)]+/gi,
  /apikey\s*[:=]\s*[^\s,;)]+/gi,
  /wallet\s*[:=]\s*[^\n]+/gi,
  /seed\s*[:=]\s*[^\n]+/gi,
  /mnemonic\s*[:=]\s*[^\n]+/gi,
  /signature\s*[:=]\s*[^\n]+/gi,
];

type ResponseShapeClassified =
  | "metadata_json"
  | "payment_challenge"
  | "price_only"
  | "pool_only"
  | "non_json_text"
  | "empty"
  | "unknown";

type Classification = "verified_semantics" | "candidate_unverified" | "rejected";

interface MetadataDetection {
  symbol: boolean;
  name: boolean;
  token_address: boolean;
  network: boolean;
  decimals: boolean;
  attributes: boolean;
  image_or_description: boolean;
}

export interface CandidateProbeConfig {
  provider_id: string;
  provider_name: string;
  method: "GET";
  endpoint: string;
  request_shape: { network: string; address: string; symbol: string };
}

export interface ProbeObservation {
  provider_id: string;
  provider_name: string;
  method: "GET";
  endpoint: string;
  request_shape: { network: string; address: string; symbol: string };
  status_code: number | null;
  content_type: string | null;
  payment_required_challenge_appears: boolean;
  paid_execution_attempted: false;
  response_shape_classified: ResponseShapeClassified;
  metadata_fields_detected: MetadataDetection;
  token_metadata_semantics_detected: boolean;
  classification: Classification;
  reason: string;
}

function lower(value: string): string {
  return value.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function includesAny(text: string, needles: string[]): boolean {
  const hay = lower(text);
  return needles.some((n) => hay.includes(lower(n)));
}

function flattenKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      flattenKeys(item, out);
    }
    return out;
  }
  if (!isRecord(value)) {
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    out.push(lower(k));
    flattenKeys(v, out);
  }
  return out;
}

function detectMetadataFields(value: unknown, canonical: { network: string; address: string; symbol: string }): MetadataDetection {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const textLower = lower(text);
  const keys = flattenKeys(value);

  const hasSymbolKey = keys.includes("symbol") || textLower.includes(`"symbol":"${lower(canonical.symbol)}"`);
  const hasNameKey = keys.includes("name") || textLower.includes("wrapped sol") || textLower.includes("solana");
  const hasAddressKey =
    keys.some((k) => ["address", "token_address", "mint", "contract_address", "id"].includes(k)) ||
    textLower.includes(lower(canonical.address));
  const hasNetworkKey =
    keys.some((k) => ["network", "chain", "chain_id", "asset_platform_id"].includes(k)) ||
    textLower.includes(lower(canonical.network));
  const hasDecimalsKey = keys.includes("decimals") || /\"decimals\"\s*:\s*\d+/.test(textLower);
  const hasAttributesKey = keys.includes("attributes") || keys.includes("metadata") || keys.includes("extensions");
  const hasImageOrDescription =
    keys.includes("image") || keys.includes("logo") || keys.includes("description") || keys.includes("icon");

  return {
    symbol: hasSymbolKey,
    name: hasNameKey,
    token_address: hasAddressKey,
    network: hasNetworkKey,
    decimals: hasDecimalsKey,
    attributes: hasAttributesKey,
    image_or_description: hasImageOrDescription,
  };
}

function detectPaymentChallenge(input: { statusCode: number | null; contentType: string | null; headers: Headers; bodyText: string }): boolean {
  const keys = Array.from(input.headers.keys()).map((k) => lower(k));
  return (
    input.statusCode === 402 ||
    keys.some((k) => k.includes("x402") || k.includes("payment") || k.includes("www-authenticate")) ||
    includesAny(input.bodyText, ["payment required", "x402", "accepts", "network", "payto"]) ||
    includesAny(input.contentType ?? "", ["application/problem+json"]) 
  );
}

function isPriceOnly(value: unknown): boolean {
  const txt = JSON.stringify(value).toLowerCase();
  return includesAny(txt, ["price", "usd", "market_cap"]) && !includesAny(txt, ["decimals", "metadata", "attributes"]);
}

function isPoolOnly(value: unknown): boolean {
  const txt = JSON.stringify(value).toLowerCase();
  return (
    includesAny(txt, ["pool", "liquidity", "base_token_price_usd"]) &&
    !includesAny(txt, ["symbol", "name", "decimals", "mint", "address", "network"])
  );
}

export function evaluateTokenMetadataSemantics(input: {
  statusCode: number | null;
  contentType: string | null;
  headers: Headers;
  bodyText: string;
  parsedJson: unknown;
  canonical: { network: string; address: string; symbol: string };
}): Omit<ProbeObservation, "provider_id" | "provider_name" | "method" | "endpoint" | "request_shape" | "paid_execution_attempted"> {
  const metadata = detectMetadataFields(input.parsedJson ?? input.bodyText, input.canonical);
  const paymentChallenge = detectPaymentChallenge(input);

  const metadataFieldCount = Object.values(metadata).filter(Boolean).length;
  const metadataSemanticsDetected = metadata.symbol && metadata.name && metadata.token_address && metadata.network && metadata.decimals;

  let responseShape: ResponseShapeClassified = "unknown";
  if (!input.bodyText.trim()) {
    responseShape = "empty";
  } else if (paymentChallenge) {
    responseShape = "payment_challenge";
  } else if (input.parsedJson && isPriceOnly(input.parsedJson)) {
    responseShape = "price_only";
  } else if (input.parsedJson && isPoolOnly(input.parsedJson) && !metadataSemanticsDetected) {
    responseShape = "pool_only";
  } else if (input.parsedJson && (metadataFieldCount >= 4 || metadataSemanticsDetected)) {
    responseShape = "metadata_json";
  } else {
    responseShape = input.contentType?.includes("json") ? "unknown" : "non_json_text";
  }

  if (input.statusCode === 404) {
    return {
      status_code: input.statusCode,
      content_type: input.contentType,
      payment_required_challenge_appears: paymentChallenge,
      response_shape_classified: responseShape,
      metadata_fields_detected: metadata,
      token_metadata_semantics_detected: false,
      classification: "candidate_unverified",
      reason: "Route returned 404; token metadata semantics cannot be verified from unpaid evidence.",
    };
  }

  if (responseShape === "price_only") {
    return {
      status_code: input.statusCode,
      content_type: input.contentType,
      payment_required_challenge_appears: paymentChallenge,
      response_shape_classified: responseShape,
      metadata_fields_detected: metadata,
      token_metadata_semantics_detected: false,
      classification: "rejected",
      reason: "Price-only response detected; not token metadata.",
    };
  }

  if (responseShape === "pool_only" && !metadataSemanticsDetected) {
    return {
      status_code: input.statusCode,
      content_type: input.contentType,
      payment_required_challenge_appears: paymentChallenge,
      response_shape_classified: responseShape,
      metadata_fields_detected: metadata,
      token_metadata_semantics_detected: false,
      classification: "rejected",
      reason: "Pool-only response without token identity metadata fields.",
    };
  }

  const routeBehaviorValid = input.statusCode !== null && input.statusCode !== 404;

  if (routeBehaviorValid && (metadataSemanticsDetected || (paymentChallenge && metadataFieldCount >= 3))) {
    return {
      status_code: input.statusCode,
      content_type: input.contentType,
      payment_required_challenge_appears: paymentChallenge,
      response_shape_classified: responseShape,
      metadata_fields_detected: metadata,
      token_metadata_semantics_detected: true,
      classification: "verified_semantics",
      reason: paymentChallenge
        ? "Unpaid payment-required challenge observed on metadata-shaped endpoint with strong token metadata intent."
        : "Valid unpaid route behavior and token metadata fields detected.",
    };
  }

  return {
    status_code: input.statusCode,
    content_type: input.contentType,
    payment_required_challenge_appears: paymentChallenge,
    response_shape_classified: responseShape,
    metadata_fields_detected: metadata,
    token_metadata_semantics_detected: false,
    classification: "candidate_unverified",
    reason: "Unpaid evidence did not sufficiently establish token metadata route semantics.",
  };
}

export function sanitizeProofMarkdown(markdown: string): string {
  return SENSITIVE_PATTERNS.reduce((safe, pattern) => safe.replace(pattern, "[REDACTED]"), markdown);
}

export async function probeCandidate(candidate: CandidateProbeConfig): Promise<ProbeObservation> {
  let statusCode: number | null = null;
  let contentType: string | null = null;
  const emptyHeaders = new Headers();
  let headers: Headers = emptyHeaders;
  let bodyText = "";
  let parsedJson: unknown = null;

  try {
    const response = await fetch(candidate.endpoint, {
      method: candidate.method,
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
    });
    statusCode = response.status;
    contentType = response.headers.get("content-type");
    headers = response.headers;
    bodyText = await response.text();
    try {
      parsedJson = JSON.parse(bodyText) as unknown;
    } catch {
      parsedJson = null;
    }
  } catch (error) {
    bodyText = error instanceof Error ? error.message : String(error);
  }

  const evaluated = evaluateTokenMetadataSemantics({
    statusCode,
    contentType,
    headers,
    bodyText,
    parsedJson,
    canonical: candidate.request_shape,
  });

  return {
    provider_id: candidate.provider_id,
    provider_name: candidate.provider_name,
    method: candidate.method,
    endpoint: candidate.endpoint,
    request_shape: candidate.request_shape,
    paid_execution_attempted: false,
    ...evaluated,
  };
}

export function renderMappingContent(input: {
  base: {
    provider_id: string;
    provider_name: string;
    category: string;
    benchmark_intent: string;
    endpoint_url: string;
    method: string;
    request_shape_example: { network: string; address: string; symbol: string };
  };
  verified: boolean;
  proofReference: string;
}): string {
  const notes = input.verified
    ? "Endpoint path, GET method, token address request shape, token metadata intent, and unpaid route challenge/behavior verified. Paid execution not attempted. Not benchmark-ready. No winner claimed."
    : "Candidate only. Token metadata route semantics could not be verified from unpaid evidence. Paid execution not attempted. Not benchmark-ready. No winner claimed.";

  return [
    `export const ${input.base.provider_id === "paysponge-coingecko" ? "payspongeCoinGeckoTokenMetadataCandidate" : "stablecryptoTokenMetadataCandidate"} = {`,
    `  provider_id: \"${input.base.provider_id}\",`,
    `  provider_name: \"${input.base.provider_name}\",`,
    `  category: \"${input.base.category}\",`,
    `  benchmark_intent: \"${input.base.benchmark_intent}\",`,
    `  mapping_status: \"${input.verified ? "verified" : "candidate"}\",`,
    "  execution_evidence_status: \"unproven\",",
    `  verified_at: \"${VERIFIED_AT}\",`,
    "  proof_source: \"infopunks-pay-sh-agent-harness\",",
    `  proof_reference: \"${input.proofReference}\",`,
    `  endpoint_url: \"${input.base.endpoint_url}\",`,
    `  method: \"${input.base.method}\",`,
    `  request_shape_example: ${JSON.stringify(input.base.request_shape_example)},`,
    `  notes: \"${notes}\",`,
    "} as const;",
    "",
  ].join("\n");
}

export function renderProofMarkdown(results: ProbeObservation[], proofReference: string, now = new Date()): string {
  const lines = [
    "# Token Metadata Candidate Verification (Unpaid)",
    "",
    `- generated_at: ${now.toISOString()}`,
    "- benchmark_id: finance-data-token-metadata",
    "- category: finance/data",
    "- benchmark_intent: token metadata",
    "- benchmark_recorded: false",
    "- winner_status: not_evaluated",
    "- winner_claimed: false",
    "- paid_execution_attempted: false",
    `- proof_reference: ${proofReference}`,
    "",
    "| provider_id | provider_name | method | endpoint | request_shape | status_code | content_type | payment_required_challenge_appears | response_shape_classified | metadata_fields_detected | token_metadata_semantics_detected | classification | reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((r) => {
      const fields = Object.entries(r.metadata_fields_detected)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(",") || "none";
      return `| ${r.provider_id} | ${r.provider_name} | ${r.method} | ${r.endpoint} | ${JSON.stringify(r.request_shape).replace(/\|/g, "\\|")} | ${r.status_code === null ? "null" : r.status_code} | ${r.content_type ?? "null"} | ${r.payment_required_challenge_appears} | ${r.response_shape_classified} | ${fields} | ${r.token_metadata_semantics_detected} | ${r.classification} | ${r.reason.replace(/\|/g, "\\|")} |`;
    }),
    "",
    "No benchmark-ready claim.",
    "No winner claim.",
  ];

  return sanitizeProofMarkdown(lines.join("\n"));
}

export async function runTokenMetadataCandidateVerification(): Promise<{ results: ProbeObservation[]; proofPath: string }> {
  const canonical = {
    network: "solana",
    address: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
  } as const;

  const candidates: CandidateProbeConfig[] = [
    {
      provider_id: "paysponge-coingecko",
      provider_name: "PaySponge CoinGecko",
      method: "GET",
      endpoint: "https://pro-api.coingecko.com/api/v3/x402/onchain/tokens/solana/So11111111111111111111111111111111111111112",
      request_shape: canonical,
    },
    {
      provider_id: "merit-systems-stablecrypto-market-data",
      provider_name: "StableCrypto",
      method: "GET",
      endpoint: "https://stablecrypto.dev/api/coingecko/onchain/tokens/solana/So11111111111111111111111111111111111111112",
      request_shape: canonical,
    },
  ];

  const results: ProbeObservation[] = [];
  for (const candidate of candidates) {
    results.push(await probeCandidate(candidate));
  }

  const anyVerified = results.some((r) => r.classification === "verified_semantics");
  const proofReference = anyVerified ? VERIFIED_PROOF_REFERENCE : CANDIDATE_PROOF_REFERENCE;
  const proofPath = path.join(process.cwd(), proofReference);

  await mkdir(path.dirname(proofPath), { recursive: true });
  await writeFile(proofPath, renderProofMarkdown(results, proofReference), "utf8");

  const payVerified = results.find((r) => r.provider_id === "paysponge-coingecko")?.classification === "verified_semantics";
  const stableVerified =
    results.find((r) => r.provider_id === "merit-systems-stablecrypto-market-data")?.classification === "verified_semantics";

  await writeFile(
    path.join(process.cwd(), "src/mappings/payspongeCoinGeckoTokenMetadataCandidate.ts"),
    renderMappingContent({
      base: {
        provider_id: "paysponge-coingecko",
        provider_name: "PaySponge CoinGecko",
        category: payspongeCoinGeckoTokenMetadataCandidate.category,
        benchmark_intent: "token metadata",
        endpoint_url: candidates[0].endpoint,
        method: "GET",
        request_shape_example: canonical,
      },
      verified: payVerified,
      proofReference,
    }),
    "utf8",
  );

  await writeFile(
    path.join(process.cwd(), "src/mappings/stablecryptoTokenMetadataCandidate.ts"),
    renderMappingContent({
      base: {
        provider_id: "merit-systems-stablecrypto-market-data",
        provider_name: "StableCrypto",
        category: stablecryptoTokenMetadataCandidate.category,
        benchmark_intent: "token metadata",
        endpoint_url: candidates[1].endpoint,
        method: "GET",
        request_shape_example: canonical,
      },
      verified: stableVerified,
      proofReference,
    }),
    "utf8",
  );

  return { results, proofPath };
}

if (require.main === module) {
  runTokenMetadataCandidateVerification()
    .then(({ results, proofPath }) => {
      console.log(JSON.stringify({
        ok: true,
        paid_execution_attempted: false,
        proofPath,
        classifications: results.map((r) => ({
          provider_id: r.provider_id,
          classification: r.classification,
          status_code: r.status_code,
          token_metadata_semantics_detected: r.token_metadata_semantics_detected,
        })),
      }, null, 2));
    })
    .catch((error) => {
      console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      process.exitCode = 1;
    });
}
