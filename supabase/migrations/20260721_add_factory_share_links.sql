-- ============================================================================
-- Factory sharing: revocable public links + curated lightpaper payload
--
-- A design owner can mint ONE active share link per design. The public
-- lightpaper page resolves the link's slug through a SECURITY DEFINER
-- function that returns a curated jsonb snapshot of the design; anon gets
-- NO table access of any kind (same doctrine as public_token_count /
-- public_token_names: expose a curated read, never relax RLS).
--
-- Rationale:
--   - slug is a uuid (122 bits of entropy) minted server-side by default;
--     guessing is not a realistic path to a private design.
--   - One active link per design (partial unique index on project_id WHERE
--     revoked_at IS NULL): revoking kills the URL, re-creating mints a NEW
--     slug, so an old link can never silently come back to life.
--   - The payload curates columns explicitly: no created_by, no internal
--     scoring (completeness, cluster_scores, benchmark_snapshot), no
--     per-schedule notes. Simulation snapshots ARE included (assumptions +
--     server-computed results): sharing stress-test outcomes is the point.
--   - The function is STABLE and read-only; a dead or revoked slug returns
--     NULL and the page 404s.
--
-- Safety: new table + new function, no existing data touched. RLS owner-only
-- on the table mirrors the factory_* family; writes require is_contributor().
--
-- Apply via supabase-write MCP (standing authorization 2026-07-12); no
-- BEGIN/COMMIT wrapper (the apply runs in its own transaction). Verify
-- rls_enabled, policies, grants and advisors afterwards.
-- ============================================================================

CREATE TABLE factory_share_links (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES factory_projects(id) ON DELETE CASCADE,
  slug       uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- One LIVE link per design; revoked rows stay as an audit trail.
CREATE UNIQUE INDEX idx_factory_share_links_one_active
  ON factory_share_links (project_id)
  WHERE revoked_at IS NULL;

-- ── RLS: owner-only, contributor-gated writes (mirrors the factory_* family) ─

ALTER TABLE factory_share_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE factory_share_links FROM anon;

CREATE POLICY "factory_share_links: owner can select" ON factory_share_links
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT factory_projects.id FROM factory_projects
                        WHERE factory_projects.created_by = auth.uid()));

CREATE POLICY "factory_share_links: owner can insert" ON factory_share_links
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_share_links: owner can update" ON factory_share_links
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_share_links: owner can delete" ON factory_share_links
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── Public read: curated lightpaper payload keyed on a live slug ─────────────

CREATE OR REPLACE FUNCTION public.get_shared_factory_design(p_slug uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'project', jsonb_build_object(
      'name',       p.name,
      'ticker',     p.ticker,
      'category',   p.category,
      'sector',     p.sector,
      'notes',      p.notes,
      'tge_date',   p.tge_date,
      'updated_at', p.updated_at
    ),
    'supply', (
      SELECT jsonb_build_object('max_supply', sm.max_supply)
      FROM factory_supply_metrics sm
      WHERE sm.project_id = p.id
    ),
    'allocations', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',           a.id,
        'segment_type', a.segment_type,
        'label',        a.label,
        'percentage',   a.percentage,
        'token_amount', a.token_amount
      ) ORDER BY a.percentage DESC NULLS LAST), '[]'::jsonb)
      FROM factory_allocation_segments a
      WHERE a.project_id = p.id
    ),
    'vesting', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'allocation_id',           v.allocation_id,
        'cliff_months',            v.cliff_months,
        'duration_months',         v.duration_months,
        'frequency',               v.frequency,
        'tge_percentage',          v.tge_percentage,
        'cliff_unlock_percentage', v.cliff_unlock_percentage
      )), '[]'::jsonb)
      FROM factory_vesting_schedules v
      WHERE v.allocation_id IN (
        SELECT a2.id FROM factory_allocation_segments a2 WHERE a2.project_id = p.id
      )
    ),
    'emission', (
      SELECT jsonb_build_object(
        'type',                  e.type,
        'annual_inflation_rate', e.annual_inflation_rate,
        'inflation_schedule',    e.inflation_schedule
      )
      FROM factory_emission_models e
      WHERE e.project_id = p.id
    ),
    'funding', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'round_type',      f.round_type,
        'label',           f.label,
        'round_date',      f.round_date,
        'token_price_usd', f.token_price_usd,
        'tokens_sold',     f.tokens_sold,
        'amount_usd',      f.amount_usd
      ) ORDER BY f.round_date NULLS LAST, f.created_at), '[]'::jsonb)
      FROM factory_funding_rounds f
      WHERE f.project_id = p.id
    ),
    'snapshots', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name',           s.name,
        'scenario',       s.scenario,
        'result',         s.result,
        'engine_version', s.engine_version,
        'created_at',     s.created_at
      ) ORDER BY s.created_at DESC), '[]'::jsonb)
      FROM factory_simulation_snapshots s
      WHERE s.project_id = p.id
    )
  )
  FROM factory_share_links l
  JOIN factory_projects p ON p.id = l.project_id
  WHERE l.slug = p_slug
    AND l.revoked_at IS NULL;
$$;

-- Default Postgres grants EXECUTE to PUBLIC: revoke, then grant explicitly.
REVOKE EXECUTE ON FUNCTION public.get_shared_factory_design(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_factory_design(uuid) TO anon, authenticated;
