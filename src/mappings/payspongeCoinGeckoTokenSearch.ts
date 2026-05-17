export const payspongeCoinGeckoTokenSearchCandidate = {
  provider_id: "paysponge-coingecko",
  provider_name: "CoinGecko Onchain DEX API",
  category: "finance/data",
  benchmark_intent: "token search",
  mapping_status: "verified",
  execution_evidence_status: "proven",
  verified_at: "2026-05-17",
  proven_at: "2026-05-17",
  proof_source: "infopunks-pay-sh-agent-harness",
  proof_reference: "live-proofs/paysponge-coingecko-token-search-paid-execution-2026-05-17.md",
  endpoint_url: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL",
  method: "GET",
  request_shape_example: { query: "SOL" },
  response_shape_expected:
    "search/pools token/pool results with SOL/USDC-like pool expected when paid execution succeeds",
  notes:
    "Paid execution succeeded for token-search route. This proves route execution, not benchmark readiness or superiority.",
} as const;
