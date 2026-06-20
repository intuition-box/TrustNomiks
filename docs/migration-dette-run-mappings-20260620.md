# Migration debt — `intuition_run_*_mappings` tables (2026-06-20)

> Status: **OPEN — no migration drafted.** This note documents a schema/code gap
> precisely so a human can pick the correct resolution path. No DDL is fabricated
> here because the production schema for these tables is unknown (they do not
> exist in prod, see below).

## The gap in one sentence

Application code reads from and writes to three tables —
`intuition_run_atom_mappings`, `intuition_run_claim_mappings`,
`intuition_run_provenance_mappings` — that **no migration in `supabase/migrations/`
creates** and that the **2026-06-20 production audit confirms do not exist in prod**
(HTTP 404 / `PGRST205` "Could not find the table ... in the schema cache").

## What the audit found

| Table | Audit result | Exists in prod? |
|---|---|---|
| `intuition_run_atom_mappings` | 404 (`PGRST205`) | **NO** |
| `intuition_run_claim_mappings` | 404 (`PGRST205`) | **NO** |
| `intuition_run_provenance_mappings` | 404 (`PGRST205`) | **NO** |
| `intuition_atom_mappings` | 200, has rows | yes |
| `intuition_claim_mappings` | 200, has rows | yes |
| `intuition_provenance_mappings` | 200, has rows | yes |

The 404s are genuine "table not found" errors, **not** RLS or permission denials —
PostgREST even hints at the existing non-`run` variants. Production ships only the
**non-`run`-flavored** mapping tables, and those contain data.

## What the code expects

Two route files reference the missing `_run_` tables:

### 1. `src/app/api/intuition/publish-runs/route.ts` — WRITES

Best-effort "snapshot" upserts, one helper per table:

- `upsertRunAtomSnapshots()` → `.from('intuition_run_atom_mappings').upsert(rows, { onConflict: 'run_id,atom_id' })`
- `upsertRunClaimSnapshots()` → `.from('intuition_run_claim_mappings').upsert(rows, { onConflict: 'run_id,triple_id' })`
- `upsertRunProvenanceSnapshots()` → `.from('intuition_run_provenance_mappings').upsert(rows, { onConflict: 'run_id,triple_id,source_atom_id' })`

These are intentionally non-fatal: both the incremental `handleChunk` path
(`console.warn('Best-effort run … snapshot skipped', …)`) and the legacy
`handleLegacyPersist` path (`console.error('Failed to upsert run … snapshots', …)`)
swallow the returned error and continue. So in production today **every snapshot
write silently fails** (the table is absent) while the primary writes to
`intuition_atom_mappings` / `intuition_claim_mappings` / `intuition_provenance_mappings`
still succeed.

### 2. `src/app/api/intuition/runs/[runId]/route.ts` — READS

`loadSnapshotMappings()` selects from all three `_run_` tables filtered by `run_id`.
This is the **first-choice** data source for the per-run drill-down view
(`snapshotSource = 'run_snapshot'`). Because the tables are missing in prod, this
query returns no rows, and the route falls through its documented fallback chain:

1. `loadSnapshotMappings()` → `intuition_run_*_mappings` (**missing in prod → empty**)
2. `loadMappingsByRunId()` → `intuition_*_mappings` filtered by `run_id`
   (`run_id` column added by `20260424_add_run_id_to_intuition_mappings.sql`) →
   `snapshotSource = 'legacy_run_id'`
3. `loadMappingsByRunWindow()` → `intuition_*_mappings` filtered by
   `created_by` + `chain_id` + `created_at` window → `snapshotSource = 'legacy_window'`

So reads currently **degrade gracefully** to the legacy paths; the immutable
per-run snapshot feature is effectively dead in prod. The expected columns for the
`_run_` tables can be inferred from the upsert row shapes in `publish-runs/route.ts`
and the select lists in `runs/[runId]/route.ts`, but the **authoritative prod
schema is unknown** (the tables were never migrated), so no `CREATE TABLE` is
written here.

## Confirmation: no migration creates these tables

`grep -rln 'intuition_run_atom_mappings|intuition_run_claim_mappings|intuition_run_provenance_mappings' supabase/`
returns **nothing**. The only references in the repo are the two route files above.
The related migration `20260424_add_run_id_to_intuition_mappings.sql` adds a `run_id`
column to the **non-`run`** tables (`intuition_atom_mappings` etc.) — it does **not**
create the `_run_` snapshot tables.

## Two resolution paths (pick one — do not do both)

### Path A — Create the tables (make prod match the code)

Add a migration that creates `intuition_run_atom_mappings`,
`intuition_run_claim_mappings`, `intuition_run_provenance_mappings` with the
columns + unique constraints the code's `onConflict` clauses require
(`run_id,atom_id` / `run_id,triple_id` / `run_id,triple_id,source_atom_id`),
plus RLS in the same pattern as the other Intuition tables (authenticated read,
owner insert/update on `auth.uid() = created_by`).

- **Prerequisite:** export the real prod schema first if any environment already
  has these tables (none found via the audit, but verify other environments) and
  version it, so the migration reflects reality instead of a guess. If no
  environment has them, the migration is purely additive and the inferred shape
  from the route files is the source of truth.
- **Pro:** restores the immutable per-run snapshot feature as designed.
- **Con:** new tables to maintain; must keep RLS + columns in lock-step with the
  route helpers.

### Path B — Fix the code (make the code match prod)

Delete the three `upsertRun*Snapshots` helpers and the `loadSnapshotMappings`
first-choice read, so the routes rely solely on the already-working
`intuition_*_mappings` tables via `run_id` (`loadMappingsByRunId`) and the
time-window fallback. `snapshotSource = 'run_snapshot'` and its UI affordance
would be removed.

- **Pro:** no new schema; removes code that fails silently on every run today.
- **Con:** loses the "immutable snapshot vs. mutable upserted mapping" distinction
  — a later republish that upserts `intuition_*_mappings` can overwrite a row's
  `tx_hash`/`status`, which is exactly the drift the snapshot tables were meant to
  freeze (see the rationale comment in `20260424_add_run_id_to_intuition_mappings.sql`).

## Recommendation

Decide intent before writing DDL. If the immutable-snapshot guarantee matters for
auditability of historical runs, take **Path A** (export/verify schema, then
version a real migration). If it does not, take **Path B** and remove the dead,
silently-failing code. Either way, **no table should be created from a guessed
schema** — hence no `CREATE TABLE` is committed in this debt note.
