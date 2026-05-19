# Communications Email Delivery StableEmail Paid Verification

- generated_at: 2026-05-19T06:02:24.520Z
- benchmark: communications-email-delivery
- provider: merit-systems/stableemail/email
- endpoint: https://stableemail.dev/api/send
- method: POST
- canonical_input_hash_sha256: f960ec09aaa710a05ef589fe7518e9cfaf1f34b77d43c3465dc27ab97a59682e
- canonical_input_to_masked: ah***@gmail.com
- paid_execution_status: succeeded
- route_state: verified/proven
- cli_exit_code: 0
- status_evidence: pay_cli_exit_0_status_unavailable
- normalized_output: {"accepted":true,"provider_message_id":null,"delivery_status":"accepted","recipient_match":null,"subject_match":null,"body_match":null,"status_evidence":"pay_cli_exit_0_status_unavailable","raw_status_code":null}
- accepted_queued_sent_detection: true
- provider_message_id: null
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"provider_message_id_missing","severity":"warning","affects_core_semantics":false,"detail":"Paid execution returned no provider message id."},{"code":"recipient_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical recipient."},{"code":"subject_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical subject."},{"code":"inbox_delivery_unverified","severity":"warning","affects_core_semantics":false,"detail":"Provider accepted/queued send intent, but inbox receipt was not independently verified."},{"code":"email_delivery_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms send semantics for canonical delivery fields."}]
- caveat_codes: ["status_code_unavailable","provider_message_id_missing","recipient_unconfirmed","subject_unconfirmed","inbox_delivery_unverified","email_delivery_semantics_partial"]
- evidence_health: caveated
- first_route_status_evidence: pay_cli_exit_0_status_unavailable
- fallback_skipped_due_to_missing_username: false
- conclusion: paid execution succeeded and accepted send semantics were detected, but canonical recipient/subject and inbox delivery were not independently confirmed.

Notes:
- Route promotion to verified/proven is allowed only when paid execution succeeds with clear send semantics.
- This artifact does not mark the full communications lane recorded and does not run a 5-run benchmark.
