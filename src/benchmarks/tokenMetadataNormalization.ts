export type NetworkSource = "payload" | "route_context" | "missing";

export interface TokenMetadataNormalizedFields {
  address: string | null;
  network: string | null;
  decimals: number | null;
  image_url: string | null;
  source_id: string | null;
}

export interface ResolveNetworkInput {
  payloadNetwork: unknown;
  routePath: string | null | undefined;
}

export interface ResolveNetworkResult {
  network: string | null;
  network_source: NetworkSource;
  caveat: "route_context_inferred_network" | null;
}

export interface NormalizeTokenMetadataWithContextInput extends TokenMetadataNormalizedFields {
  routePath: string | null | undefined;
}

export interface NormalizeTokenMetadataWithContextResult extends TokenMetadataNormalizedFields {
  network_source: NetworkSource;
  caveat: "route_context_inferred_network" | null;
}

function normalizeNetworkValue(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function inferNetworkFromRoutePath(routePath: string | null | undefined): string | null {
  if (!routePath) {
    return null;
  }
  const match = routePath.match(/\/networks\/([^/]+)\//i);
  if (!match || typeof match[1] !== "string") {
    return null;
  }
  return normalizeNetworkValue(match[1]);
}

export function resolveTokenMetadataNetwork(input: ResolveNetworkInput): ResolveNetworkResult {
  if (typeof input.payloadNetwork === "string") {
    const normalized = normalizeNetworkValue(input.payloadNetwork);
    if (normalized) {
      return {
        network: normalized,
        network_source: "payload",
        caveat: null,
      };
    }
  }

  const fromRoute = inferNetworkFromRoutePath(input.routePath);
  if (fromRoute) {
    return {
      network: fromRoute,
      network_source: "route_context",
      caveat: "route_context_inferred_network",
    };
  }

  return {
    network: null,
    network_source: "missing",
    caveat: null,
  };
}

export function normalizeTokenMetadataWithRouteContext(
  input: NormalizeTokenMetadataWithContextInput,
): NormalizeTokenMetadataWithContextResult {
  const resolved = resolveTokenMetadataNetwork({
    payloadNetwork: input.network,
    routePath: input.routePath,
  });

  return {
    address: input.address,
    network: resolved.network,
    decimals: input.decimals,
    image_url: input.image_url,
    source_id: input.source_id,
    network_source: resolved.network_source,
    caveat: resolved.caveat,
  };
}

export function canonicalNetworkMatch(input: {
  canonicalNetwork: string;
  normalizedNetwork: string | null;
}): boolean {
  const canonical = normalizeNetworkValue(input.canonicalNetwork);
  const normalized = input.normalizedNetwork ? normalizeNetworkValue(input.normalizedNetwork) : null;
  return Boolean(canonical && normalized && canonical === normalized);
}
