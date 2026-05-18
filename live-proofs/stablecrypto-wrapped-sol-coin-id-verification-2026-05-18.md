# StableCrypto Wrapped SOL Coin ID Verification

- generated_at: 2026-05-18
- provider_id: merit-systems/stablecrypto/market-data
- route_tested: `POST https://stablecrypto.dev/api/coingecko/coin`
- canonical_target:
  - network: `solana`
  - symbol: `SOL`
  - address: `So11111111111111111111111111111111111111112`

## Candidate IDs Tested
- `wrapped-solana`
- `solana`
- `wrapped-sol`

## Request Bodies
- `{"id":"wrapped-solana"}`
- `{"id":"solana"}`
- `{"id":"wrapped-sol"}`

## Unpaid Probe Results (safe probes)

### `wrapped-solana`
- method/path: `POST /api/coingecko/coin`
- request_body: `{"id":"wrapped-solana"}`
- status_code: `402`
- payment_required_header: `true`
- www_authenticate_header: `true`
- matched_path: `/api/coingecko/coin`

### `solana`
- method/path: `POST /api/coingecko/coin`
- request_body: `{"id":"solana"}`
- status_code: `402`
- payment_required_header: `true`
- www_authenticate_header: `true`
- matched_path: `/api/coingecko/coin`

### `wrapped-sol`
- method/path: `POST /api/coingecko/coin`
- request_body: `{"id":"wrapped-sol"}`
- status_code: `402`
- payment_required_header: `true`
- www_authenticate_header: `true`
- matched_path: `/api/coingecko/coin`

## Paid Execution Results (safe `pay_cli` flow)

### `wrapped-solana`
- command_shape: `pay curl 'https://stablecrypto.dev/api/coingecko/coin' -X POST -H 'Content-Type: application/json' -d '{"id":"wrapped-solana"}'`
- metadata fields observed:
  - `id`: `wrapped-solana`
  - `name`: `Wrapped SOL`
  - `symbol`: `sol`
  - `image`: present (`thumb/small/large`)
  - `platforms.solana`: `So11111111111111111111111111111111111111112`
  - `detail_platforms.solana.contract_address`: `So11111111111111111111111111111111111111112`
  - `detail_platforms.solana.decimal_place`: `9`
- extracted_solana_platform_address: `So11111111111111111111111111111111111111112`
- extracted_decimals: `9`
- address_equals_canonical: `true`
- classification: `canonical_identity_verified`

### `solana`
- command_shape: `pay curl 'https://stablecrypto.dev/api/coingecko/coin' -X POST -H 'Content-Type: application/json' -d '{"id":"solana"}'`
- metadata fields observed:
  - `id`: `solana`
  - `name`: `Solana`
  - `symbol`: `sol`
  - `image`: present (`thumb/small/large`)
  - `platforms.solana`: not present
  - `detail_platforms.solana.contract_address`: not present
  - `detail_platforms.solana.decimal_place`: not present
- extracted_solana_platform_address: `null`
- extracted_decimals: `null`
- address_equals_canonical: `false`
- classification: `metadata_capable_but_identity_ambiguous`

### `wrapped-sol`
- command_shape: `pay curl 'https://stablecrypto.dev/api/coingecko/coin' -X POST -H 'Content-Type: application/json' -d '{"id":"wrapped-sol"}'`
- paid response: `{"success":false,"error":"coin not found"}`
- metadata fields observed:
  - `name`: absent
  - `symbol`: absent
  - `id/source_id`: absent
  - `image`: absent
  - `detail_platforms.solana.contract_address`: absent
  - `platforms.solana`: absent
  - `detail_platforms.solana.decimal_place`: absent
- extracted_solana_platform_address: `null`
- extracted_decimals: `null`
- address_equals_canonical: `false`
- classification: `rejected_non_metadata`

## Exact Request Body That Returns Canonical Wrapped SOL Solana Address
`{"id":"wrapped-solana"}`

## Final Classification
- canonical match found: `yes`
- canonical match candidate: `wrapped-solana`
- classification summary:
  - `wrapped-solana`: `canonical_identity_verified`
  - `solana`: `metadata_capable_but_identity_ambiguous`
  - `wrapped-sol`: `rejected_non_metadata`

## Status Flags
- normalization_ready: `true` (for canonical Wrapped SOL identity extraction using `id=wrapped-solana`)
- benchmark-ready: `false` (no benchmark artifact created in this run)

## Caveats
- `pay_cli` output does not reliably expose HTTP status lines for paid calls; paid evidence here is based on parsed response bodies.
- `id=solana` yields rich coin metadata but no deterministic Solana mint mapping in `platforms/detail_platforms`.
- This verification did not create benchmark artifacts, did not modify Radar, and does not claim a winner.

## Recommended Next Step
Lock StableCrypto canonical identity extraction for Wrapped SOL to `POST /api/coingecko/coin` with `{"id":"wrapped-solana"}` and enforce a strict gate requiring `detail_platforms.solana.contract_address == So11111111111111111111111111111111111111112` before any benchmark promotion.
