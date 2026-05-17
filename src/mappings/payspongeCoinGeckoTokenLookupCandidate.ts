export const payspongeCoinGeckoTokenLookupCandidate = {
  provider_id: "paysponge-coingecko",
  provider_name: "CoinGecko Onchain DEX API",
  category: "finance/data",
  benchmark_intent: "token search",
  mapping_status: "candidate",
  execution_evidence_status: "unproven",
  verified_at: "2026-05-17",
  proof_source: "discovery/probe",
  proof_reference: "live-proofs/paysponge-coingecko-token-search-candidate-or-paid-2026-05-17.md",
  endpoint_url: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112",
  method: "GET",
  request_shape_example: {
    network: "solana",
    token_address: "So11111111111111111111111111111111111111112",
  },
  response_shape_expected:
    "token lookup payload for a specific token address, or unpaid payment-required challenge",
  notes: "Candidate only. Comparable as token lookup semantics (search-adjacent), not benchmark-ready, no winner claim.",
} as const;
