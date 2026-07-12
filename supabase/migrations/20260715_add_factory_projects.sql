-- ============================================================================
-- Factory: private tokenomics designs (tables + RLS + transactional save RPCs)
--
-- Factory is the tokenomics *design* surface: a factory_projects row is a
-- private, owner-only design (not a market token), edited through the same
-- studio choreography as the screener and persisted through SECURITY DEFINER
-- transactional-save RPCs with optimistic locking.
--
-- Schema source: the LIVE screener DDL (information_schema.columns +
-- pg_constraint, read 2026-07-12) for tokens / supply_metrics /
-- allocation_segments / vesting_schedules / emission_models, replicated onto
-- factory_* tables with every constraint renamed factory_* (avoids conname
-- collisions). Intentional divergences from the screener tables:
--   - status lifecycle is CHECK ('draft','promoted') -- review states
--     (in_review/validated) are meaningless for a private design.
--   - no contract_address / coingecko_id / coingecko_image (screener-specific
--     attestation of real, deployed tokens).
--   - benchmark_snapshot jsonb + benchmark_snapshot_at: the design renders
--     benchmark medians from this snapshot ("refresh from market" replaces it).
--   - created_by is NOT NULL DEFAULT auth.uid() with ON DELETE CASCADE:
--     designs are private to their creator, so they die with the account
--     (tokens.created_by is nullable community data and does not cascade).
--   - factory_vesting_schedules.cliff_unlock_percentage gets a 0-100 CHECK as
--     defense-in-depth; the live vesting_schedules column has NO such CHECK
--     (only tge_percentage does) -- do not read it as live provenance.
--
-- RLS: owner-only on every table. factory_projects' own INSERT/UPDATE/DELETE
-- and every child write also require (SELECT public.is_contributor()),
-- mirroring 20260710_gate_writes_by_contributor.sql -- otherwise a contributor
-- who unlinks their wallet keeps raw REST PATCH/DELETE on their rows. SELECT
-- stays gate-free (an owner must still be able to open their own designs).
-- Children get explicit owner-scoped SELECT policies (RLS is default-deny; a
-- missing child SELECT policy would reload the owner's own design EMPTY).
--
-- Creation path: a direct client INSERT into factory_projects under the
-- contributor-gated INSERT policy below (the single sanctioned exception to
-- "no raw client inserts" -- mirrors the screener's onSubmitStep1 else-branch).
-- Children are only ever written through the RPCs.
--
-- RPCs: hand-derived from the CURRENT live definitions --
-- save_identity_tx (20260711_harden_mark_stale_and_identity.sql),
-- save_supply_metrics_tx / save_allocations_tx / save_emission_model_tx
-- (20260711_merge_saves_a4_and_contributor.sql), save_vesting_schedules_tx
-- (20260711_vesting_reconcile_and_stale.sql, the reconcile-by-allocation_id
-- version). The skeleton is preserved: SECURITY DEFINER + pinned search_path,
-- strict owner check (insufficient_privilege), is_contributor() gate,
-- optimistic lock on factory_projects.updated_at (serialization_failure),
-- NULLIF/cast handling, the reconcile (not delete-all) patterns, updated_at
-- bump, REVOKE FROM PUBLIC/anon + GRANT to authenticated/service_role.
-- STRIPPED entirely: the A4 owner-OR-moderator branch (is_moderator /
-- v_is_mod), every challenge_events INSERT (that table FKs to tokens(id) and
-- would FK-violate on a factory uuid), and the stale-challenge triggers.
-- Factory has no moderators and no challenges.
-- ADDED vs the live skeleton: save_factory_vesting_schedules_tx verifies that
-- every allocation id it touches belongs to p_project_id. SECURITY DEFINER
-- bypasses RLS, and the ownership check alone only covers the project row --
-- without this scope guard a design owner could pass another user's
-- allocation ids and write their vesting rows. (The live screener
-- save_vesting_schedules_tx shares this gap -- flagged separately as a
-- follow-up; not folded into this migration.)
--
-- Filename is 20260715 (post-dated) purely to sort after
-- 20260714_add_token_stat_history.sql -- filename order is the only ordering
-- guarantee in this repo.
--
-- Apply manually via the Supabase Studio SQL Editor. After applying, verify:
--   - mcp get_advisors(security): no new ERROR/WARN vs the accepted baseline
--   - list_tables: rls_enabled = true on all five factory_* tables
--   - pg_proc.proacl on the five RPCs: no PUBLIC/anon EXECUTE
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Tables
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE factory_projects (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  ticker         text NOT NULL,
  chain          text,
  tge_date       date,
  category       text,
  sector         text,
  status         text DEFAULT 'draft',
  completeness   integer DEFAULT 0,
  cluster_scores jsonb DEFAULT '{}'::jsonb,
  benchmark_snapshot    jsonb,
  benchmark_snapshot_at timestamptz,
  notes          text,
  created_by     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),

  -- Design lifecycle, NOT the screener's review lifecycle (do not copy
  -- tokens_status_check here).
  CONSTRAINT factory_projects_status_check CHECK (status IN ('draft', 'promoted')),

  -- Taxonomy CHECKs replicated from the live tokens DDL.
  CONSTRAINT factory_projects_category_check CHECK (
    (category IS NULL) OR (category = ANY (ARRAY[
      'open-digital-economy'::text, 'payment'::text, 'two-sided-market'::text,
      'infrastructure'::text, 'financial'::text
    ]))
  ),
  CONSTRAINT factory_projects_sector_check CHECK (
    (sector IS NULL) OR (sector = ANY (ARRAY[
      'asset-management'::text, 'cex'::text, 'dex'::text, 'lending'::text,
      'yield-strategy'::text, 'gambling-prediction'::text, 'derivative-market'::text,
      'funding'::text, 'oracle-data'::text, 'artificial-intelligence'::text,
      'baas'::text, 'l1'::text, 'l2'::text, 'l0'::text, 'bridge'::text,
      'depin'::text, 'advertising'::text, 'content-creation'::text,
      'gaming-ecosystem'::text, 'game'::text, 'fan-token'::text, 'metaverse'::text,
      'payment-platform'::text, 'rewards'::text, 'memes-token'::text,
      'collectible-nft'::text, 'identity-reputation'::text, 'other'::text
    ]))
  ),
  CONSTRAINT factory_projects_sector_category_consistency_check CHECK (
    (sector IS NULL)
    OR ((category = 'financial'::text) AND (sector = ANY (ARRAY[
      'asset-management'::text, 'cex'::text, 'dex'::text, 'lending'::text,
      'yield-strategy'::text, 'gambling-prediction'::text,
      'derivative-market'::text, 'funding'::text])))
    OR ((category = 'infrastructure'::text) AND (sector = ANY (ARRAY[
      'oracle-data'::text, 'artificial-intelligence'::text, 'baas'::text,
      'l1'::text, 'l2'::text, 'l0'::text, 'bridge'::text, 'depin'::text])))
    OR ((category = 'open-digital-economy'::text) AND (sector = ANY (ARRAY[
      'advertising'::text, 'content-creation'::text, 'gaming-ecosystem'::text,
      'game'::text, 'fan-token'::text, 'metaverse'::text])))
    OR ((category = 'payment'::text) AND (sector = ANY (ARRAY[
      'payment-platform'::text, 'rewards'::text, 'memes-token'::text])))
    OR ((category = 'two-sided-market'::text) AND (sector = ANY (ARRAY[
      'collectible-nft'::text, 'identity-reputation'::text, 'other'::text])))
  )
);

