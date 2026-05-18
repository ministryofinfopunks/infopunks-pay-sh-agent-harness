export const payspongeCoinGeckoTokenMetadataCandidate = {
  provider_id: "paysponge/coingecko",
  provider_name: "CoinGecko Onchain DEX API",
  category: "finance/data",
  benchmark_intent: "token metadata",
  mapping_status: "candidate",
  execution_evidence_status: "unproven",
  proof_source: "provider_metadata_research",
  proof_reference: "live-proofs/token-metadata-provider-research-2026-05-18.md",
  endpoint_url: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/{network}/tokens/{address}",
  method: "GET",
  request_shape_example: {"symbol":"SOL","network":"solana","token_address":"So11111111111111111111111111111111111111112"},
  notes: "Candidate only. Token metadata semantics need endpoint/method/request-shape verification. Not benchmark-ready. No winner claimed.",
} as const;
