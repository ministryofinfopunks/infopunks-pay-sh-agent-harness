export const payspongeCoinGeckoCandidate = {
  providerId: "paysponge-coingecko",
  providerName: "CoinGecko Onchain DEX API",
  category: "finance",
  benchmarkIntent: "get SOL price",
  serviceUrl: "https://pro-api.coingecko.com/api/v3/x402/onchain",
  endpointCount: 5,
  status: "verified",
  evidenceStatus: "proven",
  verifiedRoute: {
    method: "GET",
    url: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL"
  },
  notes: [
    "Live Pay.sh catalog confirms provider exists.",
    "Unpaid 402 challenge verified on token-detail and search-pools routes.",
    "Paid execution succeeded on 2026-05-15 with HTTP 200 and payment-response header.",
    "See live-proofs/paysponge-coingecko-paid-execution-2026-05-15.md for evidence."
  ]
} as const;
