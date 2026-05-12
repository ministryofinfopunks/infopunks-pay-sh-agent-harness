export type ProviderEndpointStatus = "verified_pay_cli_success" | "unverified";

export interface ProviderEndpointMapping {
  endpointMappingId: string;
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
    endpointMappingId: "quicknode-rpc-health",
    providerId: "quicknode-rpc",
    label: "QuickNode Solana Mainnet RPC Health",
    url: "https://x402.quicknode.com/solana-mainnet",
    method: "POST",
    body: { jsonrpc: "2.0", id: 1, method: "getHealth", params: [] },
    category: "compute",
    capabilities: ["rpc", "blockchain", "solana", "onchain", "compute"],
    outputShape: "json_rpc_health",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes: "pay curl succeeded for Solana getHealth and getBalance JSON-RPC requests.",
  },
  {
    endpointMappingId: "quicknode-rpc-balance",
    providerId: "quicknode-rpc",
    label: "QuickNode Solana Mainnet RPC Balance",
    url: "https://x402.quicknode.com/solana-mainnet",
    method: "POST",
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "getBalance",
      params: ["11111111111111111111111111111111"],
    },
    category: "compute",
    capabilities: ["rpc", "blockchain", "solana", "onchain", "compute"],
    outputShape: "json_rpc_balance",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes: "pay curl succeeded for Solana getBalance JSON-RPC requests.",
  },
  {
    endpointMappingId: "quicknode-rpc-slot",
    providerId: "quicknode-rpc",
    label: "QuickNode Solana Mainnet RPC Slot",
    url: "https://x402.quicknode.com/solana-mainnet",
    method: "POST",
    body: { jsonrpc: "2.0", id: 1, method: "getSlot", params: [] },
    category: "compute",
    capabilities: ["rpc", "blockchain", "solana", "onchain", "compute"],
    outputShape: "json_rpc_slot",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes: "pay curl succeeded for Solana getSlot JSON-RPC requests.",
  },
  {
    endpointMappingId: "stablecrypto-price",
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
    endpointMappingId: "paysponge-trending-pools",
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