CREATE INDEX idx_factory_projects_created_by ON factory_projects (created_by);

CREATE TABLE factory_supply_metrics (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id         uuid NOT NULL REFERENCES factory_projects(id) ON DELETE CASCADE,
  max_supply         bigint,
  initial_supply     bigint,
  tge_supply         bigint,
  circulating_supply bigint,
  circulating_date   date,
  source_url         text,
  notes              text,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),

  -- The RPC upserts ON CONFLICT (project_id); this UNIQUE is what makes that valid.
  CONSTRAINT factory_supply_metrics_project_id_key UNIQUE (project_id)
);

CREATE TABLE factory_allocation_segments (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id     uuid NOT NULL REFERENCES factory_projects(id) ON DELETE CASCADE,
  segment_type   text NOT NULL,
  label          text,
  percentage     numeric(5,2),
  token_amount   bigint,
  wallet_address text,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),

  CONSTRAINT factory_allocation_segments_segment_type_check CHECK (
    segment_type = ANY (ARRAY[
      'funding-private'::text, 'funding-public'::text, 'team-founders'::text,
      'treasury'::text, 'marketing'::text, 'airdrop'::text, 'rewards'::text,
      'liquidity'::text
    ])
  ),
  CONSTRAINT factory_allocation_segments_percentage_check CHECK (
    (percentage >= (0)::numeric) AND (percentage <= (100)::numeric)
  )
);

