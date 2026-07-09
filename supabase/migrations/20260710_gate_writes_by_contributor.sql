-- ============================================================================
-- Gate table writes by contributor role (dual-auth onboarding)
--
-- Appends `AND (SELECT public.is_contributor())` to every owner-scoped write
-- policy (INSERT/UPDATE/DELETE) so a viewer (no active wallet link) can no
-- longer write, even to a token they own. SELECT policies are untouched
-- everywhere: viewers keep full read access.
--
-- Scope: the 12 owner-scoped write tables. EXCLUDED on purpose:
--   - profiles  (viewers edit their own row: identity, not contribution)
--   - challenges (Resolve Box; its own wallet-gate lives in open_challenge_tx)
--   - intuition_pin_cache (shared cache, not owner-scoped: gated separately in
--     20260710_restrict_pin_cache_writes_to_contributors.sql)
--
-- is_contributor() is wrapped in a scalar sub-select so the planner evaluates
-- it once per statement (STABLE), not once per row.
--
-- The save_*_tx RPCs are SECURITY DEFINER and bypass these table policies, so
-- they carry their OWN contributor check (see
-- 20260710_gate_save_tx_rpcs_by_contributor.sql). Both layers are required:
-- this one for direct PostgREST writes, that one for the studio's RPC path.
--
-- Requires public.is_contributor() (20260710_add_is_contributor_and_profile_trigger.sql).
-- ============================================================================

BEGIN;

-- ── tokens ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tokens: owner can insert" ON public.tokens;
CREATE POLICY "tokens: owner can insert" ON public.tokens
  FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()) AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "tokens: owner can update" ON public.tokens;
