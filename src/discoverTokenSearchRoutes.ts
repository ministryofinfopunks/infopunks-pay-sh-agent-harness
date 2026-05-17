import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { providerEndpointMap } from "./providerEndpointMap";
import { payspongeCoinGeckoTokenSearchCandidate } from "./mappings/payspongeCoinGeckoTokenSearch";

type Classification = "clean_candidate_sol" | "clean_candidate_general" | "search_adjacent" | "rejected";
type QueryTerm = "SOL" | "ETH" | "BTC";
type QueryOutcomeLabel = "payment_required" | "success" | "not_found" | "auth_required" | "unsupported";

type CandidateSource = "providerEndpointMap" | "known-mapping" | "heuristic-variant";

interface RouteCandidate {
  provider_id: string;
  provider_name: string;
  endpoint_url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  request_shape: Record<string, unknown>;
  source: CandidateSource;
}

interface QueryOutcome {
  query_term: QueryTerm;
  status_code: number | null;
  outcome: QueryOutcomeLabel;
  payment_required_challenge_appears: boolean;
  content_type: string | null;
  safe_response_summary: string;
}

interface ProbeResult {
  provider_id: string;
  provider_name: string;
  endpoint_url: string;
  method: string;
  request_shape: Record<string, unknown>;
  query_outcomes: QueryOutcome[];
  classification: Classification;
  reason: string;
}

const QUERY_TERMS: QueryTerm[] = ["SOL", "ETH", "BTC"];

const QUERY_PATTERNS = [
  "search",
  "query",
  "tokens/search",
  "coins/search",
  "pools/search",
  "onchain/search",
  "search/pools?query=",
  "search/tokens?query=",
] as const;

const LOOKUP_MARKERS = ["token_address", "mint_address", "pool_address", "/tokens/", "/pools/"] as const;

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
const QUERY_PATH_SUFFIXES = [
  { method: "GET" as const, suffix: "/search?query=SOL" },
  { method: "GET" as const, suffix: "/tokens/search?query=SOL" },
  { method: "GET" as const, suffix: "/coins/search?query=SOL" },
  { method: "GET" as const, suffix: "/onchain/search/pools?query=SOL" },
  { method: "GET" as const, suffix: "/onchain/search/tokens?query=SOL" },
  { method: "GET" as const, suffix: "/networks/solana/search/tokens?query=SOL" },
  { method: "POST" as const, suffix: "/search", request_shape: { query: "SOL" } },
  { method: "POST" as const, suffix: "/tokens/search", request_shape: { query: "SOL" } },
] as const;

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

function isLookupStyleUrl(endpointUrl: string): boolean {
  const value = lower(endpointUrl);
  const tokenDetailLike = value.includes("/tokens/") && !value.includes("/search/") && !value.includes("query=");
  const poolDetailLike = value.includes("/pools/") && !value.includes("/search/") && !value.includes("query=");
  return tokenDetailLike || poolDetailLike;
}

function supportsQueryShape(endpointUrl: string, requestShape: Record<string, unknown>): boolean {
  const endpointLower = lower(endpointUrl);
  const requestShapeKeys = Object.keys(requestShape).map((key) => lower(key));
  const hasQueryInput = endpointLower.includes("query=") || requestShapeKeys.some((k) => ["query", "q", "symbol", "name", "search"].includes(k));
  const hasSearchPath = endpointLower.includes("search") || endpointLower.includes(":search");
  return hasSearchPath && hasQueryInput;
}

function hasTokenSearchSemantics(endpointUrl: string): boolean {
  const endpointLower = lower(endpointUrl);
  return ["token", "tokens", "pool", "pools", "onchain", "coin", "dex"].some((term) => endpointLower.includes(term));
}

