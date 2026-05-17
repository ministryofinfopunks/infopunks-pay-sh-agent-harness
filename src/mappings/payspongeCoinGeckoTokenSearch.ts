export const payspongeCoinGeckoTokenSearchCandidate = {
  provider_id: "paysponge-coingecko",
  provider_name: "CoinGecko Onchain DEX API",
  category: "finance/data",
  benchmark_intent: "token search",
  mapping_status: "candidate",
  execution_evidence_status: "unproven",
  proof_source: "catalog/probe",
  endpoint_url: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
  method: "GET",
  request_shape_example: { query: "SOL" },
  response_shape_expected:
    "pool/search results containing token/pool data and SOL/USDC-like result if available",
  notes:
    "This is candidate evidence for token search only. It does not prove benchmark readiness or route superiority.",
} as const;
