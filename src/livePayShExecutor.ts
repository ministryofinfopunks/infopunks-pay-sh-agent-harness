import { LivePayShExecutionResult } from "./types";

export interface ExecuteLivePayShCallInput {
  providerId: string;
  intent: string;
  endpointUrl?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

const DEFAULT_METHOD = "GET";
const PREVIEW_MAX_LENGTH = 1000;

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
  errorReason: "live_pay_sh_execution_disabled" | "missing_live_pay_sh_execution_config",
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

function resolveMethod(input: ExecuteLivePayShCallInput): string {
  const explicit = input.method?.trim();
  return explicit || getEnv("PAYSH_EXECUTION_METHOD") || DEFAULT_METHOD;
}

function buildHeaders(input: ExecuteLivePayShCallInput): Record<string, string> {
  const headers: Record<string, string> = { ...(input.headers ?? {}) };

  const authHeader = getEnv("PAYSH_AUTH_HEADER");
  const authValue = getEnv("PAYSH_AUTH_VALUE");
  if (authHeader && authValue) {
    headers[authHeader] = authValue;
  }

  if (!Object.keys(headers).some((key) => key.toLowerCase() === "accept")) {
    headers.Accept = "application/json, text/plain;q=0.9, */*;q=0.8";
  }

  return headers;
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

  const method = resolveMethod(input);
  const headers = buildHeaders(input);

  try {
    const requestBody = attachBodyIfNeeded(method, input.body, headers);
    const response = await fetch(endpointUrl, {
      method,
      headers,
      body: requestBody,
    });

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
      parsedJsonAvailable,
      errorReason: response.ok ? undefined : `http_${response.status}`,
      mode: "live_pay_sh",
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
      costUsd: null,
      settlementReference: null,
      responsePreview: "",
      parsedJsonAvailable: false,
      errorReason: error instanceof Error ? error.message : "live_pay_sh_execution_failed",
      mode: "live_pay_sh",
    };
  }
}
