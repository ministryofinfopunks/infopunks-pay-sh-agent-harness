import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { providerEndpointMap } from "./providerEndpointMap";

export type ProviderClassification =
  | "clean_candidate_possible"
  | "needs_docs_review"
  | "search_only"
  | "price_only"
  | "lookup_only"
  | "pool_only"
  | "not_relevant"
  | "unavailable";

export interface ProviderSummary {
  fqn: string;
  title: string;
  category: string;
  service_url: string;
  description: string;
  use_case: string;
}

export interface ProviderEndpoint {
  method?: string;
  url?: string;
  path?: string;
  description?: string;
}

interface ProviderDetail {
  fqn: string;
  openapi?: { url?: string };
  source?: { repo?: string; path?: string };
  endpoints?: ProviderEndpoint[];
  openapi_doc?: {
    servers?: Array<{ url?: string }>;
    paths?: Record<string, Record<string, { requestBody?: unknown }>>;
  };
}

export interface ProviderResearchRow {
  provider_id: string;
  provider_name: string;
  category: string;
  service_url: string;
  catalog_description_use_cases: string;
  candidate_endpoint: string | null;
  method: string | null;
  request_shape: string | null;
  why_token_metadata_candidate: string;
  uncertainty_missing_information: string;
  classification: ProviderClassification;
  docs_url: string | null;
  canonical_input_candidate: string | null;
  rejected_endpoint_notes: string[];
}

const RESEARCH_QUERIES = ["token", "metadata", "coin", "onchain", "crypto", "address"];

const TARGET_PROVIDER_IDS = new Set(["paysponge/coingecko", "merit-systems/stablecrypto/market-data"]);

const SENSITIVE_PATTERNS = [
  /authorization\s*[:=]\s*[^\n]+/gi,
  /api[_-]?key\s*[:=]\s*[^\s,;)]+/gi,
  /apikey\s*[:=]\s*[^\s,;)]+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /private\s*[:=]\s*[^\n]+/gi,
  /secret\s*[:=]\s*[^\n]+/gi,
  /wallet\s*[:=]\s*[^\n]+/gi,
  /seed\s*[:=]\s*[^\n]+/gi,
  /mnemonic\s*[:=]\s*[^\n]+/gi,
  /signature\s*[:=]\s*[^\n]+/gi,
] as const;

const METADATA_HINTS = [
  "token metadata",
  "coin metadata",
  "metadata",
  "token info",
  "token data",
  "decimals",
  "description",
  "image",
  "logo",
  "attributes",
  "contract metadata",
  "by token address",
  "token contract",
] as const;

const IDENTITY_FIELD_HINTS = ["symbol", "name", "address", "network", "decimals", "attributes"] as const;

const PRICE_HINTS = [
  "price",
  "prices",
  "market data",
  "chart",
  "volume",
  "fdv",
  "market cap",
  "historical",
  "ohlcv",
] as const;

const SEARCH_HINTS = ["search", "query"] as const;
const POOL_HINTS = ["pool", "pools"] as const;
const LOOKUP_HINTS = ["lookup", "by-address", "address", "contract address", "token/{", "tokens/{"] as const;

const TOKEN_METADATA_PATTERNS = [
  /\/coins\/\{id\}/i,
  /\/coins\/list/i,
  /\/onchain\/networks\/\{network\}\/tokens\/\{[^}]*address\}/i,
  /\/onchain\/networks\/\{network\}\/tokens\/\{[^}]*address\}\/info/i,
  /\/tokens\/\{address\}/i,
  /\/token\/\{network\}\/\{address\}/i,
  /\/asset\/\{symbol\}/i,
  /\/metadata/i,
  /\/token-metadata/i,
] as const;

const CANONICAL_SOL_INPUT = {
  symbol: "SOL",
  network: "solana",
  token_address: "So11111111111111111111111111111111111111112",
};

function lower(value: string): string {
  return value.toLowerCase();
}

function hasAny(haystack: string, needles: readonly string[]): boolean {
  const value = lower(haystack);
  return needles.some((needle) => value.includes(lower(needle)));
}

function sanitize(value: string): string {
  return SENSITIVE_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, "[REDACTED]"), value);
}

function combineMetadata(summary: ProviderSummary): string {
  return `${summary.description} ${summary.use_case}`.trim();
}

function readJsonArray<T>(value: string): T[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed as T[];
}

