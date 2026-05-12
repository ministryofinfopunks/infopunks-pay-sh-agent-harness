import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { providerEndpointMap, ProviderEndpointMapping } from "./providerEndpointMap";
import { validateJsonRpcResponse, JsonRpcOutputShape } from "./jsonRpcValidator";

const DEFAULT_TRIALS = 5;
const DEFAULT_CALL_DELAY_MS = 1500;
const DEFAULT_METHODS = ["getHealth", "getBalance", "getSlot"] as const;
const DEFAULT_TRIAL_MODE = "suite";
const RESULTS_DIR = path.resolve(process.cwd(), "benchmark-results", "live-rpc");

interface RpcCallRecord {
  trialId: number;
  timestamp: string;
  endpointMappingId: string;
  providerId: string;
  methodName: string;
  outputShape: string;
  success: boolean;
  exitCode: number | null;
  executionMode: string;
  latencyMs: number | null;
  parsedJsonAvailable: boolean;
  responsePreview: string;
  stderrPreview: string;
  endpointUrl: string | null;
  requestMethod: string | null;
  requestBodyPreview: string | null;
  commandShape: string | null;
  errorReason: string | null;
  jsonRpcValid: boolean;
  jsonRpcMethod: string | null;
  jsonRpcResultShapeValid: boolean;
  slot: number | null;
  apiVersion: string | null;
  validationError: string | null;
  errorClassification: string | null;
}

function getTrials(): number {
  const arg = process.argv.find((entry) => entry.startsWith("--trials="));
  const value = arg ? Number(arg.slice("--trials=".length)) : DEFAULT_TRIALS;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_TRIALS;
}

function getMethodName(mapping: ProviderEndpointMapping): string {
  const body = mapping.body;
  if (typeof body !== "object" || body === null) {
    return "unknown";
  }
  const method = (body as Record<string, unknown>).method;
  return typeof method === "string" ? method : "unknown";
}

function getCallDelayMs(): number {
  const value = Number(process.env.LIVE_RPC_CALL_DELAY_MS ?? DEFAULT_CALL_DELAY_MS);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_CALL_DELAY_MS;
}

function getSelectedMethods(): string[] {
  const raw = process.env.LIVE_RPC_METHODS?.trim();
  if (!raw) {
    return [...DEFAULT_METHODS];
  }
  return raw
    .split(",")
    .map((method) => method.trim())
    .filter((method) => method.length > 0);
}

