export const stablecryptoTokenSearchCandidate = {
  provider_id: "merit-systems-stablecrypto-market-data",
  provider_name: "StableCrypto",
  category: "finance/data",
  benchmark_intent: "token search",
  mapping_status: "verified",
  execution_evidence_status: "unproven",
  verified_at: "2026-05-17",
  proof_source: "infopunks-pay-sh-agent-harness",
  proof_reference: "live-proofs/stablecrypto-token-search-verified-unproven-2026-05-17.md",
  endpoint_url: "https://stablecrypto.dev/api/coingecko/onchain/search",
  method: "POST",
  request_shape_example: { query: "SOL" },
  notes:
    "Endpoint path, method, request shape, token-search intent, and unpaid route challenge/behavior verified. Paid execution not attempted. Not benchmark-ready.",
} as const;
