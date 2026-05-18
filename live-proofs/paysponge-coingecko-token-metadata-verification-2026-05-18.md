# PaySponge CoinGecko Token Metadata Verification

- generated_at: 2026-05-18
- route_tested: https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112
- method: GET
- provider_id: paysponge/coingecko
- benchmark_id: finance-data-token-metadata
- input_token_address: So11111111111111111111111111111111111111112

## Unpaid Probe Result
- status_code: 402
- status_evidence: direct HTTP fetch returned `402` and `payment-required` challenge header
- payment_required_challenge_observed: true
- response_preview: {"error":"Payment required","message":"Payment is required to access this resource"}

## Paid Execution Result
- paid_execution_attempted: true
- execution_transport: pay_cli (via harness `executeLivePayShCall` safe flow)
- success: true
- status_code: null
- status_evidence: pay_cli exit code `0`; parsed response body observed; HTTP status not emitted by CLI output
- cli_exit_code: 0
- error_reason: null

## Metadata Fields Observed
- name: true (`Wrapped SOL`)
- symbol: true (`SOL`)
- address/token address/mint: true (`data.attributes.address`)
- chain/network: true (network encoded in `data.id` prefix `solana_` and route path)
- decimals: true (`data.attributes.decimals = 9`)
- image/logo: true (`data.attributes.image_url`)

## Classification
- classification: verified/proven
- rationale: Paid execution succeeded for the target route and returned token metadata-shaped payload including identity and descriptive fields.

## Caveats
- `pay` CLI output did not include an explicit HTTP status line; status evidence relies on exit code + parseable JSON payload.
- This verification only confirms route semantics and paid payload shape for the tested SOL mint; it does not claim benchmark readiness, benchmark artifact creation, winner status, or Radar modification.
