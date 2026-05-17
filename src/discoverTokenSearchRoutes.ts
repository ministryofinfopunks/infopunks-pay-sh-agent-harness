import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { providerEndpointMap } from "./providerEndpointMap";
import { payspongeCoinGeckoTokenLookupCandidate } from "./mappings/payspongeCoinGeckoTokenLookupCandidate";
import { payspongeCoinGeckoTokenSearchCandidate } from "./mappings/payspongeCoinGeckoTokenSearch";

type Classification = "clean_candidate" | "search_adjacent" | "lookup_only" | "rejected";

type CandidateSource = "providerEndpointMap" | "known-mapping" | "heuristic-variant";

interface RouteCandidate {
  provider_id: string;
  provider_name: string;
  endpoint_url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  request_shape: Record<string, unknown>;
  source: CandidateSource;
}

interface ProbeResult {
  provider_id: string;
  provider_name: string;
  endpoint_url: string;
  method: string;
  request_shape: Record<string, unknown>;
  status_code: number | null;
  payment_required_challenge_appears: boolean;
  content_type: string | null;
  safe_response_summary: string;
  classification: Classification;
  reason: string;
}

const QUERY_PATTERNS = [
  "search",
  "query",
  "tokens/search",
  "coins/search",
  "pools/search",
  "onchain/search",
  "search/pools?query=SOL",
  "search/tokens?query=SOL",
] as const;

const LOOKUP_MARKERS = ["token_address", "mint_address", "pool_address", "/tokens/{", "/pools/{", "/token/"] as const;

const SENSITIVE_PATTERNS = [
  /authorization\s*[:=]\s*[^\n]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s,;)]+/gi,
  /apikey\s*[:=]\s*[^\s,;)]+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /wallet\s*[:=]\s*[^\n]+/gi,
  /seed\s*[:=]\s*[^\n]+/gi,
  /mnemonic\s*[:=]\s*[^\n]+/gi,
  /signature\s*[:=]\s*[^\n]+/gi,
] as const;

const KNOWN_FIRST_ROUTE = "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL";

function lower(value: string): string {
  return value.toLowerCase();
}

function sanitize(value: string): string {
  return SENSITIVE_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), value);
}

function shortSummary(raw: string): string {
  const trimmed = sanitize(raw).replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "Empty response body.";
  }
  return trimmed.slice(0, 280);
}

function urlHasQueryLikeShape(endpointUrl: string): boolean {
  const value = lower(endpointUrl);
  return value.includes("search") && (value.includes("query=") || value.includes(":search") || value.includes("/search"));
}

function urlHasLookupOnlyShape(endpointUrl: string): boolean {
  const value = lower(endpointUrl);
  if (value.includes("/tokens/") || value.includes("/pools/")) {
    return !value.includes("/search/") && !value.includes("query=");
  }
  return LOOKUP_MARKERS.some((marker) => value.includes(lower(marker)));
}

export function classifyCandidateRoute(input: {
  endpoint_url: string;
  request_shape: Record<string, unknown>;
}): { classification: Classification; reason: string } {
  const endpointUrl = input.endpoint_url;
  const requestShapeKeys = Object.keys(input.request_shape).map((key) => lower(key));
  const endpointLower = lower(endpointUrl);

  if (urlHasLookupOnlyShape(endpointUrl)) {
    if (endpointLower.includes("/tokens/")) {
      return {
        classification: "search_adjacent",
        reason: "Token detail/lookup path uses known token address semantics; not clean query search.",
      };
    }
    return {
      classification: "lookup_only",
      reason: "Route shape appears to require known token/pool identifier.",
    };
  }

  const hasQueryInput =
    endpointLower.includes("query=") ||
    requestShapeKeys.some((k) => ["query", "q", "symbol", "name", "search"].includes(k));

  if (urlHasQueryLikeShape(endpointUrl) && hasQueryInput) {
    return {
      classification: "clean_candidate",
      reason: "Query/symbol/name style search input detected without known token/pool address requirement.",
    };
  }

  if (QUERY_PATTERNS.some((pattern) => endpointLower.includes(lower(pattern)))) {
    return {
      classification: "search_adjacent",
      reason: "Search-like path pattern found, but query input shape is incomplete for clean comparability.",
    };
  }

  return {
    classification: "rejected",
    reason: "Does not match token-search route patterns.",
  };
}

function deriveProviderName(providerId: string): string {
  if (providerId === payspongeCoinGeckoTokenSearchCandidate.provider_id) {
    return payspongeCoinGeckoTokenSearchCandidate.provider_name;
  }
  if (providerId === payspongeCoinGeckoTokenLookupCandidate.provider_id) {
    return payspongeCoinGeckoTokenLookupCandidate.provider_name;
  }
  return providerId;
}

