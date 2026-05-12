import "dotenv/config";
import { fetchPayShCatalog } from "./payShClient";
import { fetchRadarSignals } from "./radarClient";
import { saveProofLog } from "./proofLog";
import { routeProvider } from "./router";
import { ProofLog, ProviderCatalogEntry } from "./types";

function getMinTrustScore(): number {
  const raw = Number(process.env.MIN_TRUST_SCORE);
  return Number.isFinite(raw) ? raw : 70;
}

function getIntentFromArgs(): string {
  const input = process.argv.slice(2).join(" ").trim();
  return input || "select provider for a payout request";
}

function selectNaiveProvider(catalog: ProviderCatalogEntry[]): ProviderCatalogEntry | null {
  if (catalog.length === 0) {
    return null;
  }

  const sorted = [...catalog].sort((a, b) => a.catalogPriority - b.catalogPriority);
  return sorted[0] ?? null;
}

async function main(): Promise<void> {
  const userIntent = getIntentFromArgs();
  const startedAt = Date.now();

  const catalogResult = await fetchPayShCatalog(userIntent);
  const naiveSelection = selectNaiveProvider(catalogResult.providers);

  const radarResult = await fetchRadarSignals(catalogResult.providers.map((provider) => provider.id));
  const routed = routeProvider({
    providers: catalogResult.providers,
    radarSignals: radarResult.signals,
    minTrustScore: getMinTrustScore(),
  });

  const naiveStatus = naiveSelection
    ? routed.rejectedProviders.some((item) => item.providerId === naiveSelection.id)
      ? "fails"
      : "passes"
    : "unknown";

  const radarSelectedId = routed.selectedProvider?.id ?? null;
  const radarImprovedRoute =
    naiveSelection !== null && radarSelectedId !== null
      ? naiveStatus === "fails" || naiveSelection.id !== radarSelectedId
      : naiveStatus === "fails";
  const naiveRejection = naiveSelection
    ? routed.rejectedProviders.find((item) => item.providerId === naiveSelection.id)
    : undefined;

  let explanation: string;
  if (!naiveSelection) {
    explanation = "Catalog returned no providers, so no naive route was available.";
  } else if (!radarSelectedId) {
    explanation = "Radar policy rejected all providers, so no safe route was selected.";
  } else if (naiveSelection.id === radarSelectedId) {
    explanation = "Radar agreed with the naive top-catalog provider after policy checks.";
  } else if (naiveStatus === "fails") {
    explanation =
      "Radar changed the route because the naive provider failed trust/degradation policy checks.";
  } else {
    explanation = "Radar selected a different provider with better score/latency ranking.";
  }

  const elapsedMs = Date.now() - startedAt;
  const simulatedOrLiveResult =
    catalogResult.mode === "live" && radarResult.mode === "live"
      ? "live"
      : "simulated-or-fallback";

  const proof: ProofLog = {
    timestamp: new Date().toISOString(),
    userIntent,
    candidateProviders: routed.candidateProviders,
    selectedProvider: routed.selectedProvider,
    rejectedProviders: routed.rejectedProviders,
    radarSignalsUsed: routed.radarSignalsUsed,
    routingPolicy: routed.routingPolicy,
    simulatedOrLiveResult,
    latencyMs: elapsedMs,
    success: routed.selectedProvider !== null,
    comparison: {
      naiveSelection,
      naiveSelectionPolicyStatus: naiveStatus,
      radarSelectedProviderId: radarSelectedId,
      radarImprovedRoute,
      explanation,
    },
  };

  const outputPath = await saveProofLog("demo-compare", proof);

  console.log("\n=== Naive vs Radar-Assisted Comparison ===");
  console.log(`Intent: ${userIntent}`);
  console.log(
    `Pre-flight verdict: ${
      naiveStatus === "fails"
        ? "blocked/redirected spend before provider call"
        : "naive choice passed policy checks"
    }`,
  );
  console.log(
    `Naive catalog selection: ${
      naiveSelection ? `${naiveSelection.name} (${naiveSelection.id})` : "none"
    }`,
  );
  console.log(`Naive policy status: ${naiveStatus}`);
  if (naiveRejection) {
    console.log(`Naive rejection reasons: ${naiveRejection.reasons.join(", ")}`);
  }
  console.log(
    `Radar-assisted selection: ${
      routed.selectedProvider
        ? `${routed.selectedProvider.name} (${routed.selectedProvider.id})`
        : "none"
    }`,
  );
  console.log(
    `Data mode: catalog=${catalogResult.mode}, radar=${radarResult.mode}, result=${simulatedOrLiveResult}`,
  );
  console.log(`Did Radar improve route? ${radarImprovedRoute ? "yes" : "no"}`);
  console.log(`Reason: ${explanation}`);
  console.log(`Proof log saved: ${outputPath}`);
  console.log(`Comparison latency: ${elapsedMs}ms\n`);
}

main().catch((error) => {
  console.error("demo:compare failed", error);
  process.exitCode = 1;
});