function runPaySkillsSearch(query: string): Array<{ service: string; endpoints?: ProviderEndpoint[] }> {
  const stdout = execFileSync("pay", ["skills", "search", query, "--json"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return readJsonArray<{ service: string; endpoints?: ProviderEndpoint[] }>(stdout);
}

function toSegments(value: string): string[] {
  return value.split("/").map((item) => item.trim()).filter((item) => item.length > 0);
}

function joinServiceUrlAndEndpointPath(providerServiceUrl: string, endpointPath: string): string {
  if (/^https?:\/\//i.test(endpointPath)) {
    return endpointPath;
  }

  try {
    const base = new URL(providerServiceUrl);
    const serviceSegments = toSegments(base.pathname);
    const endpointSegments = toSegments(endpointPath);

    let overlap = 0;
    const maxOverlap = Math.min(serviceSegments.length, endpointSegments.length);
    for (let k = maxOverlap; k >= 1; k -= 1) {
      const serviceSuffix = serviceSegments.slice(serviceSegments.length - k).join("/");
      const endpointPrefix = endpointSegments.slice(0, k).join("/");
      if (serviceSuffix === endpointPrefix) {
        overlap = k;
        break;
      }
    }

    const joinedSegments = [...serviceSegments, ...endpointSegments.slice(overlap)];
    const joinedPath = `/${joinedSegments.join("/")}`;
    return `${base.origin}${joinedPath}`;
  } catch {
    const pathWithoutPrefix = endpointPath.replace(/^https?:\/\/[^/]+\/?/i, "").replace(/^\/+/, "");
    return `${providerServiceUrl.replace(/\/$/, "")}/${pathWithoutPrefix}`;
  }
}

function normalizeEndpoint(providerServiceUrl: string, endpoint: ProviderEndpoint): Required<ProviderEndpoint> {
  const method = endpoint.method ?? "GET";
  const pathValue = endpoint.path ?? endpoint.url ?? "";
  const pathWithoutPrefix = pathValue.replace(/^https?:\/\/[^/]+\/?/i, "").replace(/^\/+/, "");
  const url = endpoint.url ?? joinServiceUrlAndEndpointPath(providerServiceUrl, pathWithoutPrefix);
  return {
    method,
    url,
    path: pathWithoutPrefix,
    description: endpoint.description ?? "",
  };
}

async function loadProviderSummaries(): Promise<ProviderSummary[]> {
  const skillsDir = path.join(homedir(), ".config", "pay", "skills");
  const files = (await readdir(skillsDir))
    .filter((name) => /^skills-\d+-[a-f0-9]+\.json$/.test(name))
    .sort();
  if (files.length === 0) {
    return [];
  }
  const latestPath = path.join(skillsDir, files[files.length - 1]);
  const raw = await readFile(latestPath, "utf8");
  const parsed = JSON.parse(raw) as { providers?: ProviderSummary[] };
  return parsed.providers ?? [];
}

async function loadProviderDetailsByFqn(): Promise<Map<string, ProviderDetail>> {
  const detailDir = path.join(homedir(), ".config", "pay", "skills", "detail");
  const map = new Map<string, ProviderDetail>();
  let files: string[] = [];
  try {
    files = (await readdir(detailDir)).filter((file) => file.endsWith(".json"));
  } catch {
    return map;
  }

  for (const file of files) {
    const raw = await readFile(path.join(detailDir, file), "utf8");
    const detail = JSON.parse(raw) as ProviderDetail;
    if (typeof detail.fqn === "string") {
      map.set(detail.fqn, detail);
    }
  }
  return map;
}

function buildDocsUrl(detail?: ProviderDetail): string | null {
  if (detail?.openapi?.url) {
    return detail.openapi.url;
  }
  if (detail?.source?.repo && detail?.source?.path) {
    return `https://github.com/${detail.source.repo}/blob/main/${detail.source.path}`;
  }
  return null;
}

function resolveProviderBaseUrl(summary: ProviderSummary | undefined, detail: ProviderDetail | undefined): string {
  const fromOpenApiServer = detail?.openapi_doc?.servers?.find((server) => typeof server.url === "string" && server.url.length > 0)?.url;
  if (typeof fromOpenApiServer === "string" && fromOpenApiServer.length > 0) {
    return fromOpenApiServer;
  }
  return summary?.service_url ?? "";
}

export function classifyTokenMetadataCandidate(input: {
  summaryText: string;
  endpointPath: string;
  endpointDescription: string;
}): ProviderClassification {
  const endpointText = `${input.endpointPath} ${input.endpointDescription}`;

  const hasMetadataPattern = TOKEN_METADATA_PATTERNS.some((pattern) => pattern.test(input.endpointPath));
  const hasMetadataWords = hasAny(endpointText, METADATA_HINTS);
  const hasIdentityWords = hasAny(endpointText, IDENTITY_FIELD_HINTS);
  const hasTokenEntityWords = hasAny(endpointText, ["token", "contract", "address", "coin"]);
  const hasSearch = hasAny(endpointText, SEARCH_HINTS);
  const hasPrice = hasAny(endpointText, PRICE_HINTS);
  const hasPool = hasAny(endpointText, POOL_HINTS);
  const hasLookup = hasAny(endpointText, LOOKUP_HINTS);
  const hasExcludedNonMetadata = hasAny(endpointText, [
    "balance",
    "balances",
    "transfers",
    "simulation",
    "rpc",
    "trending",
    "price",
    "prices",
    "market data",
    "chart",
    "historical",
    "ohlcv",
    "volume",
    "token_price",
  ]);

  const hasMetadata = (hasMetadataPattern || hasMetadataWords || (hasIdentityWords && hasTokenEntityWords)) && !hasExcludedNonMetadata;

  if (hasMetadata) {
    return "clean_candidate_possible";
  }
  if (hasSearch && !hasMetadata) {
    return "search_only";
  }
  if (hasPrice && !hasMetadata) {
    return "price_only";
  }
  if (hasPool && !hasMetadata) {
    return "pool_only";
  }
  if (hasLookup && !hasMetadata) {
    return "lookup_only";
  }
  if (hasAny(endpointText, ["token", "coin", "contract", "address"])) {
    return "needs_docs_review";
  }
  return "not_relevant";
}

function pickCandidateEndpoint(input: {
  summary: ProviderSummary;
  endpoints: Required<ProviderEndpoint>[];
}): {
  endpoint: Required<ProviderEndpoint> | null;
  classification: ProviderClassification;
  why: string;
  uncertainty: string;
} {
  if (input.endpoints.length === 0) {
    const text = combineMetadata(input.summary);
    const metadataLikely = hasAny(text, METADATA_HINTS);
    if (metadataLikely) {
      return {
        endpoint: null,
        classification: "needs_docs_review",
        why: "Catalog description/use-case mentions token metadata fields but no endpoint metadata is present locally.",
        uncertainty: "Endpoint path/method/request shape needs docs review.",
      };
    }
    return {
      endpoint: null,
      classification: "unavailable",
      why: "No local endpoint metadata available for this provider in current Pay skills cache.",
      uncertainty: "Refresh provider metadata or docs to continue discovery.",
    };
  }

  const summaryText = combineMetadata(input.summary);
  const ranked = input.endpoints.map((endpoint) => {
    const classification = classifyTokenMetadataCandidate({
      summaryText,
      endpointPath: endpoint.path,
      endpointDescription: endpoint.description,
    });

    const score =
      Number(classification === "clean_candidate_possible") * 100 +
      Number(/token-metadata/i.test(endpoint.path)) * 30 +
      Number(/tokens\/\{[^}]*address\}/i.test(endpoint.path)) * 25 +
      Number(/\/coin$/i.test(endpoint.path)) * 15 +
      Number(/metadata/i.test(endpoint.description)) * 10;

    return { endpoint, classification, score };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.classification === "not_relevant") {
    return {
      endpoint: null,
      classification: "not_relevant",
      why: "Inspected endpoints do not indicate token metadata semantics.",
      uncertainty: "Provider likely targets a different benchmark intent.",
    };
  }

  if (best.classification === "clean_candidate_possible") {
    return {
      endpoint: best.endpoint,
      classification: "clean_candidate_possible",
      why: "Endpoint path/description indicates token identity metadata fields (name/symbol/address/network/decimals or metadata attributes).",
      uncertainty: "Response schema and method/request compatibility are still unproven without execution.",
    };
  }

  return {
    endpoint: best.endpoint,
    classification: best.classification,
    why: `Endpoint appears ${best.classification.replace(/_/g, " ")} rather than token-metadata specific semantics.`,
    uncertainty: "Needs endpoint-level docs review before candidate promotion.",
  };
}

function requestShapeExampleFromSchema(schema: unknown): Record<string, unknown> | null {
  if (typeof schema !== "object" || schema === null) {
    return null;
  }

  const properties = (schema as { properties?: unknown }).properties;
  if (typeof properties !== "object" || properties === null) {
    return null;
  }

  const example: Record<string, unknown> = {};
  for (const [key] of Object.entries(properties as Record<string, unknown>)) {
    const normalizedKey = lower(key);
    if (normalizedKey.includes("network")) {
      example[key] = "solana";
      continue;
    }
    if (normalizedKey.includes("contract") || normalizedKey.includes("address") || normalizedKey.includes("mint")) {
      example[key] = CANONICAL_SOL_INPUT.token_address;
      continue;
    }
    if (normalizedKey === "id" || normalizedKey.endsWith("_id")) {
      example[key] = "solana";
      continue;
    }
    if (normalizedKey.includes("query") || normalizedKey === "q" || normalizedKey.includes("symbol")) {
      example[key] = "SOL";
      continue;
    }
    if (normalizedKey.includes("market_data") || normalizedKey.includes("developer_data") || normalizedKey.includes("community_data")) {
      example[key] = false;
      continue;
    }
  }

  return Object.keys(example).length > 0 ? example : null;
}

function requestShapeExampleFromDetail(detail: ProviderDetail | undefined, endpointPath: string): Record<string, unknown> | null {
  const paths = detail?.openapi_doc?.paths;
  if (!paths) {
    return null;
  }

  const normalized = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const methods = paths[normalized];
  if (!methods) {
    return null;
  }

  const firstMethod = Object.values(methods)[0];
  const schema = (firstMethod?.requestBody as { content?: Record<string, { schema?: unknown }> } | undefined)?.content?.["application/json"]?.schema;
  return requestShapeExampleFromSchema(schema);
}

function canonicalInputForEndpoint(endpoint: Required<ProviderEndpoint> | null): string | null {
  if (!endpoint) {
    return null;
  }
  const pathValue = endpoint.path;
  if (/tokens\/\{[^}]*address\}/i.test(pathValue)) {
    return JSON.stringify(CANONICAL_SOL_INPUT);
  }
  if (/token-metadata/i.test(pathValue)) {
    return JSON.stringify({ network: "solana", contractAddress: CANONICAL_SOL_INPUT.token_address });
  }
  if (/\/coin$/i.test(pathValue)) {
    return JSON.stringify({ id: "solana" });
  }
  if (/search/i.test(pathValue)) {
    return JSON.stringify({ query: "SOL" });
  }
  return null;
}

function dedupeEndpoints(endpoints: Required<ProviderEndpoint>[]): Required<ProviderEndpoint>[] {
  const dedup = new Map<string, Required<ProviderEndpoint>>();
  for (const endpoint of endpoints) {
    dedup.set(`${endpoint.method}|${endpoint.path}`, endpoint);
  }
  return Array.from(dedup.values());
}

function isFinanceDataLikeProvider(summary: ProviderSummary): boolean {
  if (summary.category === "finance" || summary.category === "data") {
    return true;
  }
  return hasAny(`${summary.fqn} ${summary.title} ${summary.description} ${summary.use_case}`, ["crypto", "token", "coin"]);
}

function providerBaseName(providerId: string): string {
  if (providerId === "paysponge/coingecko") {
    return "payspongeCoinGecko";
  }
  if (providerId === "merit-systems/stablecrypto/market-data") {
    return "stablecrypto";
  }

  return providerId
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
}

export function renderTokenMetadataResearchReport(rows: ProviderResearchRow[], now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Token Metadata Provider Research (${date})`);
  lines.push("");
  lines.push("Scope: provider metadata discovery only. No paid execution.");
  lines.push("Benchmark intent: token metadata (identity/descriptive fields, not pure price/search/pool routes).");
  lines.push("Canonical metadata input candidate considered: SOL on solana with mint/token address So11111111111111111111111111111111111111112 when endpoint shape supports address input.");
  lines.push("No benchmark readiness claim.");
  lines.push("No winner claim.");
  lines.push("");

  lines.push("## Providers Reviewed");
  for (const row of rows) {
    lines.push(`- ${row.provider_id} (${row.provider_name})`);
  }
  lines.push("");

  lines.push("## Candidate Endpoints Found");
  const candidateRows = rows.filter((row) => row.classification === "clean_candidate_possible" && row.candidate_endpoint);
  if (candidateRows.length === 0) {
    lines.push("- none");
  } else {
    for (const row of candidateRows) {
      lines.push(`- ${row.provider_id} ${row.method ?? "unknown"} ${row.candidate_endpoint}`);
    }
  }
  lines.push("");

  lines.push("## Rejected/Non-Clean Endpoints");
  const rejectedRows = rows.filter((row) => row.classification !== "clean_candidate_possible");
  const endpointRejected = rows.flatMap((row) =>
    row.rejected_endpoint_notes.map((note) => `- ${row.provider_id}: ${note}`),
  );
  if (rejectedRows.length === 0 && endpointRejected.length === 0) {
    lines.push("- none observed from inspected provider metadata.");
  } else {
    for (const row of rejectedRows) {
      lines.push(`- ${row.provider_id} (${row.classification}): ${row.why_token_metadata_candidate}`);
    }
    for (const line of endpointRejected) {
      lines.push(line);
    }
  }
  lines.push("");

  lines.push("## Classification Table");
  lines.push("");
  lines.push("| provider_id | provider_name | category | service_url | catalog description/use cases | candidate endpoint | method | request shape | why it may be token metadata | uncertainty / missing information | classification | canonical input candidate | docs URL |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");

  for (const row of rows) {
    lines.push(
      `| ${row.provider_id} | ${row.provider_name} | ${row.category} | ${row.service_url} | ${row.catalog_description_use_cases.replace(/\|/g, "\\|")} | ${row.candidate_endpoint ?? "n/a"} | ${row.method ?? "n/a"} | ${(row.request_shape ?? "n/a").replace(/\|/g, "\\|")} | ${row.why_token_metadata_candidate.replace(/\|/g, "\\|")} | ${row.uncertainty_missing_information.replace(/\|/g, "\\|")} | ${row.classification} | ${(row.canonical_input_candidate ?? "n/a").replace(/\|/g, "\\|")} | ${row.docs_url ?? "n/a"} |`,
    );
  }

  lines.push("");
  lines.push("Strict caveat: candidate discovery evidence only. Token metadata semantics still require endpoint/method/request-shape verification before any benchmark use.");
  lines.push("No paid execution performed by this research task.");

  if (candidateRows.length === 0) {
    lines.push("No confirmed token metadata candidate found yet.");
  }

  return sanitize(lines.join("\n"));
}

export async function maybeWriteTokenMetadataCandidateMappings(input: {
  rows: ProviderResearchRow[];
  reportPath: string;
  baseDir?: string;
}): Promise<string[]> {
  const baseDir = input.baseDir ?? process.cwd();
  const reportReference = path.relative(baseDir, input.reportPath);

  const cleanRows = input.rows.filter(
    (row) => row.classification === "clean_candidate_possible" && row.candidate_endpoint && row.method,
  );

  const written: string[] = [];
  for (const row of cleanRows) {
    const baseName = providerBaseName(row.provider_id);
    const constName = `${baseName}TokenMetadataCandidate`;
    const mappingPath = path.resolve(baseDir, `src/mappings/${baseName}TokenMetadataCandidate.ts`);

    const mappingContent = `export const ${constName} = {\n` +
      `  provider_id: ${JSON.stringify(row.provider_id)},\n` +
      `  provider_name: ${JSON.stringify(row.provider_name)},\n` +
      `  category: "finance/data",\n` +
      `  benchmark_intent: "token metadata",\n` +
      `  mapping_status: "candidate",\n` +
      `  execution_evidence_status: "unproven",\n` +
      `  proof_source: "provider_metadata_research",\n` +
      `  proof_reference: ${JSON.stringify(reportReference)},\n` +
      `  endpoint_url: ${JSON.stringify(row.candidate_endpoint)},\n` +
      `  method: ${JSON.stringify(row.method)},\n` +
      `  request_shape_example: ${row.request_shape ?? "null"},\n` +
      `  notes: "Candidate only. Token metadata semantics need endpoint/method/request-shape verification. Not benchmark-ready. No winner claimed.",\n` +
      `} as const;\n`;

    await writeFile(mappingPath, mappingContent, "utf8");
    written.push(mappingPath);
  }

  return written;
}

export async function researchTokenMetadataProviders(now = new Date()): Promise<{
  rows: ProviderResearchRow[];
  reportPath: string;
  mappingPaths: string[];
}> {
  const summaries = await loadProviderSummaries();
  const detailsByFqn = await loadProviderDetailsByFqn();

  const endpointsByService = new Map<string, Required<ProviderEndpoint>[]>();

  for (const query of RESEARCH_QUERIES) {
    const hits = runPaySkillsSearch(query);
    for (const hit of hits) {
      const summary = summaries.find((item) => item.fqn === hit.service);
      const detail = detailsByFqn.get(hit.service);
      const serviceUrl = resolveProviderBaseUrl(summary, detail);
      const existing = endpointsByService.get(hit.service) ?? [];
      const incoming = (hit.endpoints ?? []).map((ep) => normalizeEndpoint(serviceUrl, ep));
      endpointsByService.set(hit.service, dedupeEndpoints([...existing, ...incoming]));
    }
  }

  for (const detail of detailsByFqn.values()) {
    if (!detail.endpoints || detail.endpoints.length === 0) {
      continue;
    }

    const summary = summaries.find((item) => item.fqn === detail.fqn);
    const serviceUrl = resolveProviderBaseUrl(summary, detail);
    const existing = endpointsByService.get(detail.fqn) ?? [];
    const incoming = detail.endpoints.map((ep) => normalizeEndpoint(serviceUrl, ep));
    endpointsByService.set(detail.fqn, dedupeEndpoints([...existing, ...incoming]));
  }

  const providersFromMap = new Set(
    providerEndpointMap
      .filter((row) => row.category === "finance" || row.category === "data")
      .map((row) => row.providerId.replace(/-/g, "/")),
  );

  const rows = summaries
    .filter((summary) => isFinanceDataLikeProvider(summary))
    .filter((summary) => TARGET_PROVIDER_IDS.has(summary.fqn) || providersFromMap.has(summary.fqn))
    .map((summary) => {
      const detail = detailsByFqn.get(summary.fqn);
      const endpoints = endpointsByService.get(summary.fqn) ?? [];
      const selected = pickCandidateEndpoint({ summary, endpoints });
      const requestShapeByDoc = selected.endpoint ? requestShapeExampleFromDetail(detail, selected.endpoint.path) : null;
      const requestShapeFallback = selected.endpoint
        ? JSON.parse(canonicalInputForEndpoint(selected.endpoint) ?? "null") as Record<string, unknown> | null
        : null;
      const requestShapeObject = requestShapeByDoc ?? requestShapeFallback;
      const requestShape = requestShapeObject ? JSON.stringify(requestShapeObject) : null;

      const rejected_endpoint_notes = endpoints
        .filter((ep) => {
          if (!selected.endpoint) {
            return false;
          }
          return ep.path !== selected.endpoint.path || ep.method !== selected.endpoint.method;
        })
        .map((ep) => {
          const endpointClass = classifyTokenMetadataCandidate({
            summaryText: combineMetadata(summary),
            endpointPath: ep.path,
            endpointDescription: ep.description,
          });
          return `${ep.method} ${ep.url} (${endpointClass})`;
        })
        .slice(0, 6);

      return {
        provider_id: summary.fqn,
        provider_name: summary.title,
        category: summary.category,
        service_url: summary.service_url,
        catalog_description_use_cases: combineMetadata(summary),
        candidate_endpoint: selected.endpoint?.url ?? null,
        method: selected.endpoint?.method ?? null,
        request_shape: requestShape,
        why_token_metadata_candidate: selected.why,
        uncertainty_missing_information: selected.uncertainty,
        classification: selected.classification,
        docs_url: buildDocsUrl(detail),
        canonical_input_candidate: canonicalInputForEndpoint(selected.endpoint),
        rejected_endpoint_notes,
      } satisfies ProviderResearchRow;
    })
    .sort((a, b) => a.provider_id.localeCompare(b.provider_id));

  const ymd = now.toISOString().slice(0, 10);
  const reportPath = path.resolve(process.cwd(), `live-proofs/token-metadata-provider-research-${ymd}.md`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  const report = renderTokenMetadataResearchReport(rows, now);
  await writeFile(reportPath, `${report}\n`, "utf8");

  const mappingPaths = await maybeWriteTokenMetadataCandidateMappings({ rows, reportPath });

  return { rows, reportPath, mappingPaths };
}

if (require.main === module) {
  researchTokenMetadataProviders()
    .then((result) => {
      console.log(`Research report written: ${path.relative(process.cwd(), result.reportPath)}`);
      if (result.mappingPaths.length === 0) {
        console.log("No confirmed token metadata candidate found yet.");
        return;
      }
      for (const mappingPath of result.mappingPaths) {
        console.log(`Candidate mapping written: ${path.relative(process.cwd(), mappingPath)}`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
