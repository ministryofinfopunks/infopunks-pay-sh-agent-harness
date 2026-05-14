export type ProviderEndpointStatus =
  | "verified_pay_cli_success"
  | "intermittent_pay_cli_success"
  | "verified_402"
  | "unverified";

export interface ProviderEndpointMapping {
  endpointMappingId: string;
  providerId: string;
  label: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body: unknown | null;
  headers?: Record<string, string>;
  category: string;
  capabilities: string[];
  outputShape: string;
  status: ProviderEndpointStatus;
  endpointMappingSource: "manual_pay_cli_verification" | "manual_402_verification" | "unknown";
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
    notes:
      "Manual pay curl previously succeeded for getHealth/getBalance, but current pay-cli calls can fail with Server returned 402 again after payment. Do not execute by default until stable.",
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
    notes: "Verified via pay-cli execution with parsed Solana mainnet getBalance JSON-RPC response.",
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
    notes: "Verified via pay-cli execution with parsed Solana mainnet getSlot JSON-RPC response.",
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
  {
    endpointMappingId: "stableenrich-exa-search",
    providerId: "merit-systems-stableenrich-enrichment",
    label: "StableEnrich Exa Web Search",
    url: "https://stableenrich.dev/api/exa/search",
    method: "POST",
    body: { query: "latest Solana agent payments" },
    category: "data",
    capabilities: ["search", "web_search", "research", "enrichment", "data"],
    outputShape: "web_search_results",
    status: "verified_402",
    endpointMappingSource: "manual_402_verification",
    notes:
      "Unpaid x402 challenge verified, but pay-cli execution returns {\"success\":false,\"error\":\"Settlement failed\"}.",
  },
  {
    endpointMappingId: "google-places-search-text",
    providerId: "solana-foundation-google-places",
    label: "Google Places Search Text",
    url: "https://places.google.gateway-402.com/v1/places:searchText",
    method: "POST",
    body: { textQuery: "coffee in Colombo" },
    headers: {
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating",
    },
    category: "maps",
    capabilities: ["maps", "search", "places"],
    outputShape: "places_search",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes:
      "Unpaid request returned x402 challenge; pay-cli exited 0 with parsed JSON places list when X-Goog-FieldMask header was provided.",
  },
  {
    endpointMappingId: "google-vision-images-annotate",
    providerId: "solana-foundation-google-vision",
    label: "Google Vision Annotate Image",
    url: "https://vision.google.gateway-402.com/v1/images:annotate",
    method: "POST",
    body: {
      requests: [
        {
          image: {
            content: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZxwAAAABJRU5ErkJggg==",
          },
          features: [{ type: "LABEL_DETECTION", maxResults: 3 }],
        },
      ],
    },
    category: "ai_ml",
    capabilities: ["ai_ml", "vision", "ocr", "image_labels"],
    outputShape: "image_labels",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes: "Unpaid request returned x402 challenge; pay-cli exited 0 with parsed JSON labelAnnotations response.",
  },
  {
    endpointMappingId: "paysponge-perplexity-search",
    providerId: "paysponge/perplexity",
    label: "PaySponge Perplexity Search",
    url: "https://pplx.x402.paysponge.com/search",
    method: "POST",
    body: {
      query: "latest Solana agent payments",
      max_results: 1,
    },
    category: "ai_ml",
    capabilities: ["research", "web_search", "citations", "answer", "ai_ml"],
    outputShape: "research_answer",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes: "Verified via pay-cli execution with parsed Perplexity search results.",
  },
  {
    endpointMappingId: "agentmail-read-inboxes-v0",
    providerId: "agentmail/email",
    label: "AgentMail Read-only Inboxes List",
    url: "https://x402.api.agentmail.to/v0/inboxes",
    method: "GET",
    body: {},
    category: "messaging",
    capabilities: ["email", "inbox", "read", "message", "retrieve", "messaging"],
    outputShape: "agent_inbox",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes:
      "Verified via pay-cli execution with parsed read-only AgentMail inbox list response. No outbound email used.",
  },
  {
    endpointMappingId: "textbelt-sms-status",
    providerId: "paysponge/textbelt",
    label: "Textbelt SMS Status Check",
    url: "https://api.paysponge.com/x402/purchase/svc_d6kszbre4qwg5n4n4/status/test-harness-123",
    method: "GET",
    body: {},
    category: "messaging",
    capabilities: ["sms", "text", "status", "delivery", "messaging"],
    outputShape: "sms_status",
    status: "verified_pay_cli_success",
    endpointMappingSource: "manual_pay_cli_verification",
    notes: "Verified via pay-cli execution with parsed Textbelt SMS status response. No SMS sent.",
  },
];
