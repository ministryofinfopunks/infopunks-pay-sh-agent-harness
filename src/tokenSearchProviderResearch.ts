import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export type ProviderClassification =
  | "clean_candidate_possible"
  | "needs_docs_review"
  | "lookup_only"
  | "not_relevant"
  | "unavailable";

export interface ProviderSummary {
  fqn: string;
  title: string;
  category: string;
  service_url: string;
  description: string;
  use_case: string;
  sha?: string;
}

export interface ProviderEndpoint {
  method: string;
  url: string;
  path: string;
  description: string;
}

interface ProviderDetail {
  fqn: string;
  openapi?: { url?: string };
  source?: { repo?: string; path?: string };
}

export interface ProviderResearchRow {
  provider_id: string;
  provider_name: string;
  category: string;
  service_url: string;
  catalog_description_use_cases: string;
  token_search_suggested_by_metadata: boolean;
  candidate_endpoint: string | null;
  docs_url: string | null;
  classification: ProviderClassification;
}

const RESEARCH_QUERIES = ["crypto", "market", "token", "coin", "pool", "search"];
const SEARCH_HINTS = ["search", "query", "symbol", "token search", "coin search", "market search", "pool search"];
const STRICT_SEARCH_HINTS = ["search", "query"];
const LOOKUP_HINTS = ["by-address", "address", "token/{", "tokens/{", "pool/{", "pools/{", "lookup", "by-id", "/id"];
const TOKEN_HINTS = ["token", "coin", "pool", "dex", "onchain", "market"];

function lower(value: string): string {
  return value.toLowerCase();
}

function combineMetadata(summary: ProviderSummary): string {
  return `${summary.description} ${summary.use_case}`.trim();
}