CREATE INDEX idx_factory_allocation_segments_project_id
  ON factory_allocation_segments (project_id);

CREATE TABLE factory_vesting_schedules (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  -- 1:1 with an allocation row; ON DELETE CASCADE is load-bearing: the
  -- allocations RPC deletes removed segments and would otherwise raise 23503
  -- on a perfectly normal edit.
  allocation_id           uuid NOT NULL REFERENCES factory_allocation_segments(id) ON DELETE CASCADE,
  cliff_months            integer DEFAULT 0,
  duration_months         integer DEFAULT 0,
  frequency               text DEFAULT 'monthly',
  tge_percentage          numeric(5,2) DEFAULT 0,
  cliff_unlock_percentage numeric(5,2) DEFAULT 0,
  notes                   text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),

  CONSTRAINT factory_vesting_schedules_allocation_id_key UNIQUE (allocation_id),
  CONSTRAINT factory_vesting_schedules_frequency_check CHECK (
    frequency = ANY (ARRAY[
      'daily'::text, 'monthly'::text, 'yearly'::text, 'immediate'::text, 'custom'::text
    ])
  ),
  CONSTRAINT factory_vesting_schedules_tge_percentage_check CHECK (
    (tge_percentage >= (0)::numeric) AND (tge_percentage <= (100)::numeric)
  ),
  -- Defense-in-depth only: the live vesting_schedules table has no CHECK on
  -- cliff_unlock_percentage (the shared Zod schema gates the write path).
  CONSTRAINT factory_vesting_schedules_cliff_unlock_percentage_check CHECK (
    (cliff_unlock_percentage >= (0)::numeric) AND (cliff_unlock_percentage <= (100)::numeric)
  )
);

CREATE TABLE factory_emission_models (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id            uuid NOT NULL REFERENCES factory_projects(id) ON DELETE CASCADE,
  type                  text NOT NULL,
  annual_inflation_rate numeric(5,2),
  inflation_schedule    jsonb,
  has_burn              boolean DEFAULT false,
  burn_details          text,
  has_buyback           boolean DEFAULT false,
  buyback_details       text,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),

  -- The RPC upserts ON CONFLICT (project_id); this UNIQUE is what makes that valid.
  CONSTRAINT factory_emission_models_project_id_key UNIQUE (project_id),
  CONSTRAINT factory_emission_models_type_check CHECK (
    type = ANY (ARRAY[
      'fixed_cap'::text, 'inflationary'::text, 'deflationary'::text,
      'burn_mint'::text, 'rebase'::text, 'other'::text
    ])
  )
);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS -- owner-only, default-deny; anon never gets a policy
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE factory_projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_supply_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_allocation_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_vesting_schedules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_emission_models     ENABLE ROW LEVEL SECURITY;

-- Supabase default privileges grant table access to anon; RLS default-deny
-- already yields zero rows, but strip the grant too -- designs are private.
REVOKE ALL ON TABLE factory_projects,
                    factory_supply_metrics,
                    factory_allocation_segments,
                    factory_vesting_schedules,
                    factory_emission_models
  FROM anon;

-- ── factory_projects ────────────────────────────────────────────────────────
-- SELECT is gate-free: an owner whose wallet is unlinked must still be able
-- to open (read) their own designs. Every write carries the contributor gate.
CREATE POLICY "factory_projects: owner can select" ON factory_projects
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

