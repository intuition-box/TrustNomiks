---
name: supabase-migrations
description: Use when creating or modifying Supabase schema — tables, views, functions, policies, or any file in supabase/migrations/. Enforces this repo's migration conventions and the RLS/grants checklist.
---

# Supabase Migrations & RLS (TrustNomiks)

## Repo conventions (binding)

- Migrations live in `supabase/migrations/`, named `YYYYMMDD_short_name.sql`. Filename order is
  the only ordering guarantee — never backdate a file or reuse an earlier date once a later
  migration exists. Multiple same-day files sort alphabetically by name; name them so that order
  is correct (see `20260709_harden_kg_views_and_function_grants.sql` before
  `20260709_revoke_public_execute_definer_functions.sql`).
- Applied **manually** via the Supabase Studio SQL Editor. There is **no local Supabase CLI
  stack** in this repo — never suggest `supabase start`, `supabase db push`, `supabase db reset`,
  or `supabase migration up/new`. The committed `.sql` file is still the source of truth even
  though execution is manual: write it first, completely, then hand it off for the operator to
  paste into the SQL Editor.
- One logical schema change per migration file. Don't fold unrelated changes together.

## Pre-flight checklist — every migration touching schema

Incident reference: `docs/rls-audit-20260709.md`. Read it before writing DDL that touches
tables, views, or `SECURITY DEFINER` functions — every rule below traces to a real production
exposure found there.

1. **New table → RLS ships in the SAME migration.** Never leave policies for a follow-up.
   Minimum: `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` plus explicit policies matching the real
   access model (owner-scoped `auth.uid()`, or collaborative-read `USING (true)` restricted
   `TO authenticated` — never grant `anon`). A missing policy on a write action denies silently
   rather than opening access; confirm that's the intent before shipping.
2. **Views → always `WITH (security_invoker = true)`.** Plain views run as their owner, bypass
   RLS on the underlying tables, and Supabase grants them to `anon` by default — this is exactly
   how finding F1 (2026-07-09) leaked wallet addresses and unvalidated drafts anonymously.
   `CREATE VIEW foo WITH (security_invoker = true) AS ...`, or
   `ALTER VIEW foo SET (security_invoker = true);` on an existing view.
3. **`SECURITY DEFINER` functions → `REVOKE EXECUTE FROM PUBLIC`, not just `anon`.** Postgres
   grants `EXECUTE` to `PUBLIC` by default and `anon`/`authenticated` inherit from `PUBLIC` —
   revoking `anon` alone is a no-op (confirmed in the audit: `pg_proc.proacl` still showed
   `=X/postgres` after an `anon`-only revoke). Always
   `REVOKE EXECUTE ON FUNCTION public.fn(...) FROM PUBLIC;` then re-`GRANT EXECUTE ... TO
   authenticated` (or `service_role`) only where genuinely needed.
4. **Pin `search_path` on every `SECURITY DEFINER` / trigger function**: `SET search_path =
   public` in the function definition. A mutable search_path is a privilege-escalation vector
   (this is what advisor `0011` flags).
5. **Grants control who can call it; the function body must still check `auth.uid()`** against
   the row it touches. Don't rely on REVOKE/GRANT alone for authorization.
6. New objects in `public` get default `anon`/`PUBLIC` grants from Postgres/Supabase regardless
   of RLS — don't assume RLS alone contains a view or function; verify grants explicitly.

## Workflow

1. Read affected tables/views/functions first (`mcp__supabase__list_tables`, or grep prior
   migrations under `supabase/migrations/`) — match existing naming and policy style.
2. Write `supabase/migrations/YYYYMMDD_short_name.sql` with the full change: DDL + RLS + grants
   in one file.
3. Hand off for manual execution in the Supabase Studio SQL Editor — do not apply DDL any other
   way against this project's remote database.
4. **After every applied DDL change, verify with the MCP server:**
   - `mcp__supabase__get_advisors` (security) — expect no new ERROR/WARN. Compare against the
     accepted baseline in `docs/rls-audit-20260709.md`: `0024` (pin-cache writable by any
     authenticated user) and `0029` (authenticated EXECUTE on definer RPCs) are intentionally
     accepted; everything else should be clean.
   - Targeted `pg_catalog` checks via `mcp__supabase__execute_sql` when the advisor doesn't cover
     it directly — e.g. `select relacl from pg_class where relname = '<view>'` to confirm no
     `anon` grant, or `select proacl from pg_proc where proname = '<fn>'` to confirm `PUBLIC` was
     actually revoked. In the 2026-07-09 incident, `pg_proc.proacl` is what proved an anon-only
     revoke had been a no-op — `pg_catalog` is ground truth for grants.
   - `mcp__supabase__list_tables` to confirm `rls_enabled = true` on any new table.

## Vendored reference skills

Two official Supabase agent skills are vendored under `.claude/skills/` (from
`github.com/supabase/agent-skills`, MIT):

- `.claude/skills/supabase/` — general Supabase skill: RLS/views/`SECURITY DEFINER` checklist,
  auth pitfalls, CLI, MCP. Its "Making and Committing Schema Changes" section assumes a **local**
  CLI stack (`supabase db query`, `migration new`, `db pull`) — that part does not apply here;
  skip straight to hand-writing the migration file per the workflow above.
- `.claude/skills/supabase-postgres-best-practices/` — Postgres performance/security rule
  library. See especially `references/security-rls-basics.md`,
  `references/security-rls-performance.md`, and `references/security-privileges.md` for RLS and
  least-privilege patterns, plus `references/schema-*.md` when a migration adds tables/columns.

Read both for depth; this file is the binding, repo-specific version of their guidance.
