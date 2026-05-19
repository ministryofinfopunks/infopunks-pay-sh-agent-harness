import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeCommunicationsEmailDelivery,
  type CanonicalEmailInput,
  type CaveatObject,
} from "./benchmarks/communicationsEmailDeliveryNormalization";

type ProviderEntry = {
  id?: string;
  provider_id?: string;
  service?: string;
  title?: string;
  name?: string;
  category?: string;
  type?: string;
  service_url?: string;
  url?: string;
  endpoints?: Array<{
    method?: string;
    url?: string;
    path?: string;
    description?: string;
    resource?: string | null;
    metered?: boolean;
  }>;
};

type CandidateRoute = {
  provider: string;
  category: string;
  endpoint: string;
  method: string;
  requestShape: Record<string, unknown>;
  ownershipOrAuthBlockers: string[];
  semanticFit: "yes" | "partial" | "no";
  unpaidProbeStatusEvidence: string;
  paymentChallengeDetected: boolean;
  caveatObjects: CaveatObject[];
  conclusion: "candidate/unproven" | "verified/unproven" | "rejected";
};

const TODAY = new Date().toISOString().slice(0, 10);
const OUT_PATH = `live-proofs/communications-email-delivery-second-route-search-${TODAY}.md`;
const CATALOG_DETAIL_DIR = path.join(process.env.HOME ?? "", ".config/pay/skills/detail");

const CANONICAL_INPUT: CanonicalEmailInput = {
  to: process.env.BENCHMARK_EMAIL_TO?.trim() || "bench@example.com",
  subject: "Infopunks Radar benchmark",
  body: "Radar benchmark delivery test.",
};

function lower(value: string): string {
  return value.toLowerCase();
}

function hasAny(text: string, needles: string[]): boolean {
  const t = lower(text);
  return needles.some((n) => t.includes(lower(n)));
}

function isEmailLikeProvider(provider: ProviderEntry): boolean {
  const blob = JSON.stringify(provider).toLowerCase();
  return hasAny(blob, ["email", "inbox", "message", "messaging"]);
}

function isComparableSendEndpoint(endpoint: { method?: string; url?: string; description?: string }): boolean {
  const method = (endpoint.method ?? "").toUpperCase();
  const text = `${endpoint.url ?? ""} ${endpoint.description ?? ""}`.toLowerCase();
  if (method !== "POST") {
    return false;
  }
  if (!hasAny(text, ["send", "reply", "forward"])) {
    return false;
  }
  if (hasAny(text, ["list", "read", "status", "verify", "validate", "contact", "domain", "thread", "draft", "topup", "buy", "delete", "cancel", "update"])) {
    return false;
  }
  if (!hasAny(text, ["email", "inbox", "message"])) {
    return false;
  }
  return true;
}

function buildRequestShape(endpoint: string): Record<string, unknown> {
  if (endpoint.includes("stableemail.dev/api/send")) {
    return { to: ["<canonical_to>"], subject: "<canonical_subject>", text: "<canonical_body>" };
  }
  if (endpoint.includes("stableemail.dev/api/inbox/send")) {
    return { username: "<stableemail_username>", to: ["<canonical_to>"], subject: "<canonical_subject>", text: "<canonical_body>" };
  }
  if (endpoint.includes("stableemail.dev/api/subdomain/send")) {
    return { subdomain: "<stableemail_subdomain>", from: "<sender@subdomain>", to: ["<canonical_to>"], subject: "<canonical_subject>", text: "<canonical_body>" };
  }
  if (endpoint.includes("agentmail.to/v0/inboxes/{inbox_id}/messages/send")) {
    return { to: ["<canonical_to>"], subject: "<canonical_subject>", text: "<canonical_body>" };
  }
  return { to: ["<canonical_to>"], subject: "<canonical_subject>", text: "<canonical_body>" };
}

