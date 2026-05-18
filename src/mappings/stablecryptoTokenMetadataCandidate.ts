export const stablecryptoTokenMetadataCandidate = {
  provider_id: "merit-systems/stablecrypto/market-data",
  provider_name: "StableCrypto",
  category: "finance/data",
  benchmark_intent: "token metadata",
  mapping_status: "candidate",
  execution_evidence_status: "unproven",
  proof_source: "provider_metadata_research",
  proof_reference: "live-proofs/token-metadata-provider-research-2026-05-18.md",
  endpoint_url: "https://stablecrypto.dev/api/alchemy/token/token-metadata",
  method: "POST",
  request_shape_example: {"contractAddress":"So11111111111111111111111111111111111111112","network":"solana"},
  notes: "Candidate only. Token metadata semantics need endpoint/method/request-shape verification. Not benchmark-ready. No winner claimed.",
} as const;
