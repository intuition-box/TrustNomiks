-- ============================================================================
-- DRAFT, defense-in-depth. Owner-scoped WRITE policies for the token child
-- tables. Review the caveat below before applying. NOT YET APPLIED.
-- ============================================================================
--
-- Context (2026-06-20 read-only prod audit):
--   The app writes to these tables ONLY through SECURITY DEFINER RPCs
--   (save_supply_metrics_tx / save_allocations_tx / save_vesting_schedules_tx /
--   save_emission_model_tx / save_data_sources_tx) which already enforce
--   ownership. RLS on these tables blocks anonymous reads. What could NOT be
--   verified from the repo (their CREATE TABLE / policies live in the base
--   schema, not in supabase/migrations/, and the child tables have no owner
--   column) is whether a DIRECT PostgREST write by an authenticated NON-owner
--   is blocked. If a permissive write policy exists, that is a cross-tenant
--   write hole (same class as the risk_flags issue fixed earlier).
--
--   Reads are intentionally cross-tenant (the dashboard / token-house show every
--   token to any authenticated user), so this migration touches WRITES ONLY.
--
-- ⚠️ OR-SEMANTICS CAVEAT: PostgreSQL permissive policies are OR-combined. Adding
--   these owner-scoped policies is always SAFE (a user can only write their own
--   rows) but it does NOT override an EXISTING permissive write policy. First run
--   the introspection query below; if any of these tables already has an
--   INSERT/UPDATE/DELETE policy whose qual/with_check is `true` (or otherwise not
--   owner-scoped), DROP it as well, or this hole stays open.
--
--   SELECT tablename, cmd, policyname, qual, with_check FROM pg_policies
--   WHERE tablename IN ('supply_metrics','allocation_segments','vesting_schedules',
--     'emission_models','data_sources','tokens','profiles','risk_flags')
--   ORDER BY tablename, cmd;
--
-- Idempotent: ENABLE RLS is a no-op if already on; each policy is created only
-- when absent (so re-running, or running over a base schema that already has
-- equivalent owner policies, is harmless).
-- ============================================================================

BEGIN;

-- ── Helper note ──────────────────────────────────────────────────────────────
-- Token-scoped child tables share one ownership predicate:
--   token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())
-- vesting_schedules is one hop deeper (via allocation_segments).

-- supply_metrics / allocation_segments / emission_models / data_sources
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['supply_metrics','allocation_segments','emission_models','data_sources'];
  cmd text;
  cmds text[] := ARRAY['INSERT','UPDATE','DELETE'];
  pname text;
  predicate text := 'token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())';
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOREACH cmd IN ARRAY cmds LOOP
      pname := format('%s: owner can %s', t, lower(cmd));
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = pname) THEN
        IF cmd = 'INSERT' THEN
          EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (%s)', pname, t, predicate);
        ELSIF cmd = 'UPDATE' THEN
          EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', pname, t, predicate, predicate);
        ELSE
          EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (%s)', pname, t, predicate);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- vesting_schedules (owner via allocation_segments → tokens.created_by)
DO $$
DECLARE
  cmd text;
  cmds text[] := ARRAY['INSERT','UPDATE','DELETE'];
  pname text;
  predicate text := 'allocation_id IN (SELECT a.id FROM allocation_segments a JOIN tokens t ON t.id = a.token_id WHERE t.created_by = auth.uid())';
BEGIN
  ALTER TABLE vesting_schedules ENABLE ROW LEVEL SECURITY;
  FOREACH cmd IN ARRAY cmds LOOP
    pname := format('vesting_schedules: owner can %s', lower(cmd));
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vesting_schedules' AND policyname = pname) THEN
      IF cmd = 'INSERT' THEN
        EXECUTE format('CREATE POLICY %I ON vesting_schedules FOR INSERT TO authenticated WITH CHECK (%s)', pname, predicate);
      ELSIF cmd = 'UPDATE' THEN
        EXECUTE format('CREATE POLICY %I ON vesting_schedules FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', pname, predicate, predicate);
      ELSE
        EXECUTE format('CREATE POLICY %I ON vesting_schedules FOR DELETE TO authenticated USING (%s)', pname, predicate);
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
