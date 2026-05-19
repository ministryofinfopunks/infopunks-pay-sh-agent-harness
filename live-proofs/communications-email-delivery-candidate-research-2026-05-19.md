# Communications Email Delivery Candidate Research (2026-05-19)

## Proposed benchmark_id
`communications-email-delivery`

## Benchmark intent
Send or simulate/send a plain-text email through a paid Pay.sh communications provider.

## Canonical input
```yaml
to: controlled test inbox or configured env var BENCHMARK_EMAIL_TO
subject: "Infopunks Radar benchmark"
body: "Radar benchmark delivery test."
```

## Required normalized fields
- `accepted: boolean`
- `provider_message_id: string | null`
- `delivery_status: accepted | queued | sent | unknown`
- `recipient_match: boolean`
- `subject_match: boolean`

## Harness + catalog utilities inspected
- Harness route inventory: `src/providerEndpointMap.ts`
- Harness catalog client: `src/payShClient.ts` (`/providers` fetch + fallback mock)
- Intake and promotion gate: `docs/provider-intake.md`
- Pay catalog/provider discovery via local CLI metadata:
  - `pay skills search email --json`
  - `pay skills search inbox --json`
  - `~/.config/pay/skills/skills-1779169554-0c3c8cc0.json`

## Candidate providers
1. `agentmail/email` (AgentMail), category `messaging`
2. `merit-systems/stableemail/email` (StableEmail), category `messaging`

## Candidate routes (catalog-discovered; not hardcoded)

| provider_id | route | method | discoverable in catalog metadata | unpaid probe result | appears comparable to benchmark intent |
| --- | --- | --- | --- | --- | --- |
| `merit-systems/stableemail/email` | `https://stableemail.dev/api/send` | `POST` | yes (`pay skills search email --json`) | `402 Payment Required` observed on unpaid probe; challenge includes payment options and schema | yes (direct plain outbound send) |
| `merit-systems/stableemail/email` | `https://stableemail.dev/api/inbox/send` | `POST` | yes (`pay skills search inbox --json`) | `402 Payment Required` observed on unpaid probe; challenge includes schema requiring `username`, `to`, `subject` | partial (send intent, but inbox identity prerequisite) |
| `agentmail/email` | `https://x402.api.agentmail.to/v0/inboxes/{inbox_id}/messages/send` | `POST` | yes (`pay skills search email --json`) | probe with dummy inbox id returned `403` ownership error (no x402 challenge on this invalid resource path) | partial (send intent, but owned inbox prerequisite and resource coupling) |
| `agentmail/email` | `https://x402.api.agentmail.to/v0/inboxes` | `GET` | yes (already in `providerEndpointMap`) | `402 Payment Required` observed on unpaid probe; previously paid-proven in harness | no (read/list inboxes, not email delivery) |

## Method and request shape (discoverable)
- StableEmail `/api/send` (`POST`, JSON): challenge schema indicates `to` (email array), `subject`, optional `text`/`html`, optional attachments.
- StableEmail `/api/inbox/send` (`POST`, JSON): challenge schema indicates `username`, `to`, `subject`, optional `text`/`html`, optional attachments.
- AgentMail `/v0/inboxes/{inbox_id}/messages/send` (`POST`, JSON): endpoint discovered from catalog metadata; unpaid probe on dummy inbox id hit ownership guard before payment challenge.

## Comparable-route assessment against hard bar
- Two comparable routes for **email delivery intent** are discoverable in metadata (`StableEmail send` and `AgentMail send`).
- But they are **not both paid-proven through this harness** today.
- Current harness paid proof for communications is read-only AgentMail inbox list (`agentmail-read-inboxes-v0`), not send.
- No 5-run benchmark artifact exists for `communications-email-delivery`.

## Risks / caveats
- Side effects: this lane is write/send; must use controlled recipient only.
- Ownership/setup prerequisites differ by provider (AgentMail inbox ownership, StableEmail username/inbox model), so canonical-input adapter policy is required before fair comparison.
- `BENCHMARK_EMAIL_TO` is not currently defined in `.env.example`; safe recipient configuration is not yet scaffolded in repo env docs.
- Unpaid probes prove route/payment-gate discoverability, not paid execution success.
- Evidence-health fields and caveat_objects schema are not yet implemented for this lane artifact set.

## Hard-bar verdict
- `two comparable routes paid-proven through Harness`: **fail**
- `same canonical input across both routes`: **not yet**
- `normalizable comparable fields`: **possible, but unproven**
- `5-run benchmark artifact exists`: **fail**
- `caveat_objects structured`: **fail (for this lane)**
- `evidence_health derivable per route`: **not yet for this lane**
- `winner_claimed remains false`: **pass (no winner claim made)**
- `Radar does not execute paid APIs directly`: **pass (harness pattern unchanged)**

## Recommendation
`keep scaffold`

Do not promote to recorded yet.  
Next gating steps:
1. Add two explicit send-route mappings (one per provider) with safe test recipient contract.
2. Run paid proof for both routes through harness using identical canonical input (`BENCHMARK_EMAIL_TO`, fixed subject/body).
3. Add normalization adapter for required fields (`accepted`, `provider_message_id`, `delivery_status`, `recipient_match`, `subject_match`).
4. Produce 5-run benchmark artifact with structured `caveat_objects`, per-route `evidence_health`, and `winner_claimed: false`.

## AgentMail second-route paid verification update
- second_route_blocked: true
- blocker: ownership_guard_or_missing_config
- recommendation: find alternate communications provider or keep scaffold

## Radar scaffold status update (2026-05-19)
- lane_status: scaffold
- benchmark_recorded: false
- benchmark_artifact_created: false
- winner_claimed: false
- mapping_target:
  - StableEmail: paid-executed, route_state=`verified/proven`, evidence_health=`caveated`
  - AgentMail: verifier ready, status=`candidate/unproven`, blocked by `AGENTMAIL_INBOX_ID` / inbox ownership configuration
  - Alternate second route: none found in current catalog metadata for comparable outbound email send semantics
- promotion_gate: blocked until a second comparable paid-proven route exists and a 5-run artifact is produced
- preserved_counters:
  - recorded_benchmarks: 3
  - total_artifacts: 4
  - total_recorded_runs: 20
  - proven_routes: 6
  - winner_claimed: false