CREATE POLICY "tokens: owner can update" ON public.tokens
  FOR UPDATE TO authenticated
  USING ((created_by = auth.uid()) AND (SELECT public.is_contributor()))
  WITH CHECK ((created_by = auth.uid()) AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "tokens: owner can delete" ON public.tokens;
CREATE POLICY "tokens: owner can delete" ON public.tokens
  FOR DELETE TO authenticated
  USING ((created_by = auth.uid()) AND (SELECT public.is_contributor()));

-- ── allocation_segments ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "allocation_segments: owner can insert" ON public.allocation_segments;
CREATE POLICY "allocation_segments: owner can insert" ON public.allocation_segments
  FOR INSERT TO authenticated
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "allocation_segments: owner can update" ON public.allocation_segments;
CREATE POLICY "allocation_segments: owner can update" ON public.allocation_segments
  FOR UPDATE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "allocation_segments: owner can delete" ON public.allocation_segments;
CREATE POLICY "allocation_segments: owner can delete" ON public.allocation_segments
  FOR DELETE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── supply_metrics ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "supply_metrics: owner can insert" ON public.supply_metrics;
CREATE POLICY "supply_metrics: owner can insert" ON public.supply_metrics
  FOR INSERT TO authenticated
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "supply_metrics: owner can update" ON public.supply_metrics;
CREATE POLICY "supply_metrics: owner can update" ON public.supply_metrics
  FOR UPDATE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "supply_metrics: owner can delete" ON public.supply_metrics;
CREATE POLICY "supply_metrics: owner can delete" ON public.supply_metrics
  FOR DELETE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── emission_models ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "emission_models: owner can insert" ON public.emission_models;
CREATE POLICY "emission_models: owner can insert" ON public.emission_models
  FOR INSERT TO authenticated
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "emission_models: owner can update" ON public.emission_models;
CREATE POLICY "emission_models: owner can update" ON public.emission_models
  FOR UPDATE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "emission_models: owner can delete" ON public.emission_models;
CREATE POLICY "emission_models: owner can delete" ON public.emission_models
  FOR DELETE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── data_sources ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "data_sources: owner can insert" ON public.data_sources;
CREATE POLICY "data_sources: owner can insert" ON public.data_sources
  FOR INSERT TO authenticated
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "data_sources: owner can update" ON public.data_sources;
CREATE POLICY "data_sources: owner can update" ON public.data_sources
  FOR UPDATE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "data_sources: owner can delete" ON public.data_sources;
CREATE POLICY "data_sources: owner can delete" ON public.data_sources
  FOR DELETE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── risk_flags ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "risk_flags: owner can insert" ON public.risk_flags;
CREATE POLICY "risk_flags: owner can insert" ON public.risk_flags
  FOR INSERT TO authenticated
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "risk_flags: owner can update" ON public.risk_flags;
CREATE POLICY "risk_flags: owner can update" ON public.risk_flags
  FOR UPDATE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "risk_flags: owner can delete" ON public.risk_flags;
CREATE POLICY "risk_flags: owner can delete" ON public.risk_flags
  FOR DELETE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── claim_sources (insert + delete only; no update policy exists) ──────────
DROP POLICY IF EXISTS "claim_sources: owner can insert" ON public.claim_sources;
CREATE POLICY "claim_sources: owner can insert" ON public.claim_sources
  FOR INSERT TO authenticated
  WITH CHECK ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "claim_sources: owner can delete" ON public.claim_sources;
CREATE POLICY "claim_sources: owner can delete" ON public.claim_sources
  FOR DELETE TO authenticated
  USING ((token_id IN (SELECT tokens.id FROM tokens WHERE tokens.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── vesting_schedules (owner is via allocation -> token) ───────────────────
DROP POLICY IF EXISTS "vesting_schedules: owner can insert" ON public.vesting_schedules;
CREATE POLICY "vesting_schedules: owner can insert" ON public.vesting_schedules
  FOR INSERT TO authenticated
  WITH CHECK ((allocation_id IN (
                SELECT a.id FROM allocation_segments a
                JOIN tokens t ON t.id = a.token_id
                WHERE t.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "vesting_schedules: owner can update" ON public.vesting_schedules;
CREATE POLICY "vesting_schedules: owner can update" ON public.vesting_schedules
  FOR UPDATE TO authenticated
  USING ((allocation_id IN (
            SELECT a.id FROM allocation_segments a
            JOIN tokens t ON t.id = a.token_id
            WHERE t.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((allocation_id IN (
                SELECT a.id FROM allocation_segments a
                JOIN tokens t ON t.id = a.token_id
                WHERE t.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "vesting_schedules: owner can delete" ON public.vesting_schedules;
CREATE POLICY "vesting_schedules: owner can delete" ON public.vesting_schedules
  FOR DELETE TO authenticated
  USING ((allocation_id IN (
            SELECT a.id FROM allocation_segments a
            JOIN tokens t ON t.id = a.token_id
            WHERE t.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── intuition_publish_runs (owner via created_by; UPDATE had no WITH CHECK) ─
DROP POLICY IF EXISTS "Users can insert their own publish runs" ON public.intuition_publish_runs;
CREATE POLICY "Users can insert their own publish runs" ON public.intuition_publish_runs
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = created_by) AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "Users can update their own publish runs" ON public.intuition_publish_runs;
CREATE POLICY "Users can update their own publish runs" ON public.intuition_publish_runs
  FOR UPDATE TO authenticated
  USING ((auth.uid() = created_by) AND (SELECT public.is_contributor()));

-- ── intuition_atom_mappings ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert their own atom mappings" ON public.intuition_atom_mappings;
CREATE POLICY "Users can insert their own atom mappings" ON public.intuition_atom_mappings
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = created_by) AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "Users can update their own atom mappings" ON public.intuition_atom_mappings;
CREATE POLICY "Users can update their own atom mappings" ON public.intuition_atom_mappings
  FOR UPDATE TO authenticated
  USING ((auth.uid() = created_by) AND (SELECT public.is_contributor()));

-- ── intuition_claim_mappings ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert their own claim mappings" ON public.intuition_claim_mappings;
CREATE POLICY "Users can insert their own claim mappings" ON public.intuition_claim_mappings
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = created_by) AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "Users can update their own claim mappings" ON public.intuition_claim_mappings;
CREATE POLICY "Users can update their own claim mappings" ON public.intuition_claim_mappings
  FOR UPDATE TO authenticated
  USING ((auth.uid() = created_by) AND (SELECT public.is_contributor()));

-- ── intuition_provenance_mappings ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users can insert their own provenance mappings" ON public.intuition_provenance_mappings;
CREATE POLICY "Users can insert their own provenance mappings" ON public.intuition_provenance_mappings
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = created_by) AND (SELECT public.is_contributor()));

DROP POLICY IF EXISTS "Users can update their own provenance mappings" ON public.intuition_provenance_mappings;
CREATE POLICY "Users can update their own provenance mappings" ON public.intuition_provenance_mappings
  FOR UPDATE TO authenticated
  USING ((auth.uid() = created_by) AND (SELECT public.is_contributor()));

COMMIT;
