import "dotenv/config";
import { fetchPayShCatalog } from "./payShClient";
import { fetchRadarSignals } from "./radarClient";
import { saveProofLog } from "./proofLog";
import { routeProvider } from "./router";
import { ProofLog } from "./types";

function getMinTrustScore(): number {
  const raw = Number(process.env.MIN_TRUST_SCORE);
  return Number.isFinite(raw) ? raw : 70;
}

function getIntentFromArgs(): string {
  const input = process.argv.slice(2).join(" ").trim();
  return input || "send payout to a verified provider";
}

async function main(): Promise<void> {
  const userIntent = getIntentFromArgs();
  const startedAt = Date.now();

  const catalogResult = await fetchPayShCatalog(userIntent);
  const providerIds = catalogResult.providers.map((provider) => provider.id);
  const radarResult = await fetchRadarSignals(providerIds);

  const routing = routeProvider({
    providers: catalogResult.providers,
    radarSignals: radarResult.signals,
    minTrustScore: getMinTrustScore(),
  });

  const elapsedMs = Date.now() - startedAt;
  const simulatedOrLiveResult =
    catalogResult.mode === "live" && radarResult.mode === "live"
      ? "live"
      : "simulated-or-fallback";

  const proof: ProofLog = {
    timestamp: new Date().toISOString(),
    userIntent,
    candidateProviders: routing.candidateProviders,
    selectedProvider: routing.selectedProvider,
    rejectedProviders: routing.rejectedProviders,
    radarSignalsUsed: routing.radarSignalsUsed,
    routingPolicy: routing.routingPolicy,
    simulatedOrLiveResult,
    latencyMs: elapsedMs,
    success: routing.selectedProvider !== null,
  };

  const outputPath = await saveProofLog("demo-route", proof);

  console.log("\n=== Radar-Assisted Route Decision ===");
  console.log(`Intent: ${userIntent}`);
  console.log(`Catalog mode: ${catalogResult.mode}`);
  if (catalogResult.warning) {
    console.log(`Catalog note: ${catalogResult.warning}`);
  }
  console.log(`Radar mode: ${radarResult.mode}`);
  if (radarResult.warning) {
    console.log(`Radar note: ${radarResult.warning}`);
  }

  if (routing.selectedProvider) {
    console.log("Selected provider:");
    console.log(
      `- ${routing.selectedProvider.name} (${routing.selectedProvider.id}) | ` +
        `trust=${routing.selectedProvider.trustScore} signal=${routing.selectedProvider.signalScore} ` +
        `latency=${routing.selectedProvider.latencyMs}ms`,
    );
  } else {
    console.log("Selected provider: none (all providers rejected by policy)");
  }

  console.log("Rejected providers:");
  for (const rejection of routing.rejectedProviders) {
    console.log(`- ${rejection.providerName} (${rejection.providerId}): ${rejection.reasons.join(", ")}`);
  }

  console.log(`Proof log saved: ${outputPath}`);
  console.log(`Decision latency: ${elapsedMs}ms\n`);
}

main().catch((error) => {
  console.error("demo:route failed", error);
  process.exitCode = 1;
});
