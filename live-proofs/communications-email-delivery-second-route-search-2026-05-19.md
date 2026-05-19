# Communications Email Delivery Second Route Search (2026-05-19)

- benchmark: communications-email-delivery
- paid_execution_attempted: false
- winner_claimed: false
- benchmark_recorded: false

## Candidate: merit-systems/stableemail/email
- provider: merit-systems/stableemail/email
- category: messaging
- endpoint: https://stableemail.dev/api/inbox/send
- method: POST
- request_shape: {"username":"<stableemail_username>","to":["<canonical_to>"],"subject":"<canonical_subject>","text":"<canonical_body>"}
- unpaid_probe_status_evidence: status_code_observed_402
- payment_challenge_detected: true
- ownership_auth_blockers: []
- semantic_fit_for_email_delivery: partial
- caveat_objects: [{"code":"payment_required_confirmed_only","severity":"info","affects_core_semantics":false,"detail":"Unpaid payment challenge observed (HTTP 402). Delivery payload remains unobserved."},{"code":"paid_payload_unobserved","severity":"warning","affects_core_semantics":true,"detail":"No paid payload was observed for this route execution evidence."},{"code":"non_json_text_response","severity":"warning","affects_core_semantics":true,"detail":"Response payload was plain text and not structured JSON."},{"code":"recipient_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical recipient."},{"code":"subject_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical subject."},{"code":"email_delivery_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms send semantics for canonical delivery fields."}]
- conclusion: candidate/unproven

## Candidate: merit-systems/stableemail/email
- provider: merit-systems/stableemail/email
- category: messaging
- endpoint: https://stableemail.dev/api/send
- method: POST
- request_shape: {"to":["<canonical_to>"],"subject":"<canonical_subject>","text":"<canonical_body>"}
- unpaid_probe_status_evidence: status_code_observed_402
- payment_challenge_detected: true
- ownership_auth_blockers: []
- semantic_fit_for_email_delivery: yes
- caveat_objects: [{"code":"payment_required_confirmed_only","severity":"info","affects_core_semantics":false,"detail":"Unpaid payment challenge observed (HTTP 402). Delivery payload remains unobserved."},{"code":"paid_payload_unobserved","severity":"warning","affects_core_semantics":true,"detail":"No paid payload was observed for this route execution evidence."},{"code":"non_json_text_response","severity":"warning","affects_core_semantics":true,"detail":"Response payload was plain text and not structured JSON."},{"code":"recipient_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical recipient."},{"code":"subject_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical subject."},{"code":"email_delivery_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms send semantics for canonical delivery fields."}]
- conclusion: verified/unproven

## Candidate: agentmail/email
- provider: agentmail/email
- category: messaging
- endpoint: https://x402.api.agentmail.to/v0/inboxes/{inbox_id}/messages/send
- method: POST
- request_shape: {"to":["<canonical_to>"],"subject":"<canonical_subject>","text":"<canonical_body>"}
- unpaid_probe_status_evidence: status_code_observed_403
- payment_challenge_detected: false
- ownership_auth_blockers: ["ownership_guard"]
- semantic_fit_for_email_delivery: yes
- caveat_objects: [{"code":"ownership_guard","severity":"error","affects_core_semantics":true,"detail":"Provider returned ownership/authorization guard (HTTP 403). Route is gated by resource ownership."},{"code":"recipient_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical recipient."},{"code":"subject_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical subject."},{"code":"email_delivery_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms send semantics for canonical delivery fields."}]
- conclusion: candidate/unproven

## Candidate: agentmail/email
- provider: agentmail/email
- category: messaging
- endpoint: https://x402.api.agentmail.to/v0/inboxes/{inbox_id}/messages/{message_id}/forward
- method: POST
- request_shape: {"to":["<canonical_to>"],"subject":"<canonical_subject>","text":"<canonical_body>"}
- unpaid_probe_status_evidence: status_code_observed_403
- payment_challenge_detected: false
- ownership_auth_blockers: ["ownership_guard"]
- semantic_fit_for_email_delivery: partial
- caveat_objects: [{"code":"ownership_guard","severity":"error","affects_core_semantics":true,"detail":"Provider returned ownership/authorization guard (HTTP 403). Route is gated by resource ownership."},{"code":"recipient_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical recipient."},{"code":"subject_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical subject."},{"code":"email_delivery_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms send semantics for canonical delivery fields."}]
- conclusion: candidate/unproven

## Candidate: agentmail/email
- provider: agentmail/email
- category: messaging
- endpoint: https://x402.api.agentmail.to/v0/inboxes/{inbox_id}/messages/{message_id}/reply
- method: POST
- request_shape: {"to":["<canonical_to>"],"subject":"<canonical_subject>","text":"<canonical_body>"}
- unpaid_probe_status_evidence: status_code_observed_403
- payment_challenge_detected: false
- ownership_auth_blockers: ["ownership_guard"]
- semantic_fit_for_email_delivery: partial
- caveat_objects: [{"code":"ownership_guard","severity":"error","affects_core_semantics":true,"detail":"Provider returned ownership/authorization guard (HTTP 403). Route is gated by resource ownership."},{"code":"recipient_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical recipient."},{"code":"subject_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical subject."},{"code":"email_delivery_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms send semantics for canonical delivery fields."}]
- conclusion: candidate/unproven

## Candidate: agentmail/email
- provider: agentmail/email
- category: messaging
- endpoint: https://x402.api.agentmail.to/v0/inboxes/{inbox_id}/messages/{message_id}/reply-all
- method: POST
- request_shape: {"to":["<canonical_to>"],"subject":"<canonical_subject>","text":"<canonical_body>"}
- unpaid_probe_status_evidence: status_code_observed_403
- payment_challenge_detected: false
- ownership_auth_blockers: ["ownership_guard"]
- semantic_fit_for_email_delivery: partial
- caveat_objects: [{"code":"ownership_guard","severity":"error","affects_core_semantics":true,"detail":"Provider returned ownership/authorization guard (HTTP 403). Route is gated by resource ownership."},{"code":"recipient_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical recipient."},{"code":"subject_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical subject."},{"code":"email_delivery_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms send semantics for canonical delivery fields."}]
- conclusion: candidate/unproven

## Candidate: paysponge/textbelt
- provider: paysponge/textbelt
- category: messaging
- endpoint: https://api.paysponge.com/x402/purchase/svc_d6kszbre4qwg5n4n4/text
- method: POST
- request_shape: {"to":["<canonical_to>"],"subject":"<canonical_subject>","text":"<canonical_body>"}
- unpaid_probe_status_evidence: status_code_observed_402
- payment_challenge_detected: true
- ownership_auth_blockers: []
- semantic_fit_for_email_delivery: no
- caveat_objects: [{"code":"payment_required_confirmed_only","severity":"info","affects_core_semantics":false,"detail":"Unpaid payment challenge observed (HTTP 402). Delivery payload remains unobserved."},{"code":"paid_payload_unobserved","severity":"warning","affects_core_semantics":true,"detail":"No paid payload was observed for this route execution evidence."},{"code":"recipient_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical recipient."},{"code":"subject_unconfirmed","severity":"warning","affects_core_semantics":true,"detail":"Response did not confirm canonical subject."},{"code":"email_delivery_semantics_partial","severity":"warning","affects_core_semantics":true,"detail":"Observed evidence only partially confirms send semantics for canonical delivery fields."}]
- conclusion: rejected

- second_route_blocked: true
- blocker: ownership_guard_or_missing_config_or_no_alternate_provider
- recommendation: find alternate communications provider or keep scaffold