function buildProbeUrlAndBody(endpoint: string): { url: string; body: Record<string, unknown> } {
  const body = { to: [CANONICAL_INPUT.to], subject: CANONICAL_INPUT.subject, text: CANONICAL_INPUT.body };
  if (endpoint.includes("{inbox_id}")) {
    return { url: endpoint.replace("{inbox_id}", "dummy-inbox"), body };
  }
  if (endpoint.includes("stableemail.dev/api/inbox/send")) {
    return { url: endpoint, body: { username: "dummy-user", ...body } };
  }
  if (endpoint.includes("stableemail.dev/api/subdomain/send")) {
    return { url: endpoint, body: { subdomain: "dummy.example", from: "relay@dummy.example", ...body } };
  }
  return { url: endpoint, body };
}

function statusEvidence(statusCode: number | null): string {
  return statusCode === null ? "status_unavailable" : `status_code_observed_${statusCode}`;
}

async function unpaidProbe(route: {
  provider: string;
  category: string;
  endpoint: string;
  method: string;
  requestShape: Record<string, unknown>;
  semanticFit: "yes" | "partial" | "no";
}): Promise<CandidateRoute> {
  const probe = buildProbeUrlAndBody(route.endpoint);
  let statusCode: number | null = null;
  let text = "";
  let parsed: unknown = {};
  let paymentChallengeDetected = false;
  const ownershipOrAuthBlockers: string[] = [];

  try {
    const response = await fetch(probe.url, {
      method: route.method,
      headers: { Accept: "application/json, text/plain;q=0.9, */*;q=0.8", "Content-Type": "application/json" },
      body: JSON.stringify(probe.body),
    });
    statusCode = response.status;
    const headers = Array.from(response.headers.keys()).map((k) => k.toLowerCase());
    text = await response.text();
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = text;
    }
    paymentChallengeDetected =
      statusCode === 402 ||
      headers.some((h) => h.includes("x402") || h.includes("payment") || h.includes("www-authenticate")) ||
      hasAny(text, ["payment required", "x402", "accepts", "payto"]);
    if (statusCode === 401) {
      ownershipOrAuthBlockers.push("auth_required");
    }
    if (statusCode === 403 || hasAny(text, ["ownership", "forbidden"])) {
      ownershipOrAuthBlockers.push("ownership_guard");
    }
  } catch (error) {
    text = error instanceof Error ? error.message : String(error);
    parsed = text;
  }

  const normalized = normalizeCommunicationsEmailDelivery({
    parsedJson: parsed,
    responsePreview: text.slice(0, 1000),
    statusCode,
    statusEvidence: statusEvidence(statusCode),
    paidExecutionObserved: false,
    canonicalInput: CANONICAL_INPUT,
  });

  let conclusion: CandidateRoute["conclusion"] = "candidate/unproven";
  if (route.semanticFit === "no") {
    conclusion = "rejected";
  } else if (paymentChallengeDetected && route.semanticFit === "yes" && ownershipOrAuthBlockers.length === 0) {
    conclusion = "verified/unproven";
  } else if (statusCode === 404) {
    conclusion = "rejected";
  }

  return {
    provider: route.provider,
    category: route.category,
    endpoint: route.endpoint,
    method: route.method,
    requestShape: route.requestShape,
    ownershipOrAuthBlockers,
    semanticFit: route.semanticFit,
    unpaidProbeStatusEvidence: statusEvidence(statusCode),
    paymentChallengeDetected,
    caveatObjects: normalized.caveat_objects,
    conclusion,
  };
}

