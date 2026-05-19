export interface CanonicalSolanaAccountBalanceInput {
  network: string;
  address: string;
}

export interface SolanaInfraAccountBalanceNormalizedOutput {
  address: string | null;
  network: "solana" | string | null;
  balance_lamports: number | null;
  balance_sol: number | null;
  address_match: boolean | null;
  network_match: boolean | null;
  balance_detected: boolean;
  status_evidence: string;
  raw_status_code: number | null;
  caveat_objects: CaveatObject[];
  evidence_health: EvidenceHealth;
}

export type SolanaInfraCaveatCode =
  | "account_balance_semantics_partial"
  | "native_balance_missing"
  | "lamports_missing"
  | "sol_balance_missing"
  | "address_unconfirmed"
  | "network_unconfirmed"
  | "network_mismatch"
  | "account_not_found"
  | "payment_required_confirmed_only"
  | "paid_payload_unobserved"
  | "non_json_text_response"
  | "status_code_unavailable"
  | "route_not_found"
  | "auth_required";

export type CaveatSeverity = "info" | "warning" | "error";

export interface CaveatObject {
  code: SolanaInfraCaveatCode;
  severity: CaveatSeverity;
  affects_core_semantics: boolean;
  detail: string;
}

export type EvidenceHealth = "recorded" | "caveated" | "degraded" | "unverified" | "scaffold";

export interface NormalizeSolanaInfraAccountBalanceInput {
  parsedJson: unknown;
  responsePreview?: string;
  statusCode?: number | null;
  statusEvidence?: string;
  paidExecutionObserved?: boolean;
  canonicalInput?: CanonicalSolanaAccountBalanceInput;
  routeContext?: string | null;
}

export interface NormalizeSolanaInfraAccountBalanceResult {
  normalized: SolanaInfraAccountBalanceNormalizedOutput;
  caveat_objects: CaveatObject[];
}

export interface SolanaInfraEvidenceHealthInput {
  researchOnly?: boolean;
  paidAttempts?: number;
  paidSuccesses?: number;
  paidFailures?: number;
  latest?: NormalizeSolanaInfraAccountBalanceResult;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function deepFindFirstNumber(obj: unknown, keys: string[]): number | null {
  if (!isObject(obj)) {
    return null;
  }

  const lowered = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [obj];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current)) {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (lowered.has(key.toLowerCase()) && typeof value === "number" && Number.isFinite(value)) {
        return value;
      }

      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return null;
}