function getTrialMode(): "suite" | "single" {
  const value = process.env.LIVE_RPC_TRIAL_MODE?.trim().toLowerCase();
  return value === "single" ? "single" : DEFAULT_TRIAL_MODE;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyError(stderrPreview: string, success: boolean, jsonRpcValid: boolean): string | null {
  if (stderrPreview.includes("Server returned 402 again after payment")) {
    return "payment_replay_or_settlement_failed";
  }
  if (!success) {
    return "execution_failure";
  }
  if (!jsonRpcValid) {
    return "json_rpc_validation_failure";
  }
  return null;
}

function parseJsonObject(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function main(): Promise<void> {
  const trials = getTrials();
  const callDelayMs = getCallDelayMs();
  const selectedMethods = getSelectedMethods();
  const trialMode = getTrialMode();
  const quickNodeMappings = providerEndpointMap.filter(
    (m) =>
      m.providerId === "quicknode-rpc" &&
      (m.endpointMappingId === "quicknode-rpc-health" ||
        m.endpointMappingId === "quicknode-rpc-balance" ||
        m.endpointMappingId === "quicknode-rpc-slot"),
  );

  if (quickNodeMappings.length !== 3) {
    throw new Error("Expected three QuickNode endpoint mappings (health/balance/slot).");
  }

  if (selectedMethods.length === 0) {
    throw new Error("LIVE_RPC_METHODS resolved to zero methods.");
  }

  const selectedMappings = quickNodeMappings.filter((mapping) =>
    selectedMethods.includes(getMethodName(mapping)),
  );
  if (selectedMappings.length === 0) {
    throw new Error(
      `None of LIVE_RPC_METHODS matched QuickNode mappings. methods=${selectedMethods.join(",")}`,
    );
  }
  const perTrialMappings = trialMode === "single" ? [selectedMappings[0]] : selectedMappings;

  const records: RpcCallRecord[] = [];

  console.log("\n=== Live QuickNode RPC Benchmark ===");
  console.log(`Trials: ${trials}`);
  console.log(`Trial mode: ${trialMode}`);
  console.log(`Selected methods: ${selectedMethods.join(", ")}`);
  console.log(`Call delay: ${callDelayMs}ms`);
  console.log(`Calls per trial: ${perTrialMappings.length}`);

  for (let trialId = 1; trialId <= trials; trialId += 1) {
    for (const mapping of perTrialMappings) {
      const methodName = getMethodName(mapping);
      const result = await executeLivePayShCall({
        providerId: mapping.providerId,
        intent: `run ${methodName} via QuickNode Solana RPC`,
        endpointUrl: mapping.url,
        method: mapping.method,
        bodyJson: mapping.body ?? undefined,
        headers: { "Content-Type": "application/json" },
      });

      let jsonRpcValid = false;
      let jsonRpcMethod: string | null = methodName;
      let jsonRpcResultShapeValid = false;
      let slot: number | null = null;
      let apiVersion: string | null = null;
      let validationError: string | null = "response_not_json_object";

      const parsed = parseJsonObject(result.responsePreview);
      if (parsed) {
        const validation = validateJsonRpcResponse(
          mapping.outputShape as JsonRpcOutputShape,
          methodName,
          parsed,
        );
        jsonRpcValid = validation.jsonRpcValid;
        jsonRpcMethod = validation.jsonRpcMethod;
        jsonRpcResultShapeValid = validation.jsonRpcResultShapeValid;
        slot = validation.slot;
        apiVersion = validation.apiVersion;
        validationError = validation.validationError;
      }
      const errorClassification = classifyError(result.stderrPreview ?? "", result.success, jsonRpcValid);

      records.push({
        trialId,
        timestamp: new Date().toISOString(),
        endpointMappingId: mapping.endpointMappingId,
        providerId: mapping.providerId,
        methodName,
        outputShape: mapping.outputShape,
        success: result.success,
        exitCode: result.exitCode ?? null,
        executionMode: result.mode,
        latencyMs: result.latencyMs,
        parsedJsonAvailable: result.parsedJsonAvailable,
        responsePreview: result.responsePreview,
        stderrPreview: result.stderrPreview ?? "",
        endpointUrl: result.endpointUrl ?? null,
        requestMethod: result.requestMethod ?? null,
        requestBodyPreview: result.requestBodyPreview ?? null,
        commandShape: result.commandShape ?? null,
        errorReason: result.errorReason ?? null,
        jsonRpcValid,
        jsonRpcMethod,
        jsonRpcResultShapeValid,
        slot,
        apiVersion,
        validationError,
        errorClassification,
      });

      console.log(
        `[trial ${trialId}/${trials}] mapping=${mapping.endpointMappingId} success=${result.success} jsonRpcValid=${jsonRpcValid}`,
      );

      if (callDelayMs > 0) {
        await sleep(callDelayMs);
      }
    }
  }

  const totalCalls = records.length;
  const successCount = records.filter((r) => r.success).length;
  const jsonRpcValidCount = records.filter((r) => r.jsonRpcValid).length;
  const resultShapeValidCount = records.filter((r) => r.jsonRpcResultShapeValid).length;
  const getHealthOkCount = records.filter((r) => r.methodName === "getHealth" && r.jsonRpcValid).length;
  const getBalanceValidCount = records.filter((r) => r.methodName === "getBalance" && r.jsonRpcValid).length;
  const getSlotValidCount = records.filter((r) => r.methodName === "getSlot" && r.jsonRpcValid).length;
  const paymentReplayOrSettlementFailedCount = records.filter(
    (r) => r.errorClassification === "payment_replay_or_settlement_failed",
  ).length;
  const executionFailureCount = records.filter((r) => r.errorClassification === "execution_failure").length;
  const jsonRpcValidationFailureCount = records.filter(
    (r) => r.errorClassification === "json_rpc_validation_failure",
  ).length;
  const latencies = records
    .map((r) => r.latencyMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const observedSlots = records
    .map((r) => r.slot)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const apiVersions = Array.from(
    new Set(records.map((r) => r.apiVersion).filter((v): v is string => typeof v === "string" && v.length > 0)),
  );

  const summary = {
    totalTrials: trials,
    totalCalls,
    successCount,
    jsonRpcValidCount,
    resultShapeValidCount,
    getHealthOkCount,
    getBalanceValidCount,
    getSlotValidCount,
    paymentReplayOrSettlementFailedCount,
    executionFailureCount,
    jsonRpcValidationFailureCount,
    avgLatencyMs: round(average(latencies), 2),
    medianLatencyMs: round(median(latencies), 2),
    observedSlotMin: observedSlots.length > 0 ? Math.min(...observedSlots) : null,
    observedSlotMax: observedSlots.length > 0 ? Math.max(...observedSlots) : null,
    observedApiVersions: apiVersions,
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const jsonPath = path.join(RESULTS_DIR, "latest.json");
  const csvPath = path.join(RESULTS_DIR, "latest.csv");
  const summaryPath = path.join(RESULTS_DIR, "summary.md");

  const csvHeader = [
    "trialId",
    "timestamp",
    "endpointMappingId",
    "providerId",
    "methodName",
    "outputShape",
    "success",
    "exitCode",
    "executionMode",
    "latencyMs",
    "parsedJsonAvailable",
    "endpointUrl",
    "requestMethod",
    "requestBodyPreview",
    "commandShape",
    "stderrPreview",
    "errorReason",
    "jsonRpcValid",
    "jsonRpcMethod",
    "jsonRpcResultShapeValid",
    "slot",
    "apiVersion",
    "validationError",
    "errorClassification",
    "responsePreview",
  ].join(",");

  const csvRows = records.map((record) =>
    [
      record.trialId,
      record.timestamp,
      record.endpointMappingId,
      record.providerId,
      record.methodName,
      record.outputShape,
      record.success,
      record.exitCode ?? "",
      record.executionMode,
      record.latencyMs ?? "",
      record.parsedJsonAvailable,
      record.endpointUrl ?? "",
      record.requestMethod ?? "",
      record.requestBodyPreview ?? "",
      record.commandShape ?? "",
      record.stderrPreview ?? "",
      record.errorReason ?? "",
      record.jsonRpcValid,
      record.jsonRpcMethod ?? "",
      record.jsonRpcResultShapeValid,
      record.slot ?? "",
      record.apiVersion ?? "",
      record.validationError ?? "",
      record.errorClassification ?? "",
      record.responsePreview,
    ]
      .map((cell) => toCsvCell(cell))
      .join(","),
  );

  const summaryMarkdown = [
    "# Live QuickNode RPC Benchmark Summary",
    "",
    `- total trials: ${summary.totalTrials}`,
    `- total calls: ${summary.totalCalls}`,
    `- success count: ${summary.successCount}`,
    `- JSON-RPC valid count: ${summary.jsonRpcValidCount}`,
    `- result-shape valid count: ${summary.resultShapeValidCount}`,
    `- getHealth ok count: ${summary.getHealthOkCount}`,
    `- getBalance valid count: ${summary.getBalanceValidCount}`,
    `- getSlot valid count: ${summary.getSlotValidCount}`,
    `- payment replay/settlement failed count: ${summary.paymentReplayOrSettlementFailedCount}`,
    `- execution failure count: ${summary.executionFailureCount}`,
    `- JSON-RPC validation failure count: ${summary.jsonRpcValidationFailureCount}`,
    `- avg latency: ${summary.avgLatencyMs}ms`,
    `- median latency: ${summary.medianLatencyMs}ms`,
    `- observed slot min: ${summary.observedSlotMin ?? "n/a"}`,
    `- observed slot max: ${summary.observedSlotMax ?? "n/a"}`,
    `- observed apiVersions: ${summary.observedApiVersions.join(", ") || "none"}`,
    "",
  ].join("\n");

  await writeFile(jsonPath, `${JSON.stringify({ summary, calls: records }, null, 2)}\n`, "utf8");
  await writeFile(csvPath, `${csvHeader}\n${csvRows.join("\n")}\n`, "utf8");
  await writeFile(summaryPath, summaryMarkdown, "utf8");

  console.log("\nResults written:");
  console.log(`- ${jsonPath}`);
  console.log(`- ${csvPath}`);
  console.log(`- ${summaryPath}`);
}

main().catch((error) => {
  console.error("benchmark:live-rpc failed", error);
  process.exitCode = 1;
});
