-- ============================================================================
-- Close the draft leak: scope every token read to the VISIBLE set
--
-- Until now SELECT on tokens and its child tables was `USING (true)` for any
-- authenticated user (the "collaborative read" model recorded in
-- docs/rls-audit-20260709.md). Proven consequence: a brand-new account could
-- read every OTHER user's private drafts, their allocations and their supply
-- metrics, and saw them in the knowledge graph (the kg_*_v1 views are
-- security_invoker and carry no status filter of their own, so they inherit
-- whatever tokens RLS allows).
--
-- The visible set is defined ONCE, in public.readable_token_ids():
--
--   * status in ('in_review', 'validated')  -- submitted to the community
--   * OR created_by = auth.uid()            -- my own work, at any status
--   * OR is_moderator(auth.uid())           -- review duty over submissions
--
-- Why in_review is visible: it is a submission, not a private draft.
-- open_challenge_tx accepts challenges against in_review tokens (only draft
-- is rejected), and the knowledge-graph route deliberately includes them.
-- Hiding in_review would break the community review loop. `draft` is the
-- private state, and that is what this migration protects.
--
-- Every read policy delegates to that one function, so the SINGLE place to
-- extend later is its body. Teams land by adding one clause there
-- (e.g. OR t.id IN (SELECT token_id FROM token_team_members
-- WHERE user_id = auth.uid())) and every table follows automatically, with
-- no policy left behind.
--
-- SECURITY DEFINER on the function is deliberate and safe: it defines the
-- visibility rule, so it must see the whole table to evaluate it. It returns
-- only ids, is STABLE and read-only, and is not callable by anon.
--
-- Write policies are untouched (they already required created_by =
-- auth.uid()), and the SECURITY DEFINER save/challenge RPCs bypass RLS, so
-- no write path changes.
--
-- Apply via supabase-write MCP (standing authorization 2026-07-12); no
-- BEGIN/COMMIT wrapper (the apply runs in its own transaction). Verify the
-- cross-user probe afterwards: foreign drafts must read as zero rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.readable_token_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id
  FROM tokens t
  WHERE t.status IN ('in_review', 'validated')
     OR t.created_by = auth.uid()
     OR public.is_moderator(auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.readable_token_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.readable_token_ids() TO authenticated, service_role;

-- ── Parent ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can read all tokens" ON tokens;
CREATE POLICY "tokens: read the visible set" ON tokens
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.readable_token_ids()));

-- ── Children keyed by token_id ──────────────────────────────────────────────

DROP POLICY IF EXISTS "allocation_segments: authenticated read" ON allocation_segments;
CREATE POLICY "allocation_segments: read the visible set" ON allocation_segments
  FOR SELECT TO authenticated
  USING (token_id IN (SELECT public.readable_token_ids()));

DROP POLICY IF EXISTS "supply_metrics: authenticated read" ON supply_metrics;
CREATE POLICY "supply_metrics: read the visible set" ON supply_metrics
  FOR SELECT TO authenticated
  USING (token_id IN (SELECT public.readable_token_ids()));

DROP POLICY IF EXISTS "emission_models: authenticated read" ON emission_models;
CREATE POLICY "emission_models: read the visible set" ON emission_models
  FOR SELECT TO authenticated
  USING (token_id IN (SELECT public.readable_token_ids()));

DROP POLICY IF EXISTS "data_sources: authenticated read" ON data_sources;
CREATE POLICY "data_sources: read the visible set" ON data_sources
  FOR SELECT TO authenticated
  USING (token_id IN (SELECT public.readable_token_ids()));

DROP POLICY IF EXISTS "risk_flags: authenticated users can read" ON risk_flags;
CREATE POLICY "risk_flags: read the visible set" ON risk_flags
  FOR SELECT TO authenticated
  USING (token_id IN (SELECT public.readable_token_ids()));

DROP POLICY IF EXISTS "claim_sources: authenticated users can read" ON claim_sources;
CREATE POLICY "claim_sources: read the visible set" ON claim_sources
  FOR SELECT TO authenticated
  USING (token_id IN (SELECT public.readable_token_ids()));

-- Metadata history carries status, completeness and cluster scores per token:
-- leaving it open would leak the existence and shape of private drafts.
DROP POLICY IF EXISTS "token_stat_history: authenticated read" ON token_stat_history;
CREATE POLICY "token_stat_history: read the visible set" ON token_stat_history
  FOR SELECT TO authenticated
  USING (token_id IN (SELECT public.readable_token_ids()));

-- Publish runs are only ever created for submitted tokens, but scope them on
-- the same rule so the ledger can never outlive its token's visibility.
DROP POLICY IF EXISTS "Authenticated users can read publish runs" ON intuition_publish_runs;
CREATE POLICY "intuition_publish_runs: read the visible set" ON intuition_publish_runs
  FOR SELECT TO authenticated
  USING (token_id IN (SELECT public.readable_token_ids()));

-- ── Grandchild: vesting is keyed by allocation, itself keyed by token ────────

DROP POLICY IF EXISTS "vesting_schedules: authenticated read" ON vesting_schedules;
CREATE POLICY "vesting_schedules: read the visible set" ON vesting_schedules
  FOR SELECT TO authenticated
  USING (allocation_id IN (
    SELECT a.id FROM allocation_segments a
    WHERE a.token_id IN (SELECT public.readable_token_ids())
  ));
