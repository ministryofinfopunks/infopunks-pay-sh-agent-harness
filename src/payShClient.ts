import { DataMode, ProviderCatalogEntry } from "./types";

const DEFAULT_TIMEOUT_MS = 2500;

const MOCK_CATALOG: ProviderCatalogEntry[] = [
  {
    id: "paysh-beta",
    name: "Pay.sh Beta Node",
    region: "us-east",
    catalogPriority: 1,
    mockData: true,
  },
  {
    id: "paysh-alpha",
    name: "Pay.sh Alpha Node",
    region: "us-east",
    catalogPriority: 2,
    mockData: true,
  },
  {
    id: "paysh-gamma",
    name: "Pay.sh Gamma Node",
    region: "us-west",
    catalogPriority: 3,
    mockData: true,
  },
  {
    id: "paysh-delta",
    name: "Pay.sh Delta Node",
    region: "us-central",
    catalogPriority: 4,
    mockData: true,
  },
];

export interface PayShCatalogResult {
  providers: ProviderCatalogEntry[];
  mode: DataMode;
  endpoint?: string;
  warning?: string;
}

function getTimeoutMs(): number {
  const raw = Number(process.env.REQUEST_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

function normalizeProviders(input: unknown): ProviderCatalogEntry[] {
  const rawProviders = Array.isArray(input)
    ? input
    : typeof input === "object" && input !== null && "providers" in input
      ? (input as { providers: unknown }).providers
      : null;

  if (!Array.isArray(rawProviders)) {
    throw new Error("Pay.sh response did not include a providers array.");
  }

  return rawProviders.map((item, index) => {
    const provider = item as Partial<ProviderCatalogEntry>;

    if (typeof provider.id !== "string" || typeof provider.name !== "string") {
      throw new Error("Pay.sh provider missing id or name.");
    }

    return {
      id: provider.id,
      name: provider.name,
      region: typeof provider.region === "string" ? provider.region : "unknown",
      catalogPriority:
        Number.isFinite(provider.catalogPriority) && (provider.catalogPriority as number) > 0
          ? (provider.catalogPriority as number)
          : index + 1,
      mockData: false,
    };
  });
}

export async function fetchPayShCatalog(userIntent?: string): Promise<PayShCatalogResult> {
  const baseUrl = process.env.PAYSH_API_BASE_URL?.trim();

  if (!baseUrl) {
    return {
      providers: [...MOCK_CATALOG],
      mode: "mock",
      warning: "PAYSH_API_BASE_URL not set. Using mock Pay.sh provider catalog.",
    };
  }

  const endpointUrl = new URL(`${baseUrl.replace(/\/$/, "")}/providers`);
  if (userIntent) {
    endpointUrl.searchParams.set("intent", userIntent);
  }

  const endpoint = endpointUrl.toString();

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(getTimeoutMs()),
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Pay.sh request failed with HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const normalized = normalizeProviders(payload);
    return { providers: normalized, mode: "live", endpoint };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      providers: [...MOCK_CATALOG],
      mode: "fallback-mock",
      endpoint,
      warning: `Pay.sh catalog unavailable (${message}). Falling back to mock providers.`,
    };
  }
}
