import { readFile } from "node:fs/promises";
import path from "node:path";

export type SideEffectLevel = "none" | "read_only" | "sends_message" | "writes_data" | "spends_extra";

export interface ProviderIntake {
  provider: {
    providerId: string;
    normalizedProviderId: string;
    name: string;
    category: string;
    serviceUrl: string;
    source: string;
    notes: string;
  };
  route: {
    endpointMappingId: string;
    label: string;
    endpointUrl: string;
    method: string;
    headers?: Record<string, string>;
    body: unknown;
    outputShape: string;
    capabilities: string[];
  };
  safety: {
    sideEffectLevel: SideEffectLevel;
    requiresOwnPhoneNumber: boolean;
    requiresSecrets: boolean;
    safeForDefaultExecution: boolean;
    notes: string;
  };
  verification: {
    unpaid402Observed: boolean;
    payCliSuccess: boolean;
    parsedJsonAvailable: boolean;
    applicationSuccess: boolean;
    recommendedStatus:
      | "candidate_pending"
      | "verified_402"
      | "verified_pay_cli_success"
      | "intermittent_pay_cli_success"
      | "rejected"
      | "needs_endpoint_fix"
      | "settlement_failed";
    evidencePath: string;
    verifiedAt: string;
  };
  promotionRules: string[];
}

const REQUIRED_FIELDS = [
  "provider.providerId",
  "provider.category",
  "route.endpointMappingId",
  "route.label",
  "route.endpointUrl",
  "route.method",
  "route.outputShape",
  "route.capabilities",
] as const;

function getPathValue(input: Record<string, unknown>, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((acc, key) => {
    if (typeof acc !== "object" || acc === null) {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, input);
}

export function validateProviderIntake(input: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = getPathValue(input, field);
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      missing.push(field);
    }
  }
  return missing;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function parseIntakeJson(content: string): ProviderIntake {
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const missing = validateProviderIntake(parsed);
  if (missing.length > 0) {
    throw new Error(`Missing required intake fields: ${missing.join(", ")}`);
  }
  return parsed as unknown as ProviderIntake;
}

export async function readIntakeFile(filePath: string): Promise<ProviderIntake> {
  const resolved = path.resolve(process.cwd(), filePath);
  const raw = await readFile(resolved, "utf8");
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".yaml" || extension === ".yml") {
    throw new Error(
      "YAML intake parsing is not enabled to keep this dependency-light. Use JSON (provider-intake.example.json) instead.",
    );
  }
  return parseIntakeJson(raw);
}

export function sideEffectWarnings(intake: ProviderIntake): string[] {
  const level = intake.safety.sideEffectLevel;
  if (level === "sends_message" || level === "writes_data") {
    return [
      `WARNING: sideEffectLevel=${level}. Do not execute this route by default; require explicit operator intent.`,
    ];
  }
  return [];
}

export function buildVerifyMappingCommand(intake: ProviderIntake): string {
  const bodyJson = JSON.stringify(intake.route.body ?? {});
  const parts = [
    "PAYSH_EXECUTION_MODE=pay_cli",
    "LIVE_PAYSH_EXECUTION=true",
    `VERIFY_PROVIDER_ID=${shellQuote(intake.provider.providerId)}`,
    `VERIFY_ENDPOINT_MAPPING_ID=${shellQuote(intake.route.endpointMappingId)}`,
    `VERIFY_LABEL=${shellQuote(intake.route.label)}`,
    `VERIFY_ENDPOINT_URL=${shellQuote(intake.route.endpointUrl)}`,
    `VERIFY_METHOD=${shellQuote(intake.route.method.toUpperCase())}`,
    `VERIFY_BODY_JSON=${shellQuote(bodyJson)}`,
    `VERIFY_CATEGORY=${shellQuote(intake.provider.category)}`,
    `VERIFY_CAPABILITIES=${shellQuote(intake.route.capabilities.join(","))}`,
    `VERIFY_OUTPUT_SHAPE=${shellQuote(intake.route.outputShape)}`,
  ];

  if (intake.route.headers && Object.keys(intake.route.headers).length > 0) {
    parts.push(`VERIFY_HEADERS_JSON=${shellQuote(JSON.stringify(intake.route.headers))}`);
  }

  parts.push("npm run verify:mapping");
  return parts.join(" \\\n");
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("Usage: npm run intake:command -- <provider-intake.json>");
  }

  const intake = await readIntakeFile(filePath);
  const warnings = sideEffectWarnings(intake);
  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.error(warning);
    }
  }

  console.log(buildVerifyMappingCommand(intake));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
