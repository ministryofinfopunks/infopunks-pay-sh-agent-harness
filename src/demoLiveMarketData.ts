import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { fetchPayShCatalog } from "./payShClient";
import { callRadarPreflight, getRadarTimeoutMs, RadarPreflightInput } from "./radarClient";

interface LiveMarketDataProof {
  timestamp: string;
  intent: string;
  radarApiUsed: boolean;
  radarDecision: string;
  selectedProvider: string | null;
  selectedProviderDetails: Record<string, unknown> | null;
  requiredCapabilities: string[];
  dataMode: string | null;
  executionMode: "live_pay_sh" | "skipped";
  executionSuccess: boolean;
  statusCode: number | null;
  latencyMs: number;
  responsePreview: string;
  settlementReference: string | null;
  paymentRequired: boolean;
  paymentRequiredHeaderPresent: boolean;
  wwwAuthenticateHeaderPresent: boolean;
  paymentChallenge: {
    x402Version?: number;
    acceptsCount?: number;
    networks?: string[];
    assets?: string[];
    payTo?: string[];
    amounts?: string[];
    bazaarExtensionPresent?: boolean;
  } | null;
  radarPreflightRequest: RadarPreflightInput;
  rawRadarDecisionFields: Record<string, unknown>;
  caveat?: string;
}

const PROOFS_DIR = path.resolve(process.cwd(), "proofs");
const DEFAULT_MARKET_DATA_MIN_TRUST_SCORE = 70;
const DEFAULT_MARKET_DATA_MAX_LATENCY_MS = 3000;
const DEFAULT_MARKET_DATA_MAX_COST_USD = 0.05;

