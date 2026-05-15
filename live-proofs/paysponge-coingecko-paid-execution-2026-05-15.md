# PaySponge CoinGecko paid execution proof (2026-05-15)

- Provider ID: `paysponge-coingecko`
- Intent: `get SOL price`
- Route: `GET https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL`
- Execution time (UTC): `2026-05-15T18:44:46Z`

## Unpaid challenge precondition

- Unpaid probe on same route returned `HTTP 402` with a `payment-required` challenge.
- Evidence file: `proofs/paysponge-coingecko-probe.json`

## Paid execution result

Command run:

```bash
pay curl -i -sS "https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=SOL"
```

Observed response headers:

- `HTTP/2 200`
- `payment-response: <base64 payload>`
- `content-type: application/json; charset=utf-8`
- `x-request-id: 3be59704-c18c-4b5f-9b6e-93aed6be1c12`

Decoded `payment-response` payload:

```json
{
  "success": true,
  "transaction": "2nif18NK6t6PunhbuETF23QUa1itUUiN11JLU1nM5tVAV4w5pCR8SFyq9aFQsHECok5ym3b7oe6MCDQrqYWKbgrc",
  "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  "payer": "DoGNoLQ4behUFahMH5nam3upDqMWW8HvaWEBR5yDyb7N",
  "errorReason": null
}
```

Parsed JSON body excerpt:

```json
{
  "firstPoolId": "solana_Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE",
  "firstPoolName": "SOL / USDC",
  "firstPoolPriceUsd": "89.828156551981560539040242282",
  "firstPoolCreatedAt": "2023-07-05T14:34:02Z"
}
```

Raw response archive (headers + body):

- `proofs/paysponge-coingecko-paid-response-2026-05-15.txt`

## Status decision

- `mapping_status: verified`
- `execution_evidence_status: proven`
