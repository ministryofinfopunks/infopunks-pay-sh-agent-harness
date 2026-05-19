# Solana Infra Account Balance QuickNode Paid Verification

- generated_at: 2026-05-19T06:25:18.669Z
- benchmark_id: solana-infra-account-balance
- provider: QuickNode
- endpoint: https://x402.quicknode.com/solana-mainnet/
- method: POST
- canonical_input_hash: 2cf5bf3a4cd5648ba8ece54c24c73e3da2c100bd793825f84ef95e1c6811f163
- canonical_address_short: DoGNoL...yDyb7N
- paid_execution_status: failed
- cli_exit_code: 1
- status_evidence: pay_cli_exit_1_pay_cli_execution_failed
- normalized_output: {"address":null,"network":"solana","balance_lamports":null,"balance_sol":null,"address_match":null,"network_match":true,"balance_detected":false,"status_evidence":"pay_cli_exit_1_pay_cli_execution_failed","raw_status_code":null,"caveat_objects":[{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"non_json_text_response","severity":"warning","affects_core_semantics":true,"detail":"Response payload was plain text and not structured JSON."},{"code":"address_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response payload did not echo the canonical address; match remains unconfirmed."},{"code":"network_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Network was inferred from route context, not echoed in payload."},{"code":"native_balance_missing","severity":"error","affects_core_semantics":true,"detail":"No native SOL balance was detected in response payload."},{"code":"lamports_missing","severity":"warning","affects_core_semantics":false,"detail":"Lamports value was not present in response payload."},{"code":"sol_balance_missing","severity":"warning","affects_core_semantics":false,"detail":"SOL value was not present and could not be derived."},{"code":"account_balance_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms canonical Solana account balance semantics."}],"evidence_health":"unverified"}
- balance_lamports: null
- balance_sol: null
- address_match: null
- network_match: true
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"non_json_text_response","severity":"warning","affects_core_semantics":true,"detail":"Response payload was plain text and not structured JSON."},{"code":"address_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Response payload did not echo the canonical address; match remains unconfirmed."},{"code":"network_unconfirmed","severity":"warning","affects_core_semantics":false,"detail":"Network was inferred from route context, not echoed in payload."},{"code":"native_balance_missing","severity":"error","affects_core_semantics":true,"detail":"No native SOL balance was detected in response payload."},{"code":"lamports_missing","severity":"warning","affects_core_semantics":false,"detail":"Lamports value was not present in response payload."},{"code":"sol_balance_missing","severity":"warning","affects_core_semantics":false,"detail":"SOL value was not present and could not be derived."},{"code":"account_balance_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms canonical Solana account balance semantics."}]
- evidence_health: unverified
- route_state: candidate/unproven
- conclusion: Evidence remains candidate/unproven for benchmark semantics.
No benchmark recorded claim.
No winner claim.
