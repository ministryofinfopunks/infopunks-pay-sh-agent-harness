import { writeFileSync } from "node:fs";

const probes = [
  {
    name: "base",
    method: "GET",
    url: "https://pro-api.coingecko.com/api/v3/x402/onchain"
  },
  {
    name: "networks",
    method: "GET",
    url: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks"
  },
  {
    name: "solana-tokens",
    method: "GET",
    url: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens"
  },
  {
    name: "solana-wsol-token",
    method: "GET",
    url: "https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112"
  },
  {
    name: "search-sol-pools",
    method: "GET",
    url: "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL"
  }
] as const;

type ProbeResult = {
  name: string;
  method: string;
  url: string;
  startedAt: string;
  finishedAt: string;
  status?: number;
  contentType?: string | null;
  hasX402Challenge?: boolean;
  headers?: Record<string, string>;
  bodyPreview?: string;
  error?: string;
};

async function main(): Promise<void> {
  const results: ProbeResult[] = [];

  for (const probe of probes) {
    const startedAt = new Date().toISOString();

    try {
      const res = await fetch(probe.url, {
        method: probe.method,
        headers: {
          Accept: "application/json"
        }
      });

      const contentType = res.headers.get("content-type");
      const bodyText = await res.text();
      const headers = Object.fromEntries(res.headers.entries());
      const headerKeys = Object.keys(headers).map((h) => h.toLowerCase());

      results.push({
        ...probe,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: res.status,
        contentType,
        hasX402Challenge:
          res.status === 402 ||
          headerKeys.some((h) => h.includes("x402")) ||
          bodyText.toLowerCase().includes("payment"),
        headers,
        bodyPreview: bodyText.slice(0, 1000)
      });
    } catch (error) {
      results.push({
        ...probe,
        startedAt,
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const payload = {
    providerId: "paysponge-coingecko",
    benchmarkIntent: "get SOL price",
    generatedAt: new Date().toISOString(),
    results
  };

  writeFileSync("proofs/paysponge-coingecko-probe.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
