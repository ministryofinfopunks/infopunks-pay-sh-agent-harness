import { LivePayShExecutionResult } from "./types";
import { spawn } from "node:child_process";

export interface ExecuteLivePayShCallInput {
  providerId: string;
  intent: string;
  endpointUrl?: string;
  method?: string;
  body?: unknown;
  bodyJson?: unknown;
  headers?: Record<string, string>;
}

const DEFAULT_METHOD = "GET";
const PREVIEW_MAX_LENGTH = 1000;
const DEFAULT_EXECUTION_MODE = "http";

type PayShExecutionMode = "http" | "pay_cli";

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function nowIso(ms: number): string {
  return new Date(ms).toISOString();
}

function withSkippedResult(
  input: ExecuteLivePayShCallInput,
  startedAtMs: number,
  errorReason: "live_pay_sh_execution_disabled" | "missing_live_pay_sh_execution_config" | "pay_cli_missing",
): LivePayShExecutionResult {
  const completedMs = Date.now();
  return {
    providerId: input.providerId,
    intent: input.intent,
    endpointUrl: input.endpointUrl,
    startedAt: nowIso(startedAtMs),
    completedAt: nowIso(completedMs),
    latencyMs: completedMs - startedAtMs,
    success: false,
    costUsd: null,
    settlementReference: null,
    responsePreview: "",
    requestMethod: input.method?.trim() || undefined,
    requestBodyPreview: input.body !== undefined || input.bodyJson !== undefined
      ? sanitizePreview(JSON.stringify(input.body ?? input.bodyJson))
      : undefined,
    parsedJsonAvailable: false,
    errorReason,
    mode: "skipped",
  };
}

function sanitizePreview(input: string): string {
  if (input.length <= PREVIEW_MAX_LENGTH) {
    return input;
  }
  return input.slice(0, PREVIEW_MAX_LENGTH);
}

function getConfiguredEndpointUrl(input: ExecuteLivePayShCallInput): string | undefined {
  return input.endpointUrl?.trim() || getEnv("PAYSH_EXECUTION_URL");
}

function resolveExecutionMode(): PayShExecutionMode {
  const raw = getEnv("PAYSH_EXECUTION_MODE")?.toLowerCase();
  if (raw === "pay_cli") {
    return "pay_cli";
  }
  return DEFAULT_EXECUTION_MODE;
}

function resolveMethod(input: ExecuteLivePayShCallInput): string {
  const explicit = input.method?.trim();
  return explicit || getEnv("PAYSH_EXECUTION_METHOD") || DEFAULT_METHOD;
}

function parseJsonFromEnv<T>(name: string): T | undefined {
  const raw = getEnv(name);
  if (!raw) {
    return undefined;
  }

  const parsed = JSON.parse(raw) as unknown;
  return parsed as T;
}

function buildHeaders(input: ExecuteLivePayShCallInput, includeDefaultAccept: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  const envHeaders = parseJsonFromEnv<Record<string, unknown>>("PAYSH_EXECUTION_HEADERS_JSON");
  if (envHeaders && typeof envHeaders === "object") {
    for (const [key, value] of Object.entries(envHeaders)) {
      if (typeof value === "string") {
        headers[key] = value;
      } else if (value !== null && value !== undefined) {
        headers[key] = String(value);
      }
    }
  }
  for (const [key, value] of Object.entries(input.headers ?? {})) {
    headers[key] = value;
  }

  const authHeader = getEnv("PAYSH_AUTH_HEADER");
  const authValue = getEnv("PAYSH_AUTH_VALUE");
  if (authHeader && authValue) {
    headers[authHeader] = authValue;
  }

  if (includeDefaultAccept && !Object.keys(headers).some((key) => key.toLowerCase() === "accept")) {
    headers.Accept = "application/json, text/plain;q=0.9, */*;q=0.8";
  }

  return headers;
}

function resolveBody(input: ExecuteLivePayShCallInput): unknown {
  if (input.body !== undefined) {
    return input.body;
  }
  if (input.bodyJson !== undefined) {
    return input.bodyJson;
  }
  return parseJsonFromEnv<unknown>("PAYSH_EXECUTION_BODY_JSON");
}

