# Communications Email Delivery AgentMail Paid Verification

- benchmark_id: communications-email-delivery
- provider: AgentMail
- prior_probe_note: dummy inbox returned 403 ownership_guard
- configured_inbox_used: false
- configured_inbox_route_redacted: https://x402.api.agentmail.to/v0/inboxes/[MISSING]/messages/send
- endpoint: https://x402.api.agentmail.to/v0/inboxes/[MISSING]/messages/send
- method: POST
- canonical_input_hash: unavailable_missing_safety_gate
- paid_execution_status: failed
- cli_exit_code: null
- status_evidence: AGENTMAIL_INBOX_ID_missing
- normalized_output: {"accepted":null,"provider_message_id":null,"delivery_status":null,"recipient_match":null,"subject_match":null,"body_match":null,"status_evidence":"status_unavailable","raw_status_code":null}
- caveat_objects: [{"code":"status_code_unavailable","severity":"warning","affects_core_semantics":false,"detail":"HTTP status code was not available in execution output."},{"code":"email_delivery_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms send semantics for canonical delivery fields."}]
- evidence_health: unverified
- conclusion: candidate/unproven
