-- ============================================================================
-- SECURITY FIX (DRAFT, not yet applied). Owner-scope all WRITE access.
-- ============================================================================
--
-- The 2026-06-20 pg_policies audit found a real cross-tenant hole: every business
-- table has a permissive policy `USING (true) WITH CHECK (true)` (named
-- "Authenticated users can manage <table>"), and `tokens` has UPDATE/DELETE with
-- `qual = true`. So ANY authenticated user (signup is open) can edit or delete
-- ANY other user's tokens and child rows by calling PostgREST directly, bypassing
-- the app's ownership-checking RPCs. The owner-scoped policies added earlier for
-- profiles/risk_flags are negated by the co-existing permissive ALL (policies are
-- OR-combined).
--
-- This migration DROPS the permissive write policies and installs owner-scoped
-- INSERT/UPDATE/DELETE. READS stay open to authenticated users (shared graph:
-- dashboard / token-house show every token). Safe for the app:
--   - child-table writes (supply_metrics, allocation_segments, vesting_schedules,
--     emission_models, data_sources) go through SECURITY DEFINER RPCs that bypass
--     RLS, so tightening their RLS does not affect the app.
--   - tokens: the app inserts with created_by = auth.uid(), and edits/deletes its
--     own tokens, so owner-scoping matches existing behavior.
--
-- ⚠️ BEHAVIOR CHANGE: writes become owner-only. In particular the token
-- status-change on /tokens/[id] (a direct browser UPDATE) will work ONLY for the
-- token's creator. If a reviewer/curator is meant to change OTHER users' token
-- status, do NOT owner-scope tokens UPDATE here (keep "Authenticated users can
-- update tokens", or gate it on a role) — that needs the roles model that does
-- not exist yet. Decide before applying.
--
-- Idempotent: DROP IF EXISTS + CREATE-only-when-absent.
-- ============================================================================

BEGIN;

-- ── 1. Token-scoped child tables (writes via RPC → safe to tighten) ──────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['supply_metrics','allocation_segments','emission_models','data_sources'];
  predicate text := 'token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())';
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Authenticated users can manage ' || t, t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || ': authenticated read') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || ': authenticated read', t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || ': owner can insert') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (%s)', t || ': owner can insert', t, predicate);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || ': owner can update') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t || ': owner can update', t, predicate, predicate);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || ': owner can delete') THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (%s)', t || ': owner can delete', t, predicate);
    END IF;
  END LOOP;
END $$;

-- ── 2. vesting_schedules (owner via allocation_segments → tokens.created_by) ──
DO $$
DECLARE
  predicate text := 'allocation_id IN (SELECT a.id FROM allocation_segments a JOIN tokens t ON t.id = a.token_id WHERE t.created_by = auth.uid())';
BEGIN
  ALTER TABLE vesting_schedules ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Authenticated users can manage vesting_schedules" ON vesting_schedules;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vesting_schedules' AND policyname = 'vesting_schedules: authenticated read') THEN
    CREATE POLICY "vesting_schedules: authenticated read" ON vesting_schedules FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vesting_schedules' AND policyname = 'vesting_schedules: owner can insert') THEN
    EXECUTE format('CREATE POLICY %I ON vesting_schedules FOR INSERT TO authenticated WITH CHECK (%s)', 'vesting_schedules: owner can insert', predicate);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vesting_schedules' AND policyname = 'vesting_schedules: owner can update') THEN
    EXECUTE format('CREATE POLICY %I ON vesting_schedules FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', 'vesting_schedules: owner can update', predicate, predicate);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vesting_schedules' AND policyname = 'vesting_schedules: owner can delete') THEN
    EXECUTE format('CREATE POLICY %I ON vesting_schedules FOR DELETE TO authenticated USING (%s)', 'vesting_schedules: owner can delete', predicate);
  END IF;
END $$;

-- ── 3. tokens: keep open reads, owner-scope insert/update/delete ─────────────
--    (See the BEHAVIOR CHANGE note above re: status changes by non-owners.)
DO $$
BEGIN
  ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "Authenticated users can insert tokens" ON tokens;
  DROP POLICY IF EXISTS "Authenticated users can update tokens" ON tokens;
  DROP POLICY IF EXISTS "Authenticated users can delete tokens" ON tokens;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tokens' AND policyname = 'tokens: owner can insert') THEN
    CREATE POLICY "tokens: owner can insert" ON tokens FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tokens' AND policyname = 'tokens: owner can update') THEN
    CREATE POLICY "tokens: owner can update" ON tokens FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tokens' AND policyname = 'tokens: owner can delete') THEN
    CREATE POLICY "tokens: owner can delete" ON tokens FOR DELETE TO authenticated USING (created_by = auth.uid());
  END IF;
END $$;

-- ── 4. Drop the permissive ALL on profiles & risk_flags (owner write + read
--       policies already exist for both, so dropping the ALL is the whole fix) ─
DROP POLICY IF EXISTS "Authenticated users can manage profiles" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can manage risk_flags" ON risk_flags;

COMMIT;
