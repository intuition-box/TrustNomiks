# Reprise Runbook — manual / wallet steps (2026-06-20)

Everything that could be implemented in code is committed on `main`. This runbook
covers the steps that require **your Supabase SQL editor** or **your funded testnet
wallet** — they can't be done from the agent.

## 1. Apply pending Supabase migrations (SQL editor)

Migrations are applied manually in this repo. Apply in this order:

| Migration | Status | Why |
|---|---|---|
| `supabase/migrations/20260620_add_save_risk_flags_tx.sql` | **Required** | Without it, the Risk Flags **Save** errors (`function not found`). The detail-page read view + export already work without it. |
| `supabase/migrations/20260620_enable_rls_profiles.sql` | DRAFT — review first | Enables RLS on `profiles` (`user_id = auth.uid()`). The table is empty so its RLS state was unverifiable from data. |
| `supabase/migrations/20260620_enable_rls_risk_flags.sql` | DRAFT — review first | Enables RLS on `risk_flags` via the `token_id → tokens.created_by` chain. |

The audit confirmed the **populated** business tables (`tokens`, `supply_metrics`,
`allocation_segments`, `vesting_schedules`, `emission_models`, `data_sources`)
already block anon reads — no emergency RLS work.

> No migration is needed for the run-mappings fix: it was a pure code fix
> (`3e38ca5`) repointing to the existing `intuition_*_mappings` tables, whose
> `run_id` column is already live in prod (`20260424`).

## 2. Mint the 5 missing canonical predicates (wallet)

`npm run intuition:audit-predicates` found 5 predicates pinned to IPFS but never
minted on-chain (testnet): **has_contract_address, has_initial_supply,
has_wallet_address, has_annual_inflation_rate, has_version**. Any triple using
them reverts with `MultiVault_TermDoesNotExist`, so tokens carrying those fields
have incomplete on-chain triples.

```bash
npm run intuition:mint-missing-predicates   # prints an UNSIGNED createAtoms tx (≈0.005 tTRUST)
```

Broadcast the printed `{to, data, value, chainId}` with your wallet (cast / wallet
MCP / the app). The script re-derives the missing set live, so re-run it right
before broadcasting (the shared testnet may have minted some meanwhile). Verify
after:

```bash
npm run intuition:audit-predicates          # expect HEALTHY 28 / NOT_CREATED 0
```

## 3. Verify the `AtomExists` race fix end-to-end (wallet)

The **read foundation** is already verified (`npm run intuition:verify-reads`:
multicall `isTermCreated` works on testnet, agrees with direct reads). The
executor logic has 7 unit tests + a Codex clean bill. The only thing left is a
real on-chain write:

1. `npm run dev`, connect the wallet used for past publishes.
2. Open an already-published token → **Publish / Re-publish**.
3. Expect: the run reports existing atoms as **skipped** (counters show existing),
   the per-chunk recheck fires, and there is **no `MultiVault_AtomExists` abort**.
4. If a revert ever recurs, it is NOT a normalizer bug — inspect the per-chunk
   recheck and the individual-recheck branch in `publish-executor.ts`, and use the
   `/export` drill-down (termId + decoded revert per failed atom).

## 4. Re-publish tokens affected by the missing predicates (wallet, after step 2)

After minting (step 2), re-publish any token whose data includes a contract
address, initial supply, wallet address, annual inflation rate, or version, so the
previously-failed triples for those predicates complete on-chain.

---

## Still open (not blocking, for a later session)

- **Token-routes refactor** — plan in `docs/refactor-plan-token-routes-20260620.md`
  (tokens/new 3294 lines, tokens/[id] 1029 lines). Note: a parallel "Data
  Observatory" redesign is in flight in the working tree — coordinate before
  refactoring the same files.
- **Drill-down immutability** — the run-mappings fix made the drill-down read the
  mutable `intuition_*_mappings` (a republish can re-point rows to a newer run).
  If immutable per-run history matters, version the snapshot tables properly
  (a real migration) instead of the dead `_run_` tables that never existed.