export function classifyCandidateRoute(input: {
  endpoint_url: string;
  request_shape: Record<string, unknown>;
  query_outcomes?: QueryOutcome[];
}): { classification: Classification; reason: string } {
  const endpointUrl = input.endpoint_url;
  const endpointLower = lower(endpointUrl);
  const requestShapeKeys = Object.keys(input.request_shape).map((key) => lower(key));

  const hasLookupMarker = LOOKUP_MARKERS.some((marker) => endpointLower.includes(lower(marker))) ||
    requestShapeKeys.some((key) => ["token_address", "mint_address", "pool_address", "token_id"].includes(key));

  if (isLookupStyleUrl(endpointUrl) || hasLookupMarker) {
    return {
      classification: "search_adjacent",
      reason: "Token/pool/address lookup route. Search-adjacent only; not clean query-based token search.",
    };
  }

  if (!supportsQueryShape(endpointUrl, input.request_shape)) {
    if (QUERY_PATTERNS.some((pattern) => endpointLower.includes(lower(pattern)))) {
      return {
        classification: "search_adjacent",
        reason: "Search-like path exists but query/symbol/name search input is not clearly supported.",
      };
    }
    return {
      classification: "rejected",
      reason: "Does not match token-search route patterns.",
    };
  }

  if (!hasTokenSearchSemantics(endpointUrl)) {
    return {
      classification: "rejected",
      reason: "Query route exists but endpoint does not appear token/pool/onchain specific.",
    };
  }

  const outcomes = input.query_outcomes ?? [];
  const solOutcome = outcomes.find((o) => o.query_term === "SOL");
  const ethOutcome = outcomes.find((o) => o.query_term === "ETH");
  const btcOutcome = outcomes.find((o) => o.query_term === "BTC");

  const solAccepted = Boolean(solOutcome && (solOutcome.outcome === "payment_required" || solOutcome.outcome === "success"));
  const generalAccepted = [ethOutcome, btcOutcome].some(
    (outcome) => outcome && (outcome.outcome === "payment_required" || outcome.outcome === "success"),
  );

  if (solAccepted) {
    return {
      classification: "clean_candidate_sol",
      reason: "Route accepts canonical SOL query input with payment-required or success behavior.",
    };
  }

  if (generalAccepted) {
    return {
      classification: "clean_candidate_general",
      reason: "Route accepts ETH/BTC query input but not SOL; candidate is not benchmark-ready for SOL token-search benchmark.",
    };
  }

  return {
    classification: "rejected",
    reason: "Query route exists but SOL/ETH/BTC probes did not show accepted search behavior.",
  };
}

function deriveProviderName(providerId: string): string {
  if (providerId === payspongeCoinGeckoTokenSearchCandidate.provider_id) {
    return payspongeCoinGeckoTokenSearchCandidate.provider_name;
  }
  return providerId;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function deriveQueryProbeBases(endpointUrl: string): string[] {
  const parsed = new URL(endpointUrl);
  const rawPath = parsed.pathname;
  const x402Index = rawPath.indexOf("/x402");
  const bases: string[] = [];
  bases.push(`${parsed.origin}`);
  if (x402Index >= 0) {
    const prefix = rawPath.slice(0, x402Index + "/x402".length);
    bases.push(`${parsed.origin}${prefix}`);
  }
  const apiV3X402Index = rawPath.indexOf("/api/v3/x402");
  if (apiV3X402Index >= 0) {
    const prefix = rawPath.slice(0, apiV3X402Index + "/api/v3/x402".length);
    bases.push(`${parsed.origin}${prefix}`);
  }
  return Array.from(new Set(bases.map(trimTrailingSlash)));
}

function replaceQueryTerm(url: string, term: QueryTerm): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has("query")) {
    parsed.searchParams.set("query", term);
    return parsed.toString();
  }
  return url;
}

function applyQueryTermToRequestShape(requestShape: Record<string, unknown>, term: QueryTerm): Record<string, unknown> {
  const copy = { ...requestShape };
  if (typeof copy.query === "string") {
    copy.query = term;
  }
  if (typeof copy.q === "string") {
    copy.q = term;
  }
  if (typeof copy.symbol === "string") {
    copy.symbol = term;
  }
  if (typeof copy.name === "string") {
    copy.name = term;
  }
  return copy;
}