export function collectRouteCandidates(): RouteCandidate[] {
  const collected: RouteCandidate[] = [];
  const seen = new Set<string>();

  for (const mapping of providerEndpointMap) {
    if (!["finance", "data"].includes(mapping.category)) {
      continue;
    }

    const looksRelevant = QUERY_PATTERNS.some((pattern) => lower(mapping.url).includes(lower(pattern))) ||
      lower(mapping.url).includes("token") || lower(mapping.url).includes("pool");

    if (!looksRelevant) {
      continue;
    }

    const key = `${mapping.providerId}|${mapping.method}|${mapping.url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const requestShape: Record<string, unknown> =
      mapping.body && typeof mapping.body === "object" ? (mapping.body as Record<string, unknown>) : {};

    collected.push({
      provider_id: mapping.providerId,
      provider_name: deriveProviderName(mapping.providerId),
      endpoint_url: mapping.url,
      method: mapping.method,
      request_shape: requestShape,
      source: "providerEndpointMap",
    });
  }

  const knownCandidates: RouteCandidate[] = [
    {
      provider_id: payspongeCoinGeckoTokenSearchCandidate.provider_id,
      provider_name: payspongeCoinGeckoTokenSearchCandidate.provider_name,
      endpoint_url: payspongeCoinGeckoTokenSearchCandidate.endpoint_url,
      method: payspongeCoinGeckoTokenSearchCandidate.method,
      request_shape: payspongeCoinGeckoTokenSearchCandidate.request_shape_example,
      source: "known-mapping",
    },
    {
      provider_id: payspongeCoinGeckoTokenLookupCandidate.provider_id,
      provider_name: payspongeCoinGeckoTokenLookupCandidate.provider_name,
      endpoint_url: payspongeCoinGeckoTokenLookupCandidate.endpoint_url,
      method: payspongeCoinGeckoTokenLookupCandidate.method,
      request_shape: payspongeCoinGeckoTokenLookupCandidate.request_shape_example,
      source: "known-mapping",
    },
    {
      provider_id: "paysponge-coingecko",
      provider_name: "CoinGecko Onchain DEX API",
      endpoint_url: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/tokens?query=SOL",
      method: "GET",
      request_shape: { query: "SOL" },
      source: "heuristic-variant",
    },
  ];

  for (const candidate of knownCandidates) {
    const key = `${candidate.provider_id}|${candidate.method}|${candidate.endpoint_url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    collected.push(candidate);
  }

  return collected;
}

async function probeUnpaid(candidate: RouteCandidate): Promise<ProbeResult> {
  const routeClass = classifyCandidateRoute({
    endpoint_url: candidate.endpoint_url,
    request_shape: candidate.request_shape,
  });

  const method = candidate.method;
  let statusCode: number | null = null;
  let contentType: string | null = null;
  let paymentChallenge = false;
  let bodyText = "";

  try {
    const response = await fetch(candidate.endpoint_url, {
      method,
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
      body: method === "GET" ? undefined : JSON.stringify(candidate.request_shape),
    });

    statusCode = response.status;
    contentType = response.headers.get("content-type");
    const headerKeys = Array.from(response.headers.keys()).map((k) => lower(k));
    bodyText = await response.text();

    paymentChallenge =
      statusCode === 402 ||
      headerKeys.some((k) => k.includes("x402") || k.includes("payment") || k.includes("www-authenticate")) ||
      lower(bodyText).includes("payment required") ||
      lower(bodyText).includes("x402");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    bodyText = `probe_error: ${errorMessage}`;
  }

  let classification = routeClass.classification;
  let reason = routeClass.reason;

  if (candidate.endpoint_url === KNOWN_FIRST_ROUTE && classification === "clean_candidate") {
    reason = `${reason} This is the already-proven first route, not a second comparable route.`;
  }

  if (statusCode === null) {
    classification = classification === "clean_candidate" ? "search_adjacent" : classification;
    reason = `${reason} Unpaid probe failed to return HTTP status.`;
  }

  return {
    provider_id: candidate.provider_id,
    provider_name: candidate.provider_name,
    endpoint_url: candidate.endpoint_url,
    method,
    request_shape: candidate.request_shape,
    status_code: statusCode,
    payment_required_challenge_appears: paymentChallenge,
    content_type: contentType,
    safe_response_summary: shortSummary(bodyText),
    classification,
    reason,
  };
}

function formatRequestShape(requestShape: Record<string, unknown>): string {
  return JSON.stringify(requestShape);
}

export function renderDiscoveryReport(results: ProbeResult[], date: Date): string {
  const ymd = date.toISOString().slice(0, 10);
  const clean = results.filter((r) => r.classification === "clean_candidate");
  const searchAdjacent = results.filter((r) => r.classification === "search_adjacent");
  const lookupOnly = results.filter((r) => r.classification === "lookup_only");
  const rejected = results.filter((r) => r.classification === "rejected");

  const lines: string[] = [];
  lines.push(`# Token Search Second Route Discovery (${ymd})`);
  lines.push("");
  lines.push("Scope: unpaid route discovery/probing only for benchmark_intent `token search`.");
  lines.push("No benchmark readiness claim.");
  lines.push("No winner claim.");
  lines.push("");
  lines.push("## Candidate Probe Results");
  lines.push("");

  for (const result of results) {
    lines.push(`- provider_id: ${result.provider_id}`);
    lines.push(`- provider_name: ${result.provider_name}`);
    lines.push(`- endpoint_url: ${result.endpoint_url}`);
    lines.push(`- method: ${result.method}`);
    lines.push(`- request_shape: ${formatRequestShape(result.request_shape)}`);
    lines.push(`- status_code: ${result.status_code === null ? "null" : String(result.status_code)}`);
    lines.push(`- payment_required_challenge_appears: ${result.payment_required_challenge_appears}`);
    lines.push(`- content_type: ${result.content_type ?? "null"}`);
    lines.push(`- safe_response_summary: ${result.safe_response_summary}`);
    lines.push(`- classification: ${result.classification}`);
    lines.push(`- reason: ${result.reason}`);
    lines.push("");
  }

  lines.push("## Clean Candidates");
  lines.push(clean.length === 0 ? "- none" : clean.map((r) => `- ${r.provider_id} ${r.endpoint_url}`).join("\n"));
  lines.push("");

  lines.push("## Search-Adjacent Candidates");
  lines.push(searchAdjacent.length === 0 ? "- none" : searchAdjacent.map((r) => `- ${r.provider_id} ${r.endpoint_url}`).join("\n"));
  lines.push("");

  lines.push("## Lookup-Only Candidates");
  lines.push(lookupOnly.length === 0 ? "- none" : lookupOnly.map((r) => `- ${r.provider_id} ${r.endpoint_url}`).join("\n"));
  lines.push("");

  lines.push("## Rejected Paths");
  lines.push(rejected.length === 0 ? "- none" : rejected.map((r) => `- ${r.provider_id} ${r.endpoint_url} (${r.reason})`).join("\n"));
  lines.push("");

  const nonBaselineClean = clean.filter((r) => r.endpoint_url !== KNOWN_FIRST_ROUTE);
  if (nonBaselineClean.length === 0) {
    lines.push("No clean second token-search route found yet.");
  } else {
    lines.push("At least one clean second candidate route exists, but this report does not claim benchmark readiness.");
  }

  return sanitize(lines.join("\n"));
}

function toProviderSlug(providerId: string): string {
  return providerId
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

async function maybeWriteCandidateMapping(cleanSecond: ProbeResult, reportPath: string): Promise<string> {
  const providerSlug = toProviderSlug(cleanSecond.provider_id);
  const filePath = path.resolve(process.cwd(), `src/mappings/${providerSlug}TokenSearchCandidate.ts`);
  const constName = `${providerSlug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}TokenSearchCandidate`;

  const content = `export const ${constName} = {\n` +
    `  provider_id: ${JSON.stringify(cleanSecond.provider_id)},\n` +
    `  provider_name: ${JSON.stringify(cleanSecond.provider_name)},\n` +
    `  category: "finance/data",\n` +
    `  benchmark_intent: "token search",\n` +
    `  mapping_status: "candidate",\n` +
    `  execution_evidence_status: "unproven",\n` +
    `  proof_reference: ${JSON.stringify(path.relative(process.cwd(), reportPath))},\n` +
    `  endpoint_url: ${JSON.stringify(cleanSecond.endpoint_url)},\n` +
    `  method: ${JSON.stringify(cleanSecond.method)},\n` +
    `  request_shape_example: ${JSON.stringify(cleanSecond.request_shape)},\n` +
    `  notes: "Candidate only. Not benchmark-ready. No winner claimed.",\n` +
    `} as const;\n`;

  await writeFile(filePath, content, "utf8");
  return filePath;
}

export async function discoverTokenSearchRoutes(today = new Date()): Promise<{
  reportPath: string;
  results: ProbeResult[];
  cleanSecondCandidates: ProbeResult[];
  mappingPath: string | null;
}> {
  const candidates = collectRouteCandidates();
  const results: ProbeResult[] = [];

  for (const candidate of candidates) {
    results.push(await probeUnpaid(candidate));
  }

  const report = renderDiscoveryReport(results, today);
  const ymd = today.toISOString().slice(0, 10);
  const reportPath = path.resolve(process.cwd(), `live-proofs/token-search-second-route-discovery-${ymd}.md`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");

  const cleanSecondCandidates = results.filter(
    (r) => r.classification === "clean_candidate" && r.endpoint_url !== KNOWN_FIRST_ROUTE,
  );

  let mappingPath: string | null = null;
  if (cleanSecondCandidates.length === 1) {
    mappingPath = await maybeWriteCandidateMapping(cleanSecondCandidates[0], reportPath);
  }

  return { reportPath, results, cleanSecondCandidates, mappingPath };
}

if (require.main === module) {
  discoverTokenSearchRoutes()
    .then((result) => {
      if (result.mappingPath) {
        console.log(`Discovery report written: ${path.relative(process.cwd(), result.reportPath)}`);
        console.log(`Candidate mapping written: ${path.relative(process.cwd(), result.mappingPath)}`);
        return;
      }

      console.log(`Discovery report written: ${path.relative(process.cwd(), result.reportPath)}`);
      console.log("No clean second token-search route found yet.");
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