function uniqueByProviderEndpoint(routes: CandidateRoute[]): CandidateRoute[] {
  const seen = new Set<string>();
  const out: CandidateRoute[] = [];
  for (const route of routes) {
    const key = `${route.provider} ${route.method} ${route.endpoint}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(route);
  }
  return out;
}

async function main(): Promise<void> {
  const detailFiles = (await readdir(CATALOG_DETAIL_DIR)).filter((name) => name.endsWith(".json"));
  const providers: ProviderEntry[] = [];
  for (const file of detailFiles) {
    const raw = await readFile(path.join(CATALOG_DETAIL_DIR, file), "utf8");
    const parsed = JSON.parse(raw) as ProviderEntry;
    providers.push(parsed);
  }

  const discovered: Array<{
    provider: string;
    category: string;
    endpoint: string;
    method: string;
    requestShape: Record<string, unknown>;
    semanticFit: "yes" | "partial" | "no";
  }> = [];

  for (const provider of providers) {
    if (!isEmailLikeProvider(provider)) {
      continue;
    }
    const providerId =
      (provider as ProviderEntry & { fqn?: string }).fqn ??
      provider.id ??
      provider.provider_id ??
      provider.service ??
      provider.title ??
      provider.name ??
      "unknown";
    const category = provider.category ?? provider.type ?? "unknown";
    const baseUrl = provider.service_url ?? provider.url ?? "";
    for (const endpoint of provider.endpoints ?? []) {
      if (!endpoint.method) {
        continue;
      }
      const endpointUrl =
        endpoint.url ??
        (endpoint.path
          ? `${baseUrl.replace(/\/$/, "")}/${endpoint.path.replace(/^\//, "")}`
          : "");
      if (!endpointUrl) {
        continue;
      }
      if (!isComparableSendEndpoint({ ...endpoint, url: endpointUrl })) {
        continue;
      }
      const semanticFit: "yes" | "partial" | "no" =
        providerId.includes("textbelt") || providerId.includes("stablephone")
          ? "no"
          : endpointUrl.includes("/api/send") || endpointUrl.includes("/messages/send")
            ? "yes"
            : endpointUrl.includes("/inbox/send") || endpointUrl.includes("/subdomain/send") || endpointUrl.includes("/reply") || endpointUrl.includes("/forward")
              ? "partial"
              : "no";
      discovered.push({
        provider: providerId,
        category,
        endpoint: endpointUrl,
        method: endpoint.method.toUpperCase(),
        requestShape: buildRequestShape(endpointUrl),
        semanticFit,
      });
    }
  }

  const probed = uniqueByProviderEndpoint(
    await Promise.all(discovered.map((route) => unpaidProbe(route))),
  );

  const alternatesComparable = probed.filter(
    (entry) =>
      !entry.provider.includes("stableemail") &&
      !entry.provider.includes("agentmail") &&
      entry.semanticFit !== "no" &&
      entry.conclusion !== "rejected",
  );
  const secondRouteBlocked = alternatesComparable.length === 0;

  const lines: string[] = [
    `# Communications Email Delivery Second Route Search (${TODAY})`,
    "",
    "- benchmark: communications-email-delivery",
    "- paid_execution_attempted: false",
    "- winner_claimed: false",
    "- benchmark_recorded: false",
    "",
  ];

  for (const item of probed) {
    lines.push(`## Candidate: ${item.provider}`);
    lines.push(`- provider: ${item.provider}`);
    lines.push(`- category: ${item.category}`);
    lines.push(`- endpoint: ${item.endpoint}`);
    lines.push(`- method: ${item.method}`);
    lines.push(`- request_shape: ${JSON.stringify(item.requestShape)}`);
    lines.push(`- unpaid_probe_status_evidence: ${item.unpaidProbeStatusEvidence}`);
    lines.push(`- payment_challenge_detected: ${item.paymentChallengeDetected}`);
    lines.push(`- ownership_auth_blockers: ${item.ownershipOrAuthBlockers.length > 0 ? JSON.stringify(item.ownershipOrAuthBlockers) : "[]"}`);
    lines.push(`- semantic_fit_for_email_delivery: ${item.semanticFit}`);
    lines.push(`- caveat_objects: ${JSON.stringify(item.caveatObjects)}`);
    lines.push(`- conclusion: ${item.conclusion}`);
    lines.push("");
  }

  if (secondRouteBlocked) {
    lines.push("- second_route_blocked: true");
    lines.push("- blocker: ownership_guard_or_missing_config_or_no_alternate_provider");
    lines.push("- recommendation: find alternate communications provider or keep scaffold");
  } else {
    lines.push("- second_route_blocked: false");
  }

  const outAbs = path.resolve(process.cwd(), OUT_PATH);
  await mkdir(path.dirname(outAbs), { recursive: true });
  await writeFile(outAbs, `${lines.join("\n")}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        proof_path: OUT_PATH,
        candidate_count: probed.length,
        alternate_non_stableemail_non_agentmail_count: alternatesComparable.length,
        second_route_blocked: secondRouteBlocked,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
