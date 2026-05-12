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

  const method = resolveMethod(input);
  const headers = buildHeaders(input);

  try {
    const requestBody = attachBodyIfNeeded(method, input.body, headers);
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

export function isLivePayShExecutionConfigured(): boolean {
  return getEnv("LIVE_PAYSH_EXECUTION") === "true" && Boolean(getEnv("PAYSH_EXECUTION_URL"));
}
