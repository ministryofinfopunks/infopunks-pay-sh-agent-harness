export const stablecryptoTokenSearchCandidate = {
  provider_id: "merit-systems/stablecrypto/market-data",
  provider_name: "StableCrypto",
  category: "finance/data",
  benchmark_intent: "token search",
  mapping_status: "candidate",
  execution_evidence_status: "unproven",
  proof_reference: "live-proofs/token-search-provider-research-2026-05-17.md",
  endpoint_url: "https://stablecrypto.dev/api/coingecko/onchain/search",
  method: "POST",
  request_shape_example: { query: "SOL" },
  notes: "Candidate only from provider metadata; not benchmark-ready and no winner claim.",
} as const;