-- The sanctioned direct-insert creation path. is_contributor() is mandatory:
-- without it any signed-in non-contributor could create designs via a raw
-- REST insert, bypassing the client-only RoleGate.
CREATE POLICY "factory_projects: owner can insert" ON factory_projects
  FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()) AND (SELECT public.is_contributor()));

CREATE POLICY "factory_projects: owner can update" ON factory_projects
  FOR UPDATE TO authenticated
  USING ((created_by = auth.uid()) AND (SELECT public.is_contributor()))
  WITH CHECK ((created_by = auth.uid()) AND (SELECT public.is_contributor()));

CREATE POLICY "factory_projects: owner can delete" ON factory_projects
  FOR DELETE TO authenticated
  USING ((created_by = auth.uid()) AND (SELECT public.is_contributor()));

-- ── factory_supply_metrics ──────────────────────────────────────────────────
CREATE POLICY "factory_supply_metrics: owner can select" ON factory_supply_metrics
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT factory_projects.id FROM factory_projects
                        WHERE factory_projects.created_by = auth.uid()));

CREATE POLICY "factory_supply_metrics: owner can insert" ON factory_supply_metrics
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_supply_metrics: owner can update" ON factory_supply_metrics
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_supply_metrics: owner can delete" ON factory_supply_metrics
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── factory_allocation_segments ─────────────────────────────────────────────
CREATE POLICY "factory_allocation_segments: owner can select" ON factory_allocation_segments
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT factory_projects.id FROM factory_projects
                        WHERE factory_projects.created_by = auth.uid()));

CREATE POLICY "factory_allocation_segments: owner can insert" ON factory_allocation_segments
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_allocation_segments: owner can update" ON factory_allocation_segments
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_allocation_segments: owner can delete" ON factory_allocation_segments
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── factory_vesting_schedules (two-hop ownership via the allocation row) ────
CREATE POLICY "factory_vesting_schedules: owner can select" ON factory_vesting_schedules
  FOR SELECT TO authenticated
  USING (allocation_id IN (
    SELECT s.id FROM factory_allocation_segments s
    JOIN factory_projects p ON p.id = s.project_id
    WHERE p.created_by = auth.uid()
  ));