function attachBodyIfNeeded(method: string, body: unknown, headers: Record<string, string>): BodyInit | undefined {
  if (body === undefined || method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD") {
    return undefined;
  }

  if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  const contentTypeKey = Object.keys(headers).find((key) => key.toLowerCase() === "content-type");
  const contentType = contentTypeKey ? headers[contentTypeKey] : "";

  if (typeof body === "string") {
    return body;
  }

  if (contentType.toLowerCase().includes("application/json")) {
    return JSON.stringify(body);
  }

  return String(body);
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStringArray(values: unknown[]): string[] {
  return values
    .map((value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
      return null;
    })
    .filter((value): value is string => value !== null);
}

function decodeBase64ToUtf8(value: string): string | null {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function parsePaymentChallengeFromHeader(rawHeader: string | null): LivePayShExecutionResult["paymentChallenge"] {
  if (!rawHeader) {
    return undefined;
  }

  const decoded = decodeBase64ToUtf8(rawHeader);
  if (!decoded) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }

  const challenge = parsed as Record<string, unknown>;
  const resource =
    typeof challenge.resource === "object" && challenge.resource !== null
      ? (challenge.resource as Record<string, unknown>)
      : null;
  const accepts = Array.isArray(challenge.accepts) ? challenge.accepts : [];

  const networks = toStringArray(
    accepts.map((entry) =>
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).network : undefined,
    ),
  );
  const assets = toStringArray(
    accepts.map((entry) =>
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).asset : undefined,
    ),
  );
  const payTo = toStringArray(
    accepts.map((entry) =>
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).payTo : undefined,
    ),
  );
  const amounts = toStringArray(
    accepts.map((entry) =>
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>).amount : undefined,
    ),
  );

  const bazaarExtensionPresent =
    (typeof challenge.extensions === "object" &&
      challenge.extensions !== null &&
      Object.prototype.hasOwnProperty.call(challenge.extensions, "bazaar")) ||
    Object.prototype.hasOwnProperty.call(challenge, "bazaar");

  const x402Version = toNumberOrNull(challenge.x402Version) ?? undefined;
  const resourceUrl = toStringOrNull(resource?.url) ?? undefined;
  const resourceMethod = toStringOrNull(resource?.method) ?? undefined;
  const resourceDescription = toStringOrNull(resource?.description) ?? undefined;
  const acceptsCount = accepts.length > 0 ? accepts.length : undefined;

  return {
    x402Version,
    resourceUrl,
    resourceMethod,
    resourceDescription,
    acceptsCount,
    networks: networks.length > 0 ? Array.from(new Set(networks)) : undefined,
    assets: assets.length > 0 ? Array.from(new Set(assets)) : undefined,
    payTo: payTo.length > 0 ? Array.from(new Set(payTo)) : undefined,
    amounts: amounts.length > 0 ? Array.from(new Set(amounts)) : undefined,
    bazaarExtensionPresent,
  };
}

export async function executeLivePayShCall(
  input: ExecuteLivePayShCallInput,
): Promise<LivePayShExecutionResult> {
  const startedAtMs = Date.now();

  if (getEnv("LIVE_PAYSH_EXECUTION") !== "true") {
    return withSkippedResult(input, startedAtMs, "live_pay_sh_execution_disabled");
  }

  const endpointUrl = getConfiguredEndpointUrl(input);
  if (!endpointUrl) {
    return withSkippedResult(input, startedAtMs, "missing_live_pay_sh_execution_config");
  }

  const executionMode = resolveExecutionMode();
  const method = resolveMethod(input);
  const headers = buildHeaders(input, executionMode !== "pay_cli");
  const body = resolveBody(input);

  if (executionMode === "pay_cli") {
    return executeViaPayCli({ input, endpointUrl, method, headers, body, startedAtMs });
  }

  try {
    const requestBody = attachBodyIfNeeded(method, body, headers);
    const requestBodyPreview = getRequestBodyPreview(requestBody);
    const response = await fetch(endpointUrl, {
      method,
      headers,
      body: requestBody,
    });
    const paymentRequiredHeaderValue = response.headers.get("Payment-Required");
    const paymentRequiredHeaderPresent = paymentRequiredHeaderValue !== null;
    const wwwAuthenticateHeaderPresent = response.headers.get("WWW-Authenticate") !== null;
    const paymentChallenge = parsePaymentChallengeFromHeader(paymentRequiredHeaderValue);

    const completedMs = Date.now();
    const rawBody = await response.text();
    const responsePreview = sanitizePreview(rawBody);

    let parsedJsonAvailable = false;
    let parsedJson: Record<string, unknown> | null = null;

    try {
      const maybeJson = JSON.parse(rawBody) as unknown;
      if (typeof maybeJson === "object" && maybeJson !== null) {
        parsedJsonAvailable = true;
        parsedJson = maybeJson as Record<string, unknown>;
      }
    } catch {
      parsedJsonAvailable = false;
    }

    return {
      providerId: input.providerId,
      intent: input.intent,
      endpointUrl,
      startedAt: nowIso(startedAtMs),
      completedAt: nowIso(completedMs),
      latencyMs: completedMs - startedAtMs,
      success: response.ok,
      statusCode: response.status,
      costUsd: toNumberOrNull(parsedJson?.costUsd),
      settlementReference: toStringOrNull(parsedJson?.settlementReference),
      responsePreview,
      requestMethod: method.toUpperCase(),
      requestBodyPreview,
      parsedJsonAvailable,
      errorReason: response.ok ? undefined : response.status === 402 ? "payment_required" : `http_${response.status}`,
      paymentRequired: response.status === 402,
      paymentRequiredHeaderPresent,
      wwwAuthenticateHeaderPresent,
      paymentChallenge,
      mode: "live_pay_sh",
    };
  } catch (error) {
    const completedMs = Date.now();
    const requestBody = attachBodyIfNeeded(method, body, headers);
    return {
      providerId: input.providerId,
      intent: input.intent,
      endpointUrl,
      startedAt: nowIso(startedAtMs),
      completedAt: nowIso(completedMs),
      latencyMs: completedMs - startedAtMs,
      success: false,
      costUsd: null,
      settlementReference: null,
      responsePreview: "",
      requestMethod: method.toUpperCase(),
      requestBodyPreview: getRequestBodyPreview(requestBody),
      parsedJsonAvailable: false,
      errorReason: error instanceof Error ? error.message : "live_pay_sh_execution_failed",
      mode: "live_pay_sh",
    };
  }
}

