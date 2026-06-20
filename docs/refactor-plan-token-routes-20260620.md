# Refactor Plan — Oversized Token Route Files (2026-06-20)

**Scope:** behavior-preserving extraction only. No logic, schema, or RPC changes.

- `src/app/(authenticated)/tokens/new/page.tsx` (~3294 lines — the 6-step token form)
- `src/app/(authenticated)/tokens/[id]/page.tsx` (~1029 lines — detail + status/export)

## Key structural finding
`tokens/new` is **not** a wizard with one form per step: it renders all six sections
stacked on one scroll page, each its own `<form>` saving independently via a
`SECURITY DEFINER` RPC (`save_supply_metrics_tx`, `save_allocations_tx`,
`save_vesting_schedules_tx`, `save_emission_model_tx`, `save_data_sources_tx`).
`currentStep === 7` is a separate completion/success screen. `tokens/[id]` is
read-only display + status/delete/export — there is **no inline edit form**
("Edit" is `router.push('/tokens/new?id=…')`).

## Target architecture

```
src/components/token-form/
  token-form-context.tsx      # createContext + useTokenForm() + TokenFormProvider
  use-token-form-state.ts     # all useForm/useFieldArray + state + effects + load fns
  use-token-save-handlers.ts  # onSubmitStep1..6 + handleRpcError + completeness fns
  completeness.ts             # scoring + buildStep4Schedules + buildDefaultAttributions (pure)
  form-helpers.ts             # formatNumber, calculateTokenAmount/Percentage, etc. (pure)
  FormSidebar.tsx · CompletionScreen.tsx · RemovalConfirmDialog.tsx
  steps/Step1Identity..Step6Sources.tsx

src/components/token-detail/
  types.ts · use-token-detail.ts · detail-helpers.ts · claim-sources.tsx
  DetailView.tsx · StatusManager.tsx
```

A shared **form context** owns the six RHF instances, the optimistic-lock timestamp
(`initialUpdatedAt`), `tokenId`, `allocations`, `completedSteps`, the save handlers
and load functions. Each section becomes a presentational component consuming the
context. The page files become thin shells (provider + layout).

## Highest-risk parts (do NOT touch logic)
1. **Optimistic locking** — `initialUpdatedAt` is read at create/edit-load and
   re-written after every save. Must stay a single source of truth in the state hook.
2. **Destructive delete→insert RPCs** — Step3 rebuilds `allocations` from the RPC
   return and reseeds Step4; their state must stay in the shared context.
3. **Step-transition coupling** — Step6 save sets `currentStep(7)`; success screen
   reads `finalScore`.
4. **`handleRpcError`** — single shared error mapper; extract once.
5. **Live-score `.watch()` block** — must stay inside a hook called under the RHF
   provider (watch must run under provider).

## Ordered commits (each independently buildable; `npm run build`+`lint`+`test` green)

**Part A — tokens/new:**
1. Extract pure helpers → `form-helpers.ts` / `completeness.ts`.
2. Introduce `TokenFormProvider` + `useTokenFormState` (keystone — Codex review).
3. Extract `FormSidebar` + `CompletionScreen` + `RemovalConfirmDialog`.
4–9. Extract `Step1Identity` (+ guide sheet) → … → `Step6Sources` (+ attribution matrix).
10. Slim `page.tsx` to a shell (~150 lines).

**Part B — tokens/[id]:**
1. Extract `TokenData` type + helpers + `claim-sources`.
2. Extract `useTokenDetail` hook.
3. Extract `StatusManager` (status/delete/export + downgrade dialog).
4. Extract `DetailView` (read-only cards + local hover state).
5. Slim `page.tsx` (~40 lines).

## Conflict with Risk Flags UI — **recommended order: refactor first, then Risk Flags**
Risk Flags touches the exact same files (a new step in `tokens/new`, a risk card +
the export placeholder in `tokens/[id]`, plus completeness scoring). Doing Risk
Flags first means rebasing a feature over a 10-commit structural refactor across the
same lines. **Exception:** if Risk Flags is already implemented (it is, in the working
tree), land it first, then refactor (the extraction simply absorbs it as another
`steps/` file). Seams that make the later graft trivial: keep `completeness.ts` the
single scoring home, keep nav/cluster arrays data-driven, keep `TokenData` + the
triples-export mapping in `token-detail/types.ts`.

## Verification gate (every commit)
`npm run lint` **and** `npm test`; `npm run build` must pass. Manual diff: create-mode
flow, edit-mode hydration (Part A), status-downgrade + export (Part B). No commit lands red.