function deriveOutcomeLabel(statusCode: number | null, paymentChallenge: boolean): QueryOutcomeLabel {
  if (paymentChallenge || statusCode === 402) {
    return "payment_required";
  }
  if (statusCode === 200) {
    return "success";
  }
  if (statusCode === 404) {
    return "not_found";
  }
  if (statusCode === 401 || statusCode === 403) {
    return "auth_required";
  }
  return "unsupported";
}

export function collectRouteCandidates(): RouteCandidate[] {
  const collected: RouteCandidate[] = [];
  const seen = new Set<string>();

  for (const mapping of providerEndpointMap) {
    if (!["finance", "data"].includes(mapping.category)) {
      continue;
    }

    const looksRelevant =
      QUERY_PATTERNS.some((pattern) => lower(mapping.url).includes(lower(pattern))) ||
      lower(mapping.url).includes("token") ||
      lower(mapping.url).includes("pool");

    if (!looksRelevant) {
      continue;
    }

    const bases = deriveQueryProbeBases(mapping.url);
    for (const base of bases) {
      for (const shape of QUERY_PATH_SUFFIXES) {
        const requestShape = "request_shape" in shape ? shape.request_shape : { query: "SOL" };
        const key = `${mapping.providerId}|${shape.method}|${base}${shape.suffix}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        collected.push({
          provider_id: mapping.providerId,
          provider_name: deriveProviderName(mapping.providerId),
          endpoint_url: `${base}${shape.suffix}`,
          method: shape.method,
          request_shape: requestShape,
          source: "providerEndpointMap",
        });
      }
    }
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

async function probeSingleTerm(candidate: RouteCandidate, term: QueryTerm): Promise<QueryOutcome> {
  const method = candidate.method;
  const endpointUrl = replaceQueryTerm(candidate.endpoint_url, term);
  const requestShape = applyQueryTermToRequestShape(candidate.request_shape, term);
  let statusCode: number | null = null;
  let contentType: string | null = null;
  let paymentChallenge = false;
  let bodyText = "";

  try {
    const response = await fetch(endpointUrl, {
      method,
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      },
      body: method === "GET" ? undefined : JSON.stringify(requestShape),
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

  return {
    query_term: term,
    status_code: statusCode,
    outcome: deriveOutcomeLabel(statusCode, paymentChallenge),
    payment_required_challenge_appears: paymentChallenge,
    content_type: contentType,
    safe_response_summary: shortSummary(bodyText),
  };
}

async function probeUnpaid(candidate: RouteCandidate): Promise<ProbeResult> {
  const queryOutcomes = await Promise.all(QUERY_TERMS.map((term) => probeSingleTerm(candidate, term)));

  const routeClass = classifyCandidateRoute({
    endpoint_url: candidate.endpoint_url,
    request_shape: candidate.request_shape,
    query_outcomes: queryOutcomes,
  });

  let reason = routeClass.reason;
  if (candidate.endpoint_url === KNOWN_FIRST_ROUTE && routeClass.classification === "clean_candidate_sol") {
    reason = `${reason} This is the already-proven first route, not a second comparable route.`;
  }

  return {
    provider_id: candidate.provider_id,
    provider_name: candidate.provider_name,
    endpoint_url: candidate.endpoint_url,
    method: candidate.method,
    request_shape: candidate.request_shape,
    query_outcomes: queryOutcomes,
    classification: routeClass.classification,
    reason,
  };
}

function formatRequestShape(requestShape: Record<string, unknown>): string {
  return JSON.stringify(requestShape);
}

export function renderDiscoveryReport(results: ProbeResult[], date: Date): string {
  const ymd = date.toISOString().slice(0, 10);
  const cleanSol = results.filter((r) => r.classification === "clean_candidate_sol");
  const cleanGeneral = results.filter((r) => r.classification === "clean_candidate_general");
  const searchAdjacent = results.filter((r) => r.classification === "search_adjacent");
  const rejected = results.filter((r) => r.classification === "rejected");

  const lines: string[] = [];
  lines.push(`# Token Search Query Route Discovery (${ymd})`);
  lines.push("");
  lines.push("Scope: unpaid route discovery/probing only for benchmark_intent `token search`.");
  lines.push("Canonical benchmark query remains SOL.");
  lines.push("Tested query terms: SOL, ETH, BTC.");
  lines.push("No benchmark readiness claim.");
  lines.push("No winner claim.");
  lines.push("No paid execution run by this discovery unless explicitly enabled elsewhere.");
  lines.push("");
  lines.push("## Candidate Probe Results");
  lines.push("");

  for (const result of results) {
    lines.push(`- provider_id: ${result.provider_id}`);
    lines.push(`- provider_name: ${result.provider_name}`);
    lines.push(`- endpoint_url: ${result.endpoint_url}`);
    lines.push(`- method: ${result.method}`);
    lines.push(`- request_shape: ${formatRequestShape(result.request_shape)}`);
    lines.push("- query_outcomes:");
    for (const outcome of result.query_outcomes) {
      lines.push(`  - term: ${outcome.query_term}`);
      lines.push(`  - status_code: ${outcome.status_code === null ? "null" : String(outcome.status_code)}`);
      lines.push(`  - outcome: ${outcome.outcome}`);
      lines.push(`  - payment_required_challenge_appears: ${outcome.payment_required_challenge_appears}`);
      lines.push(`  - content_type: ${outcome.content_type ?? "null"}`);
      lines.push(`  - safe_response_summary: ${outcome.safe_response_summary}`);
    }
    lines.push(`- classification: ${result.classification}`);
    lines.push(`- reason: ${result.reason}`);
    lines.push("");
  }

  lines.push("## Clean Candidates (SOL)");
  lines.push(cleanSol.length === 0 ? "- none" : cleanSol.map((r) => `- ${r.provider_id} ${r.endpoint_url}`).join("\n"));
  lines.push("");

  lines.push("## Clean Candidates (General ETH/BTC only)");
  lines.push(cleanGeneral.length === 0 ? "- none" : cleanGeneral.map((r) => `- ${r.provider_id} ${r.endpoint_url}`).join("\n"));
  lines.push("");
  lines.push("Note: ETH/BTC-only routes are not benchmark-ready for SOL token-search benchmark.");
  lines.push("");

  lines.push("## Search-Adjacent Candidates");
  lines.push(searchAdjacent.length === 0 ? "- none" : searchAdjacent.map((r) => `- ${r.provider_id} ${r.endpoint_url}`).join("\n"));
  lines.push("");

  lines.push("## Rejected Paths");
  lines.push(rejected.length === 0 ? "- none" : rejected.map((r) => `- ${r.provider_id} ${r.endpoint_url} (${r.reason})`).join("\n"));
  lines.push("");

  const nonBaselineCleanSol = cleanSol.filter((r) => r.endpoint_url !== KNOWN_FIRST_ROUTE);
  if (nonBaselineCleanSol.length === 0) {
    lines.push("No clean second token-search route found yet.");
  } else {
    lines.push("At least one clean SOL candidate route exists, but this report does not claim benchmark readiness.");
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
  const constName = `${providerSlug.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase())}TokenSearchCandidate`;

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
    `  notes: "Candidate only. Not benchmark-ready. No winner claimed. SOL is canonical benchmark query.",\n` +
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
  const reportPath = path.resolve(process.cwd(), `live-proofs/token-search-query-route-discovery-${ymd}.md`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, report, "utf8");

  const cleanSecondCandidates = results.filter(
    (r) => r.classification === "clean_candidate_sol" && r.endpoint_url !== KNOWN_FIRST_ROUTE,
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
