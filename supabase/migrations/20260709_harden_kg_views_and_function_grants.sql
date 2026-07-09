-- ============================================================================
-- Security hardening — knowledge-graph views + SECURITY DEFINER functions
--
-- Findings from the 2026-07-09 RLS audit (docs/rls-audit-20260709.md):
--   1. kg_atoms_v1 / kg_triples_v1 / kg_triple_sources_v1 were created without
--      security_invoker, so they execute with their owner's privileges
--      (postgres) and bypass RLS on the underlying tables. Combined with
--      Supabase's default grants to anon, the full tokenomics dataset
--      (including wallet and contract addresses) was readable without a
--      session via PostgREST (/rest/v1/kg_atoms_v1 …).
--   2. The save_*_tx RPCs and is_visualization_ready are SECURITY DEFINER and
--      executable by anon. Their bodies check auth.uid() (except
--      is_visualization_ready), but anon should not be able to invoke them.
--   3. is_visualization_ready and update_updated_at had a mutable search_path
--      (escalation vector on SECURITY DEFINER functions).
--
-- App impact: none for signed-in users — every underlying table already has
-- an authenticated SELECT policy, and the views are only consumed by
-- authenticated server routes (src/app/api/knowledge-graph,
-- src/app/api/intuition/runs/[runId]) and lib/intuition/bundle-builder.
-- The public landing page does not depend on anonymous reads
-- (src/app/page.tsx keeps the goal statement when the count is blocked).
-- ============================================================================

-- 1. Views run with the querying user's permissions, so RLS applies
ALTER VIEW kg_atoms_v1          SET (security_invoker = true);
ALTER VIEW kg_triples_v1        SET (security_invoker = true);
ALTER VIEW kg_triple_sources_v1 SET (security_invoker = true);

-- Anonymous callers lose all access; authenticated keeps read-only.
REVOKE ALL ON kg_atoms_v1, kg_triples_v1, kg_triple_sources_v1 FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON kg_atoms_v1, kg_triples_v1, kg_triple_sources_v1 FROM authenticated;

-- 2. No anonymous execution of SECURITY DEFINER functions (defense in depth:
--    the save_*_tx bodies already enforce ownership via auth.uid())
REVOKE EXECUTE ON FUNCTION save_allocations_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION save_supply_metrics_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION save_emission_model_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION save_data_sources_tx(uuid, jsonb, jsonb, timestamptz, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION save_vesting_schedules_tx(uuid, text[], jsonb, timestamptz, integer, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION save_risk_flags_tx(uuid, jsonb, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION is_visualization_ready(uuid) FROM anon;

-- 3. Pin search_path on the remaining flagged functions
ALTER FUNCTION is_visualization_ready(uuid) SET search_path = public;
ALTER FUNCTION update_updated_at() SET search_path = public;
