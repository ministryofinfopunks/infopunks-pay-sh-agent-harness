import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { executeLivePayShCall } from "./livePayShExecutor";
import { ProviderEndpointStatus } from "./providerEndpointMap";
import { LivePayShExecutionResult } from "./types";

export type RecommendedProviderStatus =
  | ProviderEndpointStatus
  | "settlement_failed"
  | "failed"
  | "rejected"
  | "needs_endpoint_fix";

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
  applicationSuccess: boolean;
  applicationErrorReason?: string;
  recommendedStatus: RecommendedProviderStatus;
  recommendedMappingSnippet?: string;
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

interface ApplicationEvaluation {
  applicationSuccess: boolean;
  applicationErrorReason?: string;
}

function parseResponseJson(result: LivePayShExecutionResult): Record<string, unknown> | null {
  if (!result.parsedJsonAvailable) {
    return null;
  }
  try {
    const parsed = JSON.parse(result.responsePreview) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function hasStatusError(payload: Record<string, unknown>): string | null {
  const status = payload.status;
  if (typeof status === "string") {
    const upper = status.toUpperCase();
    if (["INVALID_ARGUMENT", "NOT_FOUND", "PERMISSION_DENIED", "UNAUTHENTICATED"].includes(upper)) {
      return `status=${upper}`;
    }
  }
  return null;
}

function hasMessageError(payload: Record<string, unknown>): string | null {
  const error = payload.error;
  const topMessage = payload.message;
  const candidates: string[] = [];
  if (typeof topMessage === "string") {
    candidates.push(topMessage);
  }
  if (typeof error === "string") {
    candidates.push(error);
  }
  if (typeof error === "object" && error !== null) {
    const nested = error as Record<string, unknown>;
    if (typeof nested.message === "string") {
      candidates.push(nested.message);
    }
    if (typeof nested.status === "string") {
      candidates.push(nested.status);
    }
  }
  const needles = [
    "Endpoint not found",
    "not registered",
    "FieldMask is a required parameter",
    "INVALID_ARGUMENT",
  ];
  const hit = candidates.find((message) => needles.some((needle) => includesText(message, needle)));
  return hit ? `message=${hit}` : null;
}

function detectApplicationError(payload: Record<string, unknown>): string | null {
  const error = payload.error;
  if (typeof error === "string") {
    return `error=${error}`;
  }
  if (typeof error === "object" && error !== null) {
    const nested = error as Record<string, unknown>;
    if (typeof nested.message === "string") {
      return `error.message=${nested.message}`;
    }
    if (typeof nested.code === "number" || typeof nested.code === "string") {
      return `error.code=${String(nested.code)}`;
    }
    return "error object present";
  }
  const statusReason = hasStatusError(payload);
  if (statusReason) {
    return statusReason;
  }
  const messageReason = hasMessageError(payload);
  if (messageReason) {
    return messageReason;
  }
  return null;
}

function hasOutputShape(payload: Record<string, unknown>, outputShape: string): boolean {
  if (outputShape === "image_labels") {
    const responses = payload.responses;
    if (!Array.isArray(responses) || responses.length === 0) {
      return false;
    }
    const first = responses[0] as Record<string, unknown> | undefined;
    return Boolean(first && Array.isArray(first.labelAnnotations));
  }
  if (outputShape === "places_search") {
    return Array.isArray(payload.places);
  }
  if (outputShape === "research_answer") {
    return (
      typeof payload.answer === "string" ||
      Array.isArray(payload.results) ||
      typeof payload.research_answer === "string" ||
      typeof payload.cited_answer === "string"
    );
  }
  if (outputShape === "agent_inbox") {
    if (Array.isArray(payload.inboxes)) {
      return true;
    }
    const inbox = payload.inbox;
    if (typeof inbox === "object" && inbox !== null) {
      const obj = inbox as Record<string, unknown>;
      return typeof obj.id === "string" || typeof obj.address === "string";
    }
    return false;
  }
  if (outputShape === "sms_send_result") {
    return (
      typeof payload.success === "boolean" ||
      typeof payload.textId === "string" ||
      typeof payload.status === "string"
    );
  }
  return true;
}

export function evaluateApplicationResult(
  result: LivePayShExecutionResult,
  outputShape: string,
): ApplicationEvaluation {
  const parsed = parseResponseJson(result);
  if (!parsed) {
    return {
      applicationSuccess: false,
      applicationErrorReason: "parsed_json_unavailable_for_application_evaluation",
    };
  }
  const appError = detectApplicationError(parsed);
  if (appError) {
    return { applicationSuccess: false, applicationErrorReason: appError };
  }
  if (!hasOutputShape(parsed, outputShape)) {
    return {
      applicationSuccess: false,
      applicationErrorReason: `output_shape_validation_failed:${outputShape}`,
    };
  }
  return { applicationSuccess: true };
}

export function recommendProviderStatus(
  result: LivePayShExecutionResult,
  outputShape: string,
): RecommendedProviderStatus {
  const appEval = evaluateApplicationResult(result, outputShape);
  if (
    result.success === true &&
    result.parsedJsonAvailable === true &&
    appEval.applicationSuccess === true
  ) {
    return "verified_pay_cli_success";
  }
  if (
    result.success === true &&
    result.parsedJsonAvailable === true &&
    appEval.applicationSuccess === false
  ) {
    if (includesText(appEval.applicationErrorReason, "output_shape_validation_failed")) {
      return "needs_endpoint_fix";
    }
    return "rejected";
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
  if (recommendedStatus === "rejected") {
    return "Pay-cli returned JSON, but response indicates an application-level error.";
  }
  if (recommendedStatus === "needs_endpoint_fix") {
    return "Pay-cli returned JSON, but output shape validation failed for this endpoint.";
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
  if (recommendedStatus === "rejected" || recommendedStatus === "needs_endpoint_fix") {
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
  applicationEvaluation: ApplicationEvaluation,
  recommendedStatus: RecommendedProviderStatus,
  recommendedMappingSnippet?: string,
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
  console.log(`- applicationSuccess: ${applicationEvaluation.applicationSuccess}`);
  console.log(`- applicationErrorReason: ${applicationEvaluation.applicationErrorReason ?? "n/a"}`);
  console.log(`- recommendedStatus: ${recommendedStatus}`);
  if (recommendedMappingSnippet) {
    console.log("recommendedMappingSnippet");
    console.log(recommendedMappingSnippet);
  } else {
    console.log("recommendedMappingSnippet");
    console.log("not emitted");
  }
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
    `- applicationSuccess: ${artifact.applicationSuccess}`,
    `- applicationErrorReason: ${artifact.applicationErrorReason ?? "n/a"}`,
    `- recommendedStatus: ${artifact.recommendedStatus}`,
    "",
    "## recommendedMappingSnippet",
    "```ts",
    artifact.recommendedMappingSnippet ?? "not emitted",
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

  const applicationEvaluation = evaluateApplicationResult(execution, config.outputShape);
  const recommendedStatus = recommendProviderStatus(execution, config.outputShape);
  const recommendedMappingSnippet = recommendedStatus === "verified_pay_cli_success"
    ? buildMappingSnippet(config, recommendedStatus)
    : undefined;
  printReport(config, execution, applicationEvaluation, recommendedStatus, recommendedMappingSnippet);

  const artifact: VerificationArtifact = {
    timestamp: new Date().toISOString(),
    inputConfig: config,
    executionResult: execution,
    applicationSuccess: applicationEvaluation.applicationSuccess,
    applicationErrorReason: applicationEvaluation.applicationErrorReason,
    recommendedStatus,
    recommendedMappingSnippet,
  };
  await writeArtifacts(artifact);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`verify:mapping failed: ${message}`);
    process.exitCode = 1;
  });
}