CREATE POLICY "factory_vesting_schedules: owner can insert" ON factory_vesting_schedules
  FOR INSERT TO authenticated
  WITH CHECK ((allocation_id IN (
                SELECT s.id FROM factory_allocation_segments s
                JOIN factory_projects p ON p.id = s.project_id
                WHERE p.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_vesting_schedules: owner can update" ON factory_vesting_schedules
  FOR UPDATE TO authenticated
  USING ((allocation_id IN (
           SELECT s.id FROM factory_allocation_segments s
           JOIN factory_projects p ON p.id = s.project_id
           WHERE p.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((allocation_id IN (
                SELECT s.id FROM factory_allocation_segments s
                JOIN factory_projects p ON p.id = s.project_id
                WHERE p.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_vesting_schedules: owner can delete" ON factory_vesting_schedules
  FOR DELETE TO authenticated
  USING ((allocation_id IN (
           SELECT s.id FROM factory_allocation_segments s
           JOIN factory_projects p ON p.id = s.project_id
           WHERE p.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── factory_emission_models ─────────────────────────────────────────────────
CREATE POLICY "factory_emission_models: owner can select" ON factory_emission_models
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT factory_projects.id FROM factory_projects
                        WHERE factory_projects.created_by = auth.uid()));

CREATE POLICY "factory_emission_models: owner can insert" ON factory_emission_models
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_emission_models: owner can update" ON factory_emission_models
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_emission_models: owner can delete" ON factory_emission_models
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ────────────────────────────────────────────────────────────────────────────
-- Transactional save RPCs
--
-- All five share the hardened single-read auth prologue from save_identity_tx:
-- one SELECT fetches created_by + updated_at, then strict owner check,
-- contributor gate, optimistic lock. No moderator branch, no challenge_events.
-- ────────────────────────────────────────────────────────────────────────────

-- ── save_factory_identity_tx ────────────────────────────────────────────────
-- Derived from save_identity_tx; contract_address / coingecko_* dropped.
CREATE OR REPLACE FUNCTION public.save_factory_identity_tx(
  p_project_id uuid,
  p_identity jsonb,
  p_expected_updated_at timestamptz,
  p_completeness integer DEFAULT NULL,
  p_cluster_scores jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
  v_owner              uuid;
BEGIN
  -- Ownership + optimistic-lock source of truth in one read.
  SELECT created_by, updated_at INTO v_owner, v_current_updated_at
  FROM factory_projects WHERE id = p_project_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: design not found or not owned'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this design'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Optimistic lock check
  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Design was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Atomic identity update. name/ticker are NOT NULL, so no NULLIF; every
  -- other identity field is optional text, so NULLIF('') collapses an empty
  -- string to NULL instead of persisting ''. tge_date is a date column -- a
  -- bare ->> is always text, so it needs the explicit ::date cast.
  UPDATE factory_projects SET
    name           = p_identity->>'name',
    ticker         = p_identity->>'ticker',
    chain          = NULLIF(p_identity->>'chain', ''),
    tge_date       = NULLIF(p_identity->>'tge_date', '')::date,
    category       = NULLIF(p_identity->>'category', ''),
    sector         = NULLIF(p_identity->>'sector', ''),
    notes          = NULLIF(p_identity->>'notes', ''),
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores),
    updated_at     = v_new_updated_at
  WHERE id = p_project_id;

  RETURN v_new_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_factory_identity_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_factory_identity_tx(uuid, jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;

-- ── save_factory_supply_metrics_tx ──────────────────────────────────────────
-- Derived from save_supply_metrics_tx.
CREATE OR REPLACE FUNCTION public.save_factory_supply_metrics_tx(
  p_project_id uuid,
  p_metrics jsonb,
  p_expected_updated_at timestamptz,
  p_completeness integer DEFAULT NULL,
  p_cluster_scores jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
  v_owner              uuid;
BEGIN
  SELECT created_by, updated_at INTO v_owner, v_current_updated_at
  FROM factory_projects WHERE id = p_project_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: design not found or not owned'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this design'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Design was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Upsert supply metrics
  INSERT INTO factory_supply_metrics (
    project_id, max_supply, initial_supply, tge_supply,
    circulating_supply, circulating_date, source_url, notes
  ) VALUES (
    p_project_id,
    NULLIF(p_metrics->>'max_supply', '')::bigint,
    NULLIF(p_metrics->>'initial_supply', '')::bigint,
    NULLIF(p_metrics->>'tge_supply', '')::bigint,
    NULLIF(p_metrics->>'circulating_supply', '')::bigint,
    NULLIF(p_metrics->>'circulating_date', '')::date,
    p_metrics->>'source_url',
    p_metrics->>'notes'
  )
  ON CONFLICT (project_id) DO UPDATE SET
    max_supply         = EXCLUDED.max_supply,
    initial_supply     = EXCLUDED.initial_supply,
    tge_supply         = EXCLUDED.tge_supply,
    circulating_supply = EXCLUDED.circulating_supply,
    circulating_date   = EXCLUDED.circulating_date,
    source_url         = EXCLUDED.source_url,
    notes              = EXCLUDED.notes;

  -- Atomic project bump
  UPDATE factory_projects SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_project_id;

  RETURN v_new_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_factory_supply_metrics_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_factory_supply_metrics_tx(uuid, jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;

-- ── save_factory_allocations_tx ─────────────────────────────────────────────
-- Derived from save_allocations_tx (reconcile by id, delete removed rows --
-- the CASCADE on factory_vesting_schedules.allocation_id absorbs the delete).
CREATE OR REPLACE FUNCTION public.save_factory_allocations_tx(
  p_project_id uuid,
  p_segments jsonb,
  p_expected_updated_at timestamptz,
  p_completeness integer DEFAULT NULL,
  p_cluster_scores jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at     timestamptz;
  v_new_updated_at         timestamptz := now();
  v_existing_ids           uuid[];
  v_submitted_existing_ids uuid[] := '{}';
  v_segment                jsonb;
  v_segment_id             uuid;
  v_result_segments        jsonb;
  v_owner                  uuid;
BEGIN
  SELECT created_by, updated_at INTO v_owner, v_current_updated_at
  FROM factory_projects WHERE id = p_project_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: design not found or not owned'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this design'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Design was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Get existing allocation IDs for this design
  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_ids
  FROM factory_allocation_segments WHERE project_id = p_project_id;

  -- Process each segment
  FOR v_segment IN SELECT * FROM jsonb_array_elements(p_segments)
  LOOP
    v_segment_id := NULLIF(v_segment->>'id', '')::uuid;

    IF v_segment_id IS NOT NULL AND v_segment_id = ANY(v_existing_ids) THEN
      -- Update existing segment
      UPDATE factory_allocation_segments SET
        segment_type   = v_segment->>'segment_type',
        label          = v_segment->>'label',
        percentage     = (v_segment->>'percentage')::numeric,
        token_amount   = NULLIF(v_segment->>'token_amount', '')::bigint,
        wallet_address = NULLIF(v_segment->>'wallet_address', '')
      WHERE id = v_segment_id AND project_id = p_project_id;
      v_submitted_existing_ids := v_submitted_existing_ids || v_segment_id;
    ELSE
      -- Insert new segment
      INSERT INTO factory_allocation_segments (
        project_id, segment_type, label, percentage, token_amount, wallet_address
      ) VALUES (
        p_project_id,
        v_segment->>'segment_type',
        v_segment->>'label',
        (v_segment->>'percentage')::numeric,
        NULLIF(v_segment->>'token_amount', '')::bigint,
        NULLIF(v_segment->>'wallet_address', '')
      );
    END IF;
  END LOOP;

  -- Delete allocations removed by user (cascades to factory_vesting_schedules)
  DELETE FROM factory_allocation_segments
  WHERE project_id = p_project_id
    AND id = ANY(v_existing_ids)
    AND NOT (id = ANY(v_submitted_existing_ids));

  -- Atomic project bump
  UPDATE factory_projects SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_project_id;

  -- Return saved segments for client refresh
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.percentage DESC), '[]'::jsonb)
  INTO v_result_segments
  FROM factory_allocation_segments s
  WHERE s.project_id = p_project_id;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'segments', v_result_segments
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_factory_allocations_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_factory_allocations_tx(uuid, jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;

-- ── save_factory_vesting_schedules_tx ───────────────────────────────────────
-- Derived from the reconcile-by-allocation_id save_vesting_schedules_tx
-- (20260711_vesting_reconcile_and_stale.sql). ADDED scope guard: every
-- allocation id touched (p_allocation_ids and each schedule row) must belong
-- to p_project_id -- SECURITY DEFINER bypasses RLS and the prologue only
-- proves ownership of the project row.
CREATE OR REPLACE FUNCTION public.save_factory_vesting_schedules_tx(
  p_project_id uuid,
  p_allocation_ids text[],
  p_schedules jsonb,
  p_expected_updated_at timestamptz,
  p_completeness integer DEFAULT NULL,
  p_cluster_scores jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at  timestamptz;
  v_new_updated_at      timestamptz := now();
  v_schedule            jsonb;
  v_alloc_id            uuid;
  v_submitted_alloc_ids uuid[] := '{}';
  v_owner               uuid;
BEGIN
  SELECT created_by, updated_at INTO v_owner, v_current_updated_at
  FROM factory_projects WHERE id = p_project_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: design not found or not owned'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this design'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Design was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Scope guard: reject any allocation id that does not belong to this design.
  IF EXISTS (
    SELECT 1 FROM unnest(p_allocation_ids::uuid[]) AS a(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM factory_allocation_segments s
      WHERE s.id = a.id AND s.project_id = p_project_id
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: allocation does not belong to this design'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reconcile by allocation_id: UPDATE in place for a kept allocation (row id
  -- stable), INSERT only for a genuinely new one.
  FOR v_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    v_alloc_id := (v_schedule->>'allocation_id')::uuid;

    -- Same scope guard for schedule rows not covered by p_allocation_ids.
    IF NOT EXISTS (
      SELECT 1 FROM factory_allocation_segments s
      WHERE s.id = v_alloc_id AND s.project_id = p_project_id
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: allocation does not belong to this design'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (SELECT 1 FROM factory_vesting_schedules WHERE allocation_id = v_alloc_id) THEN
      UPDATE factory_vesting_schedules SET
        cliff_months            = COALESCE((v_schedule->>'cliff_months')::int, 0),
        duration_months         = COALESCE((v_schedule->>'duration_months')::int, 0),
        frequency               = COALESCE(v_schedule->>'frequency', 'monthly'),
        tge_percentage          = COALESCE((v_schedule->>'tge_percentage')::numeric, 0),
        cliff_unlock_percentage = COALESCE((v_schedule->>'cliff_unlock_percentage')::numeric, 0),
        notes                   = v_schedule->>'notes'
      WHERE allocation_id = v_alloc_id;
    ELSE
      INSERT INTO factory_vesting_schedules (
        allocation_id, cliff_months, duration_months, frequency,
        tge_percentage, cliff_unlock_percentage, notes
      ) VALUES (
        v_alloc_id,
        COALESCE((v_schedule->>'cliff_months')::int, 0),
        COALESCE((v_schedule->>'duration_months')::int, 0),
        COALESCE(v_schedule->>'frequency', 'monthly'),
        COALESCE((v_schedule->>'tge_percentage')::numeric, 0),
        COALESCE((v_schedule->>'cliff_unlock_percentage')::numeric, 0),
        v_schedule->>'notes'
      );
    END IF;
    v_submitted_alloc_ids := v_submitted_alloc_ids || v_alloc_id;
  END LOOP;

  -- Delete vesting for allocations in scope that the user removed (kept-in-place
  -- rows keep their id).
  DELETE FROM factory_vesting_schedules
  WHERE allocation_id = ANY(p_allocation_ids::uuid[])
    AND NOT (allocation_id = ANY(v_submitted_alloc_ids));

  -- Atomic project bump
  UPDATE factory_projects SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_project_id;

  RETURN v_new_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_factory_vesting_schedules_tx(uuid, text[], jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_factory_vesting_schedules_tx(uuid, text[], jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;

-- ── save_factory_emission_model_tx ──────────────────────────────────────────
-- Derived from save_emission_model_tx.
CREATE OR REPLACE FUNCTION public.save_factory_emission_model_tx(
  p_project_id uuid,
  p_model jsonb,
  p_expected_updated_at timestamptz,
  p_completeness integer DEFAULT NULL,
  p_cluster_scores jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
  v_owner              uuid;
BEGIN
  SELECT created_by, updated_at INTO v_owner, v_current_updated_at
  FROM factory_projects WHERE id = p_project_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: design not found or not owned'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this design'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Design was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Upsert emission model
  INSERT INTO factory_emission_models (
    project_id, type, annual_inflation_rate, inflation_schedule,
    has_burn, burn_details, has_buyback, buyback_details, notes
  ) VALUES (
    p_project_id,
    p_model->>'type',
    NULLIF(p_model->>'annual_inflation_rate', '')::numeric,
    p_model->'inflation_schedule',
    COALESCE((p_model->>'has_burn')::boolean, false),
    p_model->>'burn_details',
    COALESCE((p_model->>'has_buyback')::boolean, false),
    p_model->>'buyback_details',
    p_model->>'notes'
  )
  ON CONFLICT (project_id) DO UPDATE SET
    type                  = EXCLUDED.type,
    annual_inflation_rate = EXCLUDED.annual_inflation_rate,
    inflation_schedule    = EXCLUDED.inflation_schedule,
    has_burn              = EXCLUDED.has_burn,
    has_buyback           = EXCLUDED.has_buyback,
    burn_details          = EXCLUDED.burn_details,
    buyback_details       = EXCLUDED.buyback_details,
    notes                 = EXCLUDED.notes;

  -- Atomic project bump
  UPDATE factory_projects SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_project_id;

  RETURN v_new_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_factory_emission_model_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_factory_emission_model_tx(uuid, jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;

COMMIT;