function deepFindFirstString(obj: unknown, keys: string[]): string | null {
  if (!isObject(obj)) {
    return null;
  }

  const lowered = new Set(keys.map((key) => key.toLowerCase()));
  const queue: unknown[] = [obj];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current)) {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (lowered.has(key.toLowerCase())) {
        const found = asNonEmptyString(value);
        if (found) {
          return found;
        }
      }

      if (isObject(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return null;
}

function inferSolanaFromRouteContext(routeContext: string | null | undefined): string | null {
  if (!routeContext) {
    return null;
  }
  return /solana/i.test(routeContext) ? "solana" : null;
}

function addCaveat(list: CaveatObject[], code: SolanaInfraCaveatCode, detail: string): void {
  if (list.some((entry) => entry.code === code)) {
    return;
  }

  const severityByCode: Record<SolanaInfraCaveatCode, CaveatSeverity> = {
    account_balance_semantics_partial: "warning",
    native_balance_missing: "error",
    lamports_missing: "warning",
    sol_balance_missing: "warning",
    address_unconfirmed: "warning",
    network_unconfirmed: "warning",
    network_mismatch: "error",
    account_not_found: "error",
    payment_required_confirmed_only: "info",
    paid_payload_unobserved: "warning",
    non_json_text_response: "warning",
    status_code_unavailable: "warning",
    route_not_found: "error",
    auth_required: "error",
  };

  const affectsCore: Record<SolanaInfraCaveatCode, boolean> = {
    account_balance_semantics_partial: true,
    native_balance_missing: true,
    lamports_missing: false,
    sol_balance_missing: false,
    address_unconfirmed: false,
    network_unconfirmed: false,
    network_mismatch: true,
    account_not_found: true,
    payment_required_confirmed_only: false,
    paid_payload_unobserved: true,
    non_json_text_response: true,
    status_code_unavailable: false,
    route_not_found: true,
    auth_required: true,
  };

  list.push({
    code,
    severity: severityByCode[code],
    affects_core_semantics: affectsCore[code],
    detail,
  });
}

function detectAccountNotFound(parsedJson: unknown): boolean {
  if (!isObject(parsedJson)) {
    return false;
  }

  const accountInfoValue = (parsedJson as { result?: { value?: unknown } }).result?.value;
  if (accountInfoValue === null) {
    return true;
  }

  const errorText = deepFindFirstString(parsedJson, ["error", "message"]);
  return typeof errorText === "string" && /not found|could not find|unknown account/i.test(errorText);
}

function extractBalances(parsedJson: unknown): {
  balance_lamports: number | null;
  balance_sol: number | null;
  inconsistent: boolean;
} {
  let lamports: number | null = null;
  let sol: number | null = null;

  if (isObject(parsedJson)) {
    const root = parsedJson as {
      result?: { value?: unknown };
    };

    const rpcBalance = root.result && isObject(root.result) ? (root.result as { value?: unknown }).value : undefined;
    if (typeof rpcBalance === "number" && Number.isFinite(rpcBalance)) {
      lamports = rpcBalance;
    }

    const accountInfo =
      root.result &&
      isObject(root.result) &&
      isObject((root.result as { value?: unknown }).value) &&
      typeof ((root.result as { value?: { lamports?: unknown } }).value?.lamports) === "number"
        ? (((root.result as { value?: { lamports?: number } }).value?.lamports as number) ?? null)
        : null;

    if (lamports === null && typeof accountInfo === "number" && Number.isFinite(accountInfo)) {
      lamports = accountInfo;
    }
  }

  lamports = lamports ?? deepFindFirstNumber(parsedJson, ["balance_lamports", "lamports", "amount"]);
  sol = deepFindFirstNumber(parsedJson, ["balance_sol", "sol"]);

  if (lamports !== null) {
    const derivedSol = lamports / 1_000_000_000;
    const inconsistent = sol !== null && Math.abs(sol - derivedSol) > 0.000000001;
    return {
      balance_lamports: lamports,
      balance_sol: derivedSol,
      inconsistent,
    };
  }

  return {
    balance_lamports: null,
    balance_sol: sol,
    inconsistent: false,
  };
}

export function deriveSolanaInfraEvidenceHealth(input: SolanaInfraEvidenceHealthInput): EvidenceHealth {
  const researchOnly = input.researchOnly === true;
  const paidAttempts = input.paidAttempts ?? 0;
  const paidSuccesses = input.paidSuccesses ?? 0;
  const paidFailures = input.paidFailures ?? Math.max(0, paidAttempts - paidSuccesses);
  const latest = input.latest;

  if (researchOnly && paidAttempts === 0) {
    return "scaffold";
  }

  if (paidAttempts === 0 || paidSuccesses === 0) {
    return "unverified";
  }

  const caveats = latest?.caveat_objects ?? [];

  if (paidFailures >= 2 || caveats.some((c) => c.code === "account_not_found")) {
    return "degraded";
  }

  const hasInconsistentPayload = caveats.some(
    (c) => c.code === "account_balance_semantics_partial" && /inconsistent/i.test(c.detail),
  );
  if (hasInconsistentPayload) {
    return "degraded";
  }

  const normalized = latest?.normalized;
  const networkConfirmed = normalized?.network_match === true || normalized?.network === "solana";
  const coreBlocking = caveats.some((c) =>
    c.code === "native_balance_missing" ||
    c.code === "network_mismatch" ||
    c.code === "route_not_found" ||
    c.code === "auth_required" ||
    c.code === "paid_payload_unobserved" ||
    c.code === "non_json_text_response",
  );

  if (normalized?.balance_detected === true && networkConfirmed && !coreBlocking) {
    const caveatedByPolicy = caveats.some((c) =>
      c.code === "status_code_unavailable" ||
      c.code === "address_unconfirmed" ||
      c.code === "network_unconfirmed" ||
      c.code === "lamports_missing" ||
      c.code === "sol_balance_missing" ||
      c.code === "account_balance_semantics_partial",
    );

    return caveatedByPolicy ? "caveated" : "recorded";
  }

  return "caveated";
}

export function normalizeSolanaInfraAccountBalance(
  input: NormalizeSolanaInfraAccountBalanceInput,
): NormalizeSolanaInfraAccountBalanceResult {
  const caveatObjects: CaveatObject[] = [];
  const statusCode = typeof input.statusCode === "number" ? input.statusCode : null;
  const statusEvidence = input.statusEvidence ?? "status unavailable";
  const paidObserved = input.paidExecutionObserved === true;
  const canonical = input.canonicalInput;

  if (statusCode === null) {
    addCaveat(caveatObjects, "status_code_unavailable", "HTTP status code was not available in execution output.");
  }
  if (statusCode === 402) {
    addCaveat(caveatObjects, "payment_required_confirmed_only", "Unpaid payment challenge observed (HTTP 402).");
    addCaveat(caveatObjects, "paid_payload_unobserved", "No paid payload was observed for this route execution evidence.");
  }
  if (statusCode === 404) {
    addCaveat(caveatObjects, "route_not_found", "Provider route was not found (HTTP 404).");
  }
  if (statusCode === 401) {
    addCaveat(caveatObjects, "auth_required", "Provider requires explicit authentication/authorization (HTTP 401).");
  }

  if (typeof input.parsedJson === "string") {
    addCaveat(caveatObjects, "non_json_text_response", "Response payload was plain text and not structured JSON.");
  }

  const extracted = extractBalances(input.parsedJson);
  if (extracted.inconsistent) {
    addCaveat(
      caveatObjects,
      "account_balance_semantics_partial",
      "Lamports-derived SOL and reported SOL were inconsistent in payload.",
    );
  }

  const payloadAddress = deepFindFirstString(input.parsedJson, ["address", "account", "pubkey"]);
  const payloadNetwork = deepFindFirstString(input.parsedJson, ["network", "chain", "blockchain"]);
  const inferredNetwork = inferSolanaFromRouteContext(input.routeContext ?? null);
  const resolvedNetwork = payloadNetwork ? normalizeText(payloadNetwork) : inferredNetwork;

  let addressMatch: boolean | null = null;
  let networkMatch: boolean | null = null;

  if (canonical) {
    if (payloadAddress) {
      addressMatch = payloadAddress.trim() === canonical.address.trim();
    } else {
      addressMatch = null;
      addCaveat(
        caveatObjects,
        "address_unconfirmed",
        "Response payload did not echo the canonical address; match remains unconfirmed.",
      );
    }

    if (resolvedNetwork) {
      networkMatch = normalizeText(canonical.network) === normalizeText(resolvedNetwork);
      if (networkMatch === false) {
        addCaveat(caveatObjects, "network_mismatch", "Resolved network does not match canonical network.");
      }
      if (!payloadNetwork && inferredNetwork) {
        addCaveat(caveatObjects, "network_unconfirmed", "Network was inferred from route context, not echoed in payload.");
      }
    } else {
      networkMatch = null;
      addCaveat(caveatObjects, "network_unconfirmed", "Response payload did not confirm network.");
    }
  }

  if (detectAccountNotFound(input.parsedJson)) {
    addCaveat(caveatObjects, "account_not_found", "Provider response indicates account was not found.");
  }

  const balanceDetected = extracted.balance_lamports !== null || extracted.balance_sol !== null;
  if (!balanceDetected) {
    addCaveat(caveatObjects, "native_balance_missing", "No native SOL balance was detected in response payload.");
  }
  if (extracted.balance_lamports === null) {
    addCaveat(caveatObjects, "lamports_missing", "Lamports value was not present in response payload.");
  }
  if (extracted.balance_sol === null) {
    addCaveat(caveatObjects, "sol_balance_missing", "SOL value was not present and could not be derived.");
  }

  if (
    addressMatch !== true ||
    networkMatch !== true ||
    extracted.balance_lamports === null ||
    extracted.balance_sol === null
  ) {
    addCaveat(
      caveatObjects,
      "account_balance_semantics_partial",
      "Observed evidence only partially confirms canonical Solana account balance semantics.",
    );
  }

  const provisional: SolanaInfraAccountBalanceNormalizedOutput = {
    address: payloadAddress,
    network: resolvedNetwork,
    balance_lamports: extracted.balance_lamports,
    balance_sol: extracted.balance_sol,
    address_match: addressMatch,
    network_match: networkMatch,
    balance_detected: balanceDetected,
    status_evidence: statusEvidence,
    raw_status_code: statusCode,
    caveat_objects: caveatObjects,
    evidence_health: "caveated",
  };

  const evidenceHealth = deriveSolanaInfraEvidenceHealth({
    paidAttempts: paidObserved ? 1 : 0,
    paidSuccesses: paidObserved ? 1 : 0,
    paidFailures: 0,
    latest: {
      normalized: provisional,
      caveat_objects: caveatObjects,
    },
  });

  const normalized: SolanaInfraAccountBalanceNormalizedOutput = {
    ...provisional,
    evidence_health: evidenceHealth,
  };

  return {
    normalized,
    caveat_objects: caveatObjects,
  };
}
