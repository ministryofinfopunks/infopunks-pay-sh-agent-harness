import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { ProviderEndpointStatus } from "./providerEndpointMap";
import { LivePayShExecutionResult } from "./types";

type RecommendedProviderStatus = ProviderEndpointStatus | "settlement_failed" | "failed";

interface VerificationConfig {
  providerId: string;
  endpointMappingId: string;
  label: string;
  endpointUrl: string;
  method: string;
  bodyJson: unknown | undefined;
  outputShape: string;
  category: string;
  capabilities: string[];
}

interface VerificationArtifact {
  timestamp: string;
  inputConfig: VerificationConfig;
  executionResult: LivePayShExecutionResult;
  recommendedStatus: RecommendedProviderStatus;
  recommendedMappingSnippet: string;
}

const RESULTS_DIR = path.resolve(process.cwd(), "verification-results");

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function parseBodyJson(rawBody: string | undefined): unknown | undefined {
  if (!rawBody) {
    return undefined;
  }
  try {
    return JSON.parse(rawBody) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown JSON parse error";
    throw new Error(`VERIFY_BODY_JSON must be valid JSON: ${message}`);
  }
}

function parseCapabilities(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function getVerificationConfig(): VerificationConfig {
  const providerId = getEnv("VERIFY_PROVIDER_ID");
  const endpointUrl = getEnv("VERIFY_ENDPOINT_URL");
  if (!providerId) {
    throw new Error("Missing required VERIFY_PROVIDER_ID");
  }
  if (!endpointUrl) {
    throw new Error("Missing required VERIFY_ENDPOINT_URL");
  }

  const bodyRaw = getEnv("VERIFY_BODY_JSON");
  const bodyJson = parseBodyJson(bodyRaw);

  return {
    providerId,
    endpointMappingId: getEnv("VERIFY_ENDPOINT_MAPPING_ID") ?? "manual-verification",
    label: getEnv("VERIFY_LABEL") ?? providerId,
    endpointUrl,
    method: getEnv("VERIFY_METHOD") ?? "GET",
    bodyJson,
    outputShape: getEnv("VERIFY_OUTPUT_SHAPE") ?? "unknown",
    category: getEnv("VERIFY_CATEGORY") ?? "unknown",
    capabilities: parseCapabilities(getEnv("VERIFY_CAPABILITIES") ?? ""),
  };
}

function includesText(value: string | undefined, needle: string): boolean {
  return (value ?? "").toLowerCase().includes(needle.toLowerCase());
}

function recommendProviderStatus(
  result: LivePayShExecutionResult,
): RecommendedProviderStatus {
  if (result.success === true && result.parsedJsonAvailable === true) {
    return "verified_pay_cli_success";
  }
  if (result.paymentRequired === true || result.statusCode === 402) {
    return "verified_402";
  }
  if (
    includesText(result.responsePreview, "Settlement failed") ||
    includesText(result.stderrPreview, "Settlement failed")
  ) {
    return "settlement_failed";
  }
  if (includesText(result.stderrPreview, "Server returned 402 again after payment")) {
    return "intermittent_pay_cli_success";
  }
  return "failed";
}

function buildNotes(recommendedStatus: RecommendedProviderStatus): string {
  if (recommendedStatus === "verified_pay_cli_success") {
    return "Verified via pay-cli execution with successful JSON response.";
  }
  if (recommendedStatus === "settlement_failed") {
    return "x402 challenge verified; paid execution returned Settlement failed.";
  }
  if (recommendedStatus === "intermittent_pay_cli_success") {
    return "Observed 402-after-payment instability in pay-cli execution.";
  }
  if (recommendedStatus === "verified_402") {
    return "Unpaid verification indicates x402 payment challenge.";
  }
  return "Verification failed; keep as unverified until rerun succeeds.";
}

function effectiveMappingStatus(
  recommendedStatus: RecommendedProviderStatus,
): ProviderEndpointStatus {
  if (recommendedStatus === "settlement_failed") {
    return "verified_402";
  }
  if (recommendedStatus === "failed") {
    return "unverified";
  }
  return recommendedStatus;
}

function toSingleQuoted(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function buildMappingSnippet(
  config: VerificationConfig,
  recommendedStatus: RecommendedProviderStatus,
): string {
  const status = effectiveMappingStatus(recommendedStatus);
  const methodUpper = config.method.toUpperCase();
  const bodyString = config.bodyJson === undefined ? "null" : JSON.stringify(config.bodyJson, null, 2);
  const notes = buildNotes(recommendedStatus);
  const source = status === "verified_402" ? "manual_402_verification" : "manual_pay_cli_verification";
  const capabilities = `[${config.capabilities.map(toSingleQuoted).join(", ")}]`;

  return `{
  endpointMappingId: ${toSingleQuoted(config.endpointMappingId)},
  providerId: ${toSingleQuoted(config.providerId)},
  label: ${toSingleQuoted(config.label)},
  url: ${toSingleQuoted(config.endpointUrl)},
  method: ${toSingleQuoted(methodUpper)},
  body: ${bodyString},
  category: ${toSingleQuoted(config.category)},
  capabilities: ${capabilities},
  outputShape: ${toSingleQuoted(config.outputShape)},
  status: ${toSingleQuoted(status)},
  endpointMappingSource: ${toSingleQuoted(source)},
  notes: ${toSingleQuoted(notes)},
}`;
}

function summarizeExecutionMode(): string {
  return getEnv("PAYSH_EXECUTION_MODE") ?? "http";
}

function printReport(
  config: VerificationConfig,
  result: LivePayShExecutionResult,
  recommendedStatus: RecommendedProviderStatus,
  recommendedMappingSnippet: string,
): void {
  console.log("Provider verification report");
  console.log(`- providerId: ${config.providerId}`);
  console.log(`- endpointMappingId: ${config.endpointMappingId}`);
  console.log(`- label: ${config.label}`);
  console.log(`- endpoint: ${config.endpointUrl}`);
  console.log(`- method: ${config.method.toUpperCase()}`);
  console.log(`- category: ${config.category}`);
  console.log(`- capabilities: ${config.capabilities.join(",")}`);
  console.log(`- outputShape: ${config.outputShape}`);
  console.log(`- executionMode: ${summarizeExecutionMode()}`);
  console.log(`- exitCode: ${result.exitCode ?? "n/a"}`);
  console.log(`- success: ${result.success}`);
  console.log(`- parsedJsonAvailable: ${result.parsedJsonAvailable}`);
  console.log(`- statusCode: ${result.statusCode ?? "n/a"}`);
  console.log(`- paymentRequired: ${result.paymentRequired ?? "n/a"}`);
  console.log(`- paymentRequiredHeaderPresent: ${result.paymentRequiredHeaderPresent ?? "n/a"}`);
  console.log(`- stderrPreview: ${result.stderrPreview ?? ""}`);
  console.log(`- responsePreview: ${result.responsePreview}`);
  console.log(`- commandShape: ${result.commandShape ?? "n/a"}`);
  console.log(`- recommendedStatus: ${recommendedStatus}`);
  console.log("recommendedMappingSnippet");
  console.log(recommendedMappingSnippet);
}

function buildMarkdownReport(artifact: VerificationArtifact): string {
  const lines = [
    "# Provider verification report",
    "",
    `- timestamp: ${artifact.timestamp}`,
    `- providerId: ${artifact.inputConfig.providerId}`,
    `- endpointMappingId: ${artifact.inputConfig.endpointMappingId}`,
    `- label: ${artifact.inputConfig.label}`,
    `- endpoint: ${artifact.inputConfig.endpointUrl}`,
    `- method: ${artifact.inputConfig.method.toUpperCase()}`,
    `- category: ${artifact.inputConfig.category}`,
    `- capabilities: ${artifact.inputConfig.capabilities.join(",")}`,
    `- outputShape: ${artifact.inputConfig.outputShape}`,
    `- executionMode: ${summarizeExecutionMode()}`,
    `- exitCode: ${artifact.executionResult.exitCode ?? "n/a"}`,
    `- success: ${artifact.executionResult.success}`,
    `- parsedJsonAvailable: ${artifact.executionResult.parsedJsonAvailable}`,
    `- statusCode: ${artifact.executionResult.statusCode ?? "n/a"}`,
    `- paymentRequired: ${artifact.executionResult.paymentRequired ?? "n/a"}`,
    `- paymentRequiredHeaderPresent: ${artifact.executionResult.paymentRequiredHeaderPresent ?? "n/a"}`,
    `- stderrPreview: ${artifact.executionResult.stderrPreview ?? ""}`,
    `- responsePreview: ${artifact.executionResult.responsePreview}`,
    `- commandShape: ${artifact.executionResult.commandShape ?? "n/a"}`,
    `- recommendedStatus: ${artifact.recommendedStatus}`,
    "",
    "## recommendedMappingSnippet",
    "```ts",
    artifact.recommendedMappingSnippet,
    "```",
    "",
    "## input config",
    "```json",
    JSON.stringify(artifact.inputConfig, null, 2),
    "```",
    "",
    "## execution result",
    "```json",
    JSON.stringify(artifact.executionResult, null, 2),
    "```",
  ];
  return `${lines.join("\n")}\n`;
}

async function writeArtifacts(artifact: VerificationArtifact): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const jsonPath = path.join(RESULTS_DIR, "latest.json");
  const mdPath = path.join(RESULTS_DIR, "latest.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, buildMarkdownReport(artifact), "utf8");
}

async function main(): Promise<void> {
  const config = getVerificationConfig();
  if (getEnv("LIVE_PAYSH_EXECUTION") !== "true") {
    console.log("Skipping live verification because LIVE_PAYSH_EXECUTION is not set to true.");
    console.log(
      "Recommended command: PAYSH_EXECUTION_MODE=pay_cli LIVE_PAYSH_EXECUTION=true VERIFY_PROVIDER_ID=<provider-id> VERIFY_ENDPOINT_URL=<endpoint-url> npm run verify:mapping",
    );
  }

  const hasBody = config.bodyJson !== undefined;
  const execution = await executeLivePayShCall({
    providerId: config.providerId,
    intent: `verify provider mapping: ${config.label}`,
    endpointUrl: config.endpointUrl,
    method: config.method,
    bodyJson: config.bodyJson,
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
  });

  const recommendedStatus = recommendProviderStatus(execution);
  const recommendedMappingSnippet = buildMappingSnippet(config, recommendedStatus);
  printReport(config, execution, recommendedStatus, recommendedMappingSnippet);

  const artifact: VerificationArtifact = {
    timestamp: new Date().toISOString(),
    inputConfig: config,
    executionResult: execution,
    recommendedStatus,
    recommendedMappingSnippet,
  };
  await writeArtifacts(artifact);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`verify:mapping failed: ${message}`);
  process.exitCode = 1;
});
