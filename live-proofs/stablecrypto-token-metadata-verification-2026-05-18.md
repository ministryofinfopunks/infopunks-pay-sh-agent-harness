# StableCrypto Token Metadata Verification

- generated_at: 2026-05-18
- provider_id: merit-systems/stablecrypto/market-data
- benchmark_id: finance-data-token-metadata
- route_tested: https://stablecrypto.dev/api/alchemy/token/token-metadata
- method: POST
- request_body: {"network":"solana","contractAddress":"So11111111111111111111111111111111111111112"}
- input_token_address: So11111111111111111111111111111111111111112

## Unpaid Probe Result
- paid_execution_attempted: false
- command: curl -i -sS -X POST https://stablecrypto.dev/api/alchemy/token/token-metadata -H 'Content-Type: application/json' -H 'Accept: application/json' --data '{"network":"solana","contractAddress":"So11111111111111111111111111111111111111112"}'
- status_code: 402
- status_evidence: Direct unpaid HTTP probe returned `HTTP/2 402` with `payment-required` and `www-authenticate` headers and `x-matched-path: /api/alchemy/token/token-metadata`.
- payment_required_challenge_observed: true

## Paid Execution Result
- paid_execution_attempted: true
- execution_transport: pay_cli via harness `executeLivePayShCall` (`LIVE_PAYSH_EXECUTION=true`, `PAYSH_EXECUTION_MODE=pay_cli`)
- command_shape: pay curl 'https://stablecrypto.dev/api/alchemy/token/token-metadata' -X POST -H 'Content-Type: application/json' -d '{"network":"solana","contractAddress":"So11111111111111111111111111111111111111112"}'
- cli_exit_code: 0
- status_code: null
- status_evidence: pay_cli exit code `0`; CLI body returned parseable JSON `{"success":false,"error":"fetch failed"}` and did not expose an HTTP status line.
- response_preview: {"success":false,"error":"fetch failed"}

## Metadata Fields Observed
- name: false
- symbol: false
- address/token address/mint: false
- chain/network: false
- decimals: false
- image/logo: false

## Classification
- classification: rejected
- rationale: Paid execution was attempted but returned a non-metadata error payload (`success:false`, `error:"fetch failed"`) instead of token metadata fields.

## Caveats
- Unpaid route behavior is valid x402-gated behavior for the tested method/path/body shape.
- pay_cli mode can hide HTTP status; status evidence here relies on CLI exit code + response body.
- This document does not create a benchmark artifact, does not update Radar, and does not claim route superiority.
- Benchmark readiness/comparability is not claimed here; explicit comparability checks must be done separately in benchmark workflow.
