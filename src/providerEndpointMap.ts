export type ProviderEndpointStatus = "verified_pay_cli_success" | "unverified";

export interface ProviderEndpointMapping {
  providerId: string;
  label: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body: unknown | null;
  category: string;
  capabilities: string[];
  outputShape: string;
  status: ProviderEndpointStatus;
  endpointMappingSource: "manual_pay_cli_verification" | "unknown";
  notes: string;
}

export const providerEndpointMap: ProviderEndpointMapping[] = [
  {
    providerId: "merit-systems-stablecrypto-market-data",
    label: "StableCrypto CoinGecko Price",
    url: "https://stablecrypto.dev/api/coingecko/price",
    method: "POST",
    body: { ids: ["solana"], vs_currencies: ["usd"] },
    category: "finance",
    capabilities: ["market_data", "pricing"],
    outputShape: "simple_price",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes: "Returned live SOL/USD response through pay curl.",
  },
  {
    providerId: "paysponge-coingecko",
    label: "PaySponge CoinGecko Solana Trending Pools",
    url: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/trending_pools",
    method: "GET",
    body: null,
    category: "finance",
    capabilities: ["market_data", "pricing", "dex_pools", "trending"],
    outputShape: "trending_pools",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes:
      "pay curl succeeded for Solana trending pools. /x402/onchain/networks returned API-key-missing and is intentionally not mapped.",
  },
];