function getEnvNumber(name: string, defaultValue: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function safeFileSuffix(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function saveLiveMarketDataProof(proof: LiveMarketDataProof): Promise<string> {
  await mkdir(PROOFS_DIR, { recursive: true });
  const timestamp = proof.timestamp.replace(/[:.]/g, "-");
  const fileName = `${timestamp}-${safeFileSuffix("demo-live-market-data")}.json`;
  const outputPath = path.join(PROOFS_DIR, fileName);
  await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main(): Promise<void> {
  const intent = "get crypto market data";
  const category = "finance";
  const constraints = {
    minTrustScore: getEnvNumber("MARKET_DATA_MIN_TRUST_SCORE", DEFAULT_MARKET_DATA_MIN_TRUST_SCORE),
    maxLatencyMs: getEnvNumber("MARKET_DATA_MAX_LATENCY_MS", DEFAULT_MARKET_DATA_MAX_LATENCY_MS),
    maxCostUsd: getEnvNumber("MARKET_DATA_MAX_COST_USD", DEFAULT_MARKET_DATA_MAX_COST_USD),
  };
  const preflightRequest: RadarPreflightInput = {
    intent,
    category,
    constraints,
  };

  console.log("Radar preflight request:", JSON.stringify(preflightRequest, null, 2));

  const catalog = await fetchPayShCatalog(intent);
  const preflight = await callRadarPreflight(preflightRequest);

  const selectedProviderId = preflight.decision?.selectedProvider ?? null;
  const selectedCatalogProvider = selectedProviderId
    ? catalog.providers.find((provider) => provider.id === selectedProviderId)
    : null;
  const selectedProviderDetails = preflight.decision?.selectedProviderDetails ??
    (selectedCatalogProvider
      ? {
          providerId: selectedCatalogProvider.id,
          name: selectedCatalogProvider.name,
          region: selectedCatalogProvider.region,
          catalogPriority: selectedCatalogProvider.catalogPriority,
        }
      : null);

  const radarDecision = preflight.decision?.decision ?? "route_blocked";
  const rawRadarDecisionFields = {
    decision: preflight.decision?.decision,
    blockReason: preflight.decision?.blockReason,
    selectedProvider: preflight.decision?.selectedProvider,
    selectedProviderDetails: preflight.decision?.selectedProviderDetails,
    categoryMatch: preflight.decision?.categoryMatch,
    capabilityMatch: preflight.decision?.capabilityMatch,
    requiredCapabilities: preflight.decision?.requiredCapabilities,
    dataMode: preflight.decision?.dataMode,
  };

  console.log("\n=== Live Market-Data Demo ===");
  console.log(`Intent: ${intent}`);
  console.log(`Category: ${category}`);
  console.log(`Final constraints: ${JSON.stringify(constraints)}`);
  console.log(`Radar timeout: ${getRadarTimeoutMs()}ms`);
  console.log(`Radar endpoint: ${preflight.endpoint ?? "n/a"}`);
  console.log(`Radar decision: ${radarDecision}`);
  console.log(`Selected provider: ${selectedProviderId ?? "none"}`);
  console.log(`Selected provider details: ${JSON.stringify(selectedProviderDetails)}`);
  console.log(`Block reason: ${preflight.decision?.blockReason ?? "none"}`);
  console.log(`Category match: ${String(preflight.decision?.categoryMatch)}`);
  console.log(`Capability match: ${String(preflight.decision?.capabilityMatch)}`);
  console.log(
    `Required capabilities: ${JSON.stringify(preflight.decision?.requiredCapabilities ?? [])}`,
  );
  console.log(`Data mode: ${preflight.decision?.dataMode ?? "unknown"}`);
  console.log(`Raw Radar decision fields: ${JSON.stringify(rawRadarDecisionFields)}`);

  if (radarDecision !== "route_approved" || !selectedProviderId) {
    const proof: LiveMarketDataProof = {
      timestamp: new Date().toISOString(),
      intent,
      radarApiUsed: preflight.available,
      radarDecision,
      selectedProvider: selectedProviderId,
      selectedProviderDetails: selectedProviderDetails ?? null,
      requiredCapabilities: preflight.decision?.requiredCapabilities ?? [],
      dataMode: preflight.decision?.dataMode ?? null,
      executionMode: "skipped",
      executionSuccess: false,
      statusCode: null,
      latencyMs: 0,
      responsePreview: "",
      settlementReference: null,
      paymentRequired: false,
      paymentRequiredHeaderPresent: false,
      wwwAuthenticateHeaderPresent: false,
      paymentChallenge: null,
      radarPreflightRequest: preflightRequest,
      rawRadarDecisionFields,
      caveat: "route_blocked_by_radar_or_no_selected_provider",
    };

    const proofPath = await saveLiveMarketDataProof(proof);
    console.log("Execution: skipped (route blocked)");
    console.log(`Proof log saved: ${proofPath}\n`);
    return;
  }

  const execution = await executeLivePayShCall({
    providerId: selectedProviderId,
    intent,
    endpointUrl: process.env.PAYSH_EXECUTION_URL,
  });

  const proof: LiveMarketDataProof = {
    timestamp: new Date().toISOString(),
    intent,
    radarApiUsed: preflight.available,
    radarDecision,
    selectedProvider: selectedProviderId,
    selectedProviderDetails: selectedProviderDetails ?? null,
    requiredCapabilities: preflight.decision?.requiredCapabilities ?? [],
    dataMode: preflight.decision?.dataMode ?? null,
    executionMode: execution.mode,
    executionSuccess: execution.success,
    statusCode: execution.statusCode ?? null,
    latencyMs: execution.latencyMs,
    responsePreview: execution.responsePreview,
    settlementReference: execution.settlementReference,
    paymentRequired: execution.paymentRequired === true,
    paymentRequiredHeaderPresent: execution.paymentRequiredHeaderPresent === true,
    wwwAuthenticateHeaderPresent: execution.wwwAuthenticateHeaderPresent === true,
    paymentChallenge: execution.paymentChallenge
      ? {
          x402Version: execution.paymentChallenge.x402Version,
          acceptsCount: execution.paymentChallenge.acceptsCount,
          networks: execution.paymentChallenge.networks,
          assets: execution.paymentChallenge.assets,
          payTo: execution.paymentChallenge.payTo,
          amounts: execution.paymentChallenge.amounts,
          bazaarExtensionPresent: execution.paymentChallenge.bazaarExtensionPresent,
        }
      : null,
    radarPreflightRequest: preflightRequest,
    rawRadarDecisionFields,
    caveat: execution.mode === "skipped" ? execution.errorReason : undefined,
  };

  const proofPath = await saveLiveMarketDataProof(proof);
  console.log(`Execution mode: ${execution.mode}`);
  console.log(`Execution success: ${execution.success}`);
  console.log(`Status code: ${execution.statusCode ?? "n/a"}`);
  console.log(`Latency: ${execution.latencyMs}ms`);
  console.log(`Payment required: ${execution.paymentRequired ? "yes" : "no"}`);
  console.log(`x402Version: ${execution.paymentChallenge?.x402Version ?? "n/a"}`);
  console.log(`Networks: ${JSON.stringify(execution.paymentChallenge?.networks ?? [])}`);
  console.log(`Accepts count: ${execution.paymentChallenge?.acceptsCount ?? 0}`);
  console.log(
    `Bazaar extension present: ${execution.paymentChallenge?.bazaarExtensionPresent === true ? "yes" : "no"}`,
  );
  console.log(`Response preview: ${execution.responsePreview || "<empty>"}`);
  if (execution.settlementReference) {
    console.log(`Settlement reference: ${execution.settlementReference}`);
  }
  if (execution.mode === "skipped" && execution.errorReason) {
    console.log(`Caveat: ${execution.errorReason}`);
  }
  console.log(`Proof log saved: ${proofPath}\n`);
}

main().catch((error) => {
  console.error("demo:live-market-data failed", error);
  process.exitCode = 1;
});
