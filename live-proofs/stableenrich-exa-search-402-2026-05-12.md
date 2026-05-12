# StableEnrich Exa Search 402 Verification Proof (2026-05-12)

Endpoint:
- `https://stableenrich.dev/api/exa/search`
- Method: `POST`
- Body: `{"query":"latest Solana agent payments"}`

## Unpaid curl proof

Command:

```bash
curl -i -X POST https://stableenrich.dev/api/exa/search \
  -H "Content-Type: application/json" \
  -d '{"query":"latest Solana agent payments"}'
```

Observed result:
- HTTP `402 Payment Required`
- x402 challenge headers present

## pay curl result

Command:

```bash
pay curl -X POST https://stableenrich.dev/api/exa/search \
  -H "Content-Type: application/json" \
  -d '{"query":"latest Solana agent payments"}'
```

Observed result:

```json
{"success":false,"error":"Settlement failed"}
```

## Conclusion

The endpoint is real and x402-gated (`verified_402`), but paid execution is not currently verified (`verified_pay_cli_success` is not applicable).
