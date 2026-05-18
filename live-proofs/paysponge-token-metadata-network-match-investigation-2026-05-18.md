# PaySponge Token Metadata Network Match Investigation (2026-05-18)

## Summary
`canonical_network_match_rate=0.0` for the PaySponge token-metadata route was caused by benchmark normalization/evaluation treating `network` as payload-only and not populating it from deterministic route context, even though the route path is chain-scoped (`/networks/solana/...`).

## Route Inspected
- Method: `GET`
- Route: `https://pro-api.coingecko.com/api/v3/x402/onchain/networks/solana/tokens/So11111111111111111111111111111111111111112`
- Route context network segment: `solana`

## Canonical Asset
- name: `Wrapped SOL`
- network: `solana`
- address: `So11111111111111111111111111111111111111112`
- decimals: `9`
- symbol: `SOL`

## Observed PaySponge Payload Network Fields
From existing verified/proven evidence (`live-proofs/paysponge-coingecko-token-metadata-verification-2026-05-18.md`):
- Explicit payload field `data.attributes.network`: not documented as present.
- Network evidence observed indirectly:
  - route path contains `/networks/solana/`
  - payload identity includes `data.id` prefix pattern `solana_...` (documented in proof notes)
- Address and decimals fields are directly present and matched canonically.

## Normalization Logic Inspected
Artifacts inspected:
- `live-proofs/token-metadata-normalization-adapter-proof-2026-05-18.md`
- `live-proofs/finance-data-token-metadata-benchmark-runs-2026-05-18.md`
- `live-proofs/paysponge-coingecko-token-metadata-verification-2026-05-18.md`

Key inconsistency:
- Adapter proof defines PaySponge normalization as `network = "solana" (fixed by route path segment)`.
- Recorded benchmark runs state PaySponge normalized `network` was not present in extracted payload path, yielding `canonical_network_match=false` in all 5 runs.

## Why `canonical_network_match_rate` Was `0.0`
Primary root cause: evaluation in the recorded benchmark path effectively required network presence from extracted payload fields and did not apply route-context inference (`/networks/solana/...`) during metric computation.

This aligns with:
1. Payload may not expose a dedicated `network` field.
2. Route context does encode network deterministically.
3. Recorded metric behavior matches payload-only checking.

## Is Route-Path Network Inference Valid?
Yes, for this specific route template it is deterministic and valid:
- The path schema is network-scoped: `/onchain/networks/{network}/tokens/{address}`.
- For the tested route, `{network}` is explicitly `solana`.
- No ambiguity exists for this call because chain is part of the request identity, not inferred heuristically.

## Recommended Fix
Recommended path: **update normalization logic to support deterministic route-context network extraction** for network-scoped routes, while preserving transparency.

Implementation policy:
- Preferred extraction order:
  1. explicit payload network field (if present)
  2. deterministic route-context network segment
  3. null
- Track provenance in normalization metadata (payload vs route_context) so metrics remain auditable.

Caveat strategy:
- Keep `canonical_network_mismatch` for real disagreements.
- Add/allow a distinct caveat code such as `route_context_inferred_network` when canonical network match depends on route context instead of explicit payload field.

## Should Existing Radar Caveat Remain?
Yes, for already recorded benchmark evidence it should remain unchanged.
- Do not rewrite historical benchmark artifacts.
- Do not retroactively alter recorded Radar evidence.

For a future benchmark rerun after normalization update:
- PaySponge `canonical_network_match_rate` would be expected to improve from `0.0` to `1.0` for this route, assuming same route template and canonical asset.

## Caveats
- This investigation did not rerun paid calls.
- `proofs/` raw artifacts were not copied into committed evidence.
- Repository currently does not expose a dedicated `src` token-metadata benchmark runner containing this metric logic; conclusions are derived from existing proof artifacts and documented normalization rules.