function hasAny(haystack: string, needles: string[]): boolean {
  const value = lower(haystack);
  return needles.some((needle) => value.includes(lower(needle)));
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

export function isFinanceDataLikeProvider(summary: ProviderSummary): boolean {
  if (summary.category === "finance" || summary.category === "data") {
    return true;
  }
  return hasAny(`${summary.fqn} ${summary.title} ${summary.description} ${summary.use_case}`, ["crypto", "market-data"]);
}

export function classifyProviderFromMetadata(input: {
  summary: ProviderSummary;
  endpoints: ProviderEndpoint[];
}): {
  classification: ProviderClassification;
  tokenSearchSuggested: boolean;
  candidateEndpoint: string | null;
} {
  const summaryText = combineMetadata(input.summary);
  const endpointText = input.endpoints.map((ep) => `${ep.path} ${ep.description}`).join(" ");
  const tokenSemantic = hasAny(`${summaryText} ${endpointText}`, TOKEN_HINTS);
  const searchSemantic = hasAny(`${summaryText} ${endpointText}`, SEARCH_HINTS);
  const lookupOnly =
    input.endpoints.length > 0 &&
    input.endpoints.every((ep) => hasAny(`${ep.path} ${ep.description}`, LOOKUP_HINTS)) &&
    !searchSemantic;

  const searchEndpoints = input.endpoints.filter((ep) =>
    hasAny(`${ep.path} ${ep.description}`, SEARCH_HINTS) && hasAny(`${ep.path} ${ep.description}`, TOKEN_HINTS)
  );
  const bestEndpoint =
    searchEndpoints
      .slice()
      .sort((a, b) => {
        const score = (ep: ProviderEndpoint) => {
          const text = `${ep.path} ${ep.description}`;
          return Number(hasAny(text, STRICT_SEARCH_HINTS)) * 2 + Number(hasAny(text, ["symbol"]));
        };
        return score(b) - score(a);
      })[0]?.url ?? null;

  if (!tokenSemantic && !searchSemantic) {
    return { classification: "not_relevant", tokenSearchSuggested: false, candidateEndpoint: null };
  }
  if (searchSemantic && !tokenSemantic) {
    return { classification: "not_relevant", tokenSearchSuggested: false, candidateEndpoint: null };
  }
  if (lookupOnly) {
    return { classification: "lookup_only", tokenSearchSuggested: false, candidateEndpoint: null };
  }
  if (searchEndpoints.length > 0) {
    return {
      classification: "clean_candidate_possible",
      tokenSearchSuggested: tokenSemantic && searchSemantic,
      candidateEndpoint: bestEndpoint,
    };
  }
  if (searchSemantic || tokenSemantic) {
    return {
      classification: "needs_docs_review",
      tokenSearchSuggested: tokenSemantic && searchSemantic,
      candidateEndpoint: null,
    };
  }
  return { classification: "unavailable", tokenSearchSuggested: false, candidateEndpoint: null };
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

export function renderProviderResearchReport(rows: ProviderResearchRow[], now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Token Search Provider Research (${date})`);
  lines.push("");
  lines.push("Scope: catalog metadata research only. No paid execution.");
  lines.push("Classification uses provider descriptions, use cases, and catalog-listed endpoints.");
  lines.push("No benchmark readiness claim.");
  lines.push("No winner claim.");
  lines.push("");
  lines.push("| provider_id | provider_name | category | service_url | catalog description/use cases | token search suggested by metadata | candidate endpoint | docs URL | classification |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const row of rows) {
    lines.push(
      `| ${row.provider_id} | ${row.provider_name} | ${row.category} | ${row.service_url} | ${row.catalog_description_use_cases.replace(/\|/g, "\\|")} | ${row.token_search_suggested_by_metadata} | ${row.candidate_endpoint ?? "n/a"} | ${row.docs_url ?? "n/a"} | ${row.classification} |`,
    );
  }
  lines.push("");
  const hasSecondCandidate = rows.some(
    (row) => row.classification === "clean_candidate_possible" && row.provider_id !== "paysponge/coingecko",
  );
  if (!hasSecondCandidate) {
    lines.push("No confirmed second query-based token-search route found from provider metadata.");
  } else {
    lines.push("At least one candidate/unproven second query-based token-search route was identified from metadata.");
  }
  return lines.join("\n");
}

export async function researchTokenSearchProviders(now = new Date()): Promise<{
  rows: ProviderResearchRow[];
  reportPath: string;
}> {
  const summaries = await loadProviderSummaries();
  const detailsByFqn = await loadProviderDetailsByFqn();
  const endpointsByService = new Map<string, ProviderEndpoint[]>();
  for (const query of RESEARCH_QUERIES) {
    const hits = runPaySkillsSearch(query);
    for (const hit of hits) {
      const existing = endpointsByService.get(hit.service) ?? [];
      const incoming = hit.endpoints ?? [];
      const dedup = new Map(existing.map((ep) => [`${ep.method}|${ep.url}`, ep]));
      for (const endpoint of incoming) {
        dedup.set(`${endpoint.method}|${endpoint.url}`, endpoint);
      }
      endpointsByService.set(hit.service, Array.from(dedup.values()));
    }
  }

  const rows: ProviderResearchRow[] = summaries
    .filter(isFinanceDataLikeProvider)
    .map((summary) => {
      const endpoints = endpointsByService.get(summary.fqn) ?? [];
      const classified = classifyProviderFromMetadata({ summary, endpoints });
      const metadata = combineMetadata(summary);
      return {
        provider_id: summary.fqn,
        provider_name: summary.title,
        category: summary.category,
        service_url: summary.service_url,
        catalog_description_use_cases: metadata,
        token_search_suggested_by_metadata: classified.tokenSearchSuggested,
        candidate_endpoint: classified.candidateEndpoint,
        docs_url: buildDocsUrl(detailsByFqn.get(summary.fqn)),
        classification: endpoints.length === 0 ? "unavailable" : classified.classification,
      };
    })
    .sort((a, b) => a.provider_id.localeCompare(b.provider_id));

  const ymd = now.toISOString().slice(0, 10);
  const reportPath = path.resolve(process.cwd(), `live-proofs/token-search-provider-research-${ymd}.md`);
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${renderProviderResearchReport(rows, now)}\n`, "utf8");
  return { rows, reportPath };
}

if (require.main === module) {
  researchTokenSearchProviders()
    .then((result) => {
      console.log(`Research report written: ${path.relative(process.cwd(), result.reportPath)}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
