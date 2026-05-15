# Provider Intake Workflow

The Provider Intake Kit standardizes candidate route verification before any manual mapping update.

## Intake Ladder

1. Identify provider in Pay.sh catalog.
2. Confirm service URL.
3. Discover registered endpoint.
4. Confirm safe body/headers.
5. Run unpaid 402 check if relevant.
6. Run `npm run verify:mapping`.
7. Review `applicationSuccess` and output shape.
8. Only promote `verified_pay_cli_success` if strict gate passes.
9. Add mapping manually.
10. Run `npm run mappings:status`, `npm run typecheck`, `npm test`, and `npm run build`.
11. Optional: update Radar backend coverage if preflight cannot route it.

## Warnings

- Do not trust pay-cli `exitCode` alone.
- Do not trust parsed JSON alone.
- Do not promote top-level error JSON.
- Do not run SMS/email/send/write routes unless explicitly intentional.
- Use status/read-only paths first.

## Status Vocabulary

- `candidate_pending`: Intake drafted but verification gate not passed.
- `verified_402`: Unpaid 402 challenge confirmed, paid success not yet confirmed.
- `verified_pay_cli_success`: Paid route passed strict gate and expected output shape.
- `intermittent_pay_cli_success`: Sometimes passes gate but unstable across runs.
- `rejected`: Route is invalid, unsafe, or consistently returns application-level errors.
- `needs_endpoint_fix`: Provider is valid but mapped endpoint/body/header is wrong.
- `settlement_failed`: x402 path exists but payment/settlement did not complete.

## Promotion Gate

All must pass before manually promoting to `verified_pay_cli_success`:

- pay CLI exitCode must be 0
- parsed JSON must be available
- applicationSuccess must be true
- output shape validator must pass
- no top-level application error
- side-effectful routes must not execute by default

## Command Helper

Use a JSON intake file and generate the exact verification command:

```bash
npm run intake:command -- provider-intake.examples/perplexity-search.json
```

The helper does not update mappings. It only generates a copy-paste `VERIFY_*` command and warns for side-effectful routes.