interface ExecuteViaPayCliInput {
  input: ExecuteLivePayShCallInput;
  endpointUrl: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  startedAtMs: number;
}

function getRequestBodyPreview(bodyString: BodyInit | undefined): string | undefined {
  if (typeof bodyString !== "string") {
    return undefined;
  }
  return sanitizePreview(bodyString);
}

function buildPayCliCommandShape(endpointUrl: string, method: string, bodyString: BodyInit | undefined): string {
  const base = `pay curl ${quoteForShell(endpointUrl)} -X ${method.toUpperCase()} -H "Content-Type: application/json"`;
  if (typeof bodyString === "string") {
    return `${base} -d ${quoteForShell(bodyString)}`;
  }
  return base;
}

function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function runCommand(
  command: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function hasPayCli(): Promise<boolean> {
  try {
    const result = await runCommand("pay", ["--version"]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function executeViaPayCli({
  input,
  endpointUrl,
  method,
  headers,
  body,
  startedAtMs,
}: ExecuteViaPayCliInput): Promise<LivePayShExecutionResult> {
  const payExists = await hasPayCli();
  if (!payExists) {
    return withSkippedResult(input, startedAtMs, "pay_cli_missing");
  }

  const args: string[] = ["curl", endpointUrl];
  const bodyString = attachBodyIfNeeded(method, body, headers);
  args.push("-X", method.toUpperCase());
  // Keep CLI arguments deterministic for parity with the manually successful invocation.
  if (Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    args.push("-H", "Content-Type: application/json");
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "content-type") {
      continue;
    }
    args.push("-H", `${key}: ${value}`);
  }
  if (typeof bodyString === "string") {
    args.push("-d", bodyString);
  }
  const commandShape = buildPayCliCommandShape(endpointUrl, method, bodyString);
  const requestBodyPreview = getRequestBodyPreview(bodyString);

  try {
    const result = await runCommand("pay", args);
    const completedMs = Date.now();
    const stdoutPreview = sanitizePreview(result.stdout);
    const stderrPreview = sanitizePreview(result.stderr);

    let parsedJsonAvailable = false;
    try {
      JSON.parse(result.stdout);
      parsedJsonAvailable = true;
    } catch {
      parsedJsonAvailable = false;
    }

    return {
      providerId: input.providerId,
      intent: input.intent,
      endpointUrl,
      startedAt: nowIso(startedAtMs),
      completedAt: nowIso(completedMs),
      latencyMs: completedMs - startedAtMs,
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      costUsd: null,
      settlementReference: null,
      responsePreview: stdoutPreview,
      stderrPreview,
      commandShape,
      requestMethod: method.toUpperCase(),
      requestBodyPreview,
      parsedJsonAvailable,
      errorReason: result.exitCode === 0 ? undefined : "pay_cli_execution_failed",
      mode: "live_pay_sh_cli",
    };
  } catch (error) {
    const completedMs = Date.now();
    return {
      providerId: input.providerId,
      intent: input.intent,
      endpointUrl,
      startedAt: nowIso(startedAtMs),
      completedAt: nowIso(completedMs),
      latencyMs: completedMs - startedAtMs,
      success: false,
      exitCode: 1,
      costUsd: null,
      settlementReference: null,
      responsePreview: "",
      stderrPreview: error instanceof Error ? sanitizePreview(error.message) : "",
      commandShape,
      requestMethod: method.toUpperCase(),
      requestBodyPreview,
      parsedJsonAvailable: false,
      errorReason: error instanceof Error ? error.message : "pay_cli_execution_failed",
      mode: "live_pay_sh_cli",
    };
  }
}

export function isLivePayShExecutionConfigured(): boolean {
  return getEnv("LIVE_PAYSH_EXECUTION") === "true" && Boolean(getEnv("PAYSH_EXECUTION_URL"));
}
