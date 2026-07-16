-- ============================================================================
-- Factory: promote a finished design into a screener token.
--
-- A promoted design becomes READ-ONLY (an archive of the design as promoted);
-- the token continues its life in the screener as a private draft owned by
-- the same contributor. Design decisions:
--
--   * The promote gate re-verifies completeness FROM DATA in SQL (mirroring
--     computeFactoryScore's conditions exactly) instead of trusting the stored
--     `completeness` number, which can go stale (the identity save does not
--     re-score).
--   * The read-only lock is a BEFORE UPDATE trigger on factory_projects:
--     every save RPC ends by bumping factory_projects.updated_at, so one
--     trigger atomically locks the whole RPC write path plus the direct
--     benchmark-snapshot UPDATE — no need to re-emit six RPC bodies.
--   * Child-table and snapshot WRITE policies additionally require the parent
--     design to be a draft, so direct PostgREST writes cannot mutate a
--     promoted design's children either. SELECT policies are untouched (the
--     read-only designer still loads everything).
--   * Status transitions and promote bookkeeping columns can only be written
--     by promote_factory_project_tx (transaction-local GUC handshake with the
--     trigger); a raw REST update cannot fake a promotion.
--   * factory_funding_rounds do NOT migrate (the screener has no funding
--     table); the factory allocation `notes` are dropped (allocation_segments
--     has no notes column). Deleting a promoted design stays allowed —
--     removing the archive never touches the promoted token.
-- ============================================================================

-- ── 1. Promote bookkeeping columns ──────────────────────────────────────────
ALTER TABLE factory_projects
  ADD COLUMN IF NOT EXISTS promoted_token_id uuid REFERENCES tokens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

COMMENT ON COLUMN factory_projects.promoted_token_id IS
  'The screener token minted from this design by promote_factory_project_tx. '
  'SET NULL if the token is later deleted; the design stays promoted (archive).';

-- ── 2. Read-only lock: one trigger guards every UPDATE path ─────────────────
-- Every factory save RPC bumps factory_projects.updated_at, and the benchmark
-- panel updates the row directly; both funnel through this trigger. The
-- promote RPC announces itself via a transaction-local GUC so the one
-- legitimate draft→promoted transition passes.
CREATE OR REPLACE FUNCTION public.factory_projects_readonly_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'promoted' THEN
    RAISE EXCEPTION 'READONLY: design has been promoted and is read-only'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.promoted_token_id IS DISTINCT FROM OLD.promoted_token_id
      OR NEW.promoted_at IS DISTINCT FROM OLD.promoted_at)
     AND current_setting('app.factory_promote', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'FORBIDDEN: promotion must go through promote_factory_project_tx'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS factory_projects_lock_promoted ON factory_projects;
CREATE TRIGGER factory_projects_lock_promoted
  BEFORE UPDATE ON factory_projects
  FOR EACH ROW EXECUTE FUNCTION public.factory_projects_readonly_guard();

-- ── 3. Parent INSERT cannot mint a fake promotion ───────────────────────────
-- The BEFORE UPDATE trigger cannot see inserts; without this, a contributor
-- could insert a row already claiming status='promoted' with an arbitrary
-- promoted_token_id (any existing token, even someone else's).
DROP POLICY "factory_projects: owner can insert" ON factory_projects;
CREATE POLICY "factory_projects: owner can insert" ON factory_projects
  FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid())
              AND (SELECT public.is_contributor())
              AND status = 'draft'
              AND promoted_token_id IS NULL
              AND promoted_at IS NULL);

-- ── 4. Child + snapshot WRITE policies require a draft parent ───────────────
-- Mechanical tightening: the ownership subquery gains `status = 'draft'`.
-- SELECT policies are deliberately untouched.

-- factory_supply_metrics
DROP POLICY "factory_supply_metrics: owner can insert" ON factory_supply_metrics;
CREATE POLICY "factory_supply_metrics: owner can insert" ON factory_supply_metrics
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_supply_metrics: owner can update" ON factory_supply_metrics;
CREATE POLICY "factory_supply_metrics: owner can update" ON factory_supply_metrics
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_supply_metrics: owner can delete" ON factory_supply_metrics;
CREATE POLICY "factory_supply_metrics: owner can delete" ON factory_supply_metrics
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()));

-- factory_allocation_segments
DROP POLICY "factory_allocation_segments: owner can insert" ON factory_allocation_segments;
CREATE POLICY "factory_allocation_segments: owner can insert" ON factory_allocation_segments
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_allocation_segments: owner can update" ON factory_allocation_segments;
CREATE POLICY "factory_allocation_segments: owner can update" ON factory_allocation_segments
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_allocation_segments: owner can delete" ON factory_allocation_segments;
CREATE POLICY "factory_allocation_segments: owner can delete" ON factory_allocation_segments
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()));

-- factory_vesting_schedules (two-hop)
DROP POLICY "factory_vesting_schedules: owner can insert" ON factory_vesting_schedules;
CREATE POLICY "factory_vesting_schedules: owner can insert" ON factory_vesting_schedules
  FOR INSERT TO authenticated
  WITH CHECK ((allocation_id IN (
                SELECT s.id FROM factory_allocation_segments s
                JOIN factory_projects p ON p.id = s.project_id
                WHERE p.created_by = auth.uid() AND p.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_vesting_schedules: owner can update" ON factory_vesting_schedules;
CREATE POLICY "factory_vesting_schedules: owner can update" ON factory_vesting_schedules
  FOR UPDATE TO authenticated
  USING ((allocation_id IN (
           SELECT s.id FROM factory_allocation_segments s
           JOIN factory_projects p ON p.id = s.project_id
           WHERE p.created_by = auth.uid() AND p.status = 'draft'))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((allocation_id IN (
                SELECT s.id FROM factory_allocation_segments s
                JOIN factory_projects p ON p.id = s.project_id
                WHERE p.created_by = auth.uid() AND p.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_vesting_schedules: owner can delete" ON factory_vesting_schedules;
CREATE POLICY "factory_vesting_schedules: owner can delete" ON factory_vesting_schedules
  FOR DELETE TO authenticated
  USING ((allocation_id IN (
           SELECT s.id FROM factory_allocation_segments s
           JOIN factory_projects p ON p.id = s.project_id
           WHERE p.created_by = auth.uid() AND p.status = 'draft'))
         AND (SELECT public.is_contributor()));

-- factory_emission_models
DROP POLICY "factory_emission_models: owner can insert" ON factory_emission_models;
CREATE POLICY "factory_emission_models: owner can insert" ON factory_emission_models
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_emission_models: owner can update" ON factory_emission_models;
CREATE POLICY "factory_emission_models: owner can update" ON factory_emission_models
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_emission_models: owner can delete" ON factory_emission_models;
CREATE POLICY "factory_emission_models: owner can delete" ON factory_emission_models
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()));

-- factory_funding_rounds
DROP POLICY "factory_funding_rounds: owner can insert" ON factory_funding_rounds;
CREATE POLICY "factory_funding_rounds: owner can insert" ON factory_funding_rounds
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_funding_rounds: owner can update" ON factory_funding_rounds;
CREATE POLICY "factory_funding_rounds: owner can update" ON factory_funding_rounds
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_funding_rounds: owner can delete" ON factory_funding_rounds;
CREATE POLICY "factory_funding_rounds: owner can delete" ON factory_funding_rounds
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()));

-- factory_simulation_snapshots (blocks new simulation runs on a locked design;
-- existing snapshots stay readable in the read-only studio)
DROP POLICY "factory_simulation_snapshots: owner can insert" ON factory_simulation_snapshots;
CREATE POLICY "factory_simulation_snapshots: owner can insert" ON factory_simulation_snapshots
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_simulation_snapshots: owner can update" ON factory_simulation_snapshots;
CREATE POLICY "factory_simulation_snapshots: owner can update" ON factory_simulation_snapshots
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()
                                AND factory_projects.status = 'draft'))
              AND (SELECT public.is_contributor()));

DROP POLICY "factory_simulation_snapshots: owner can delete" ON factory_simulation_snapshots;
CREATE POLICY "factory_simulation_snapshots: owner can delete" ON factory_simulation_snapshots
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()
                           AND factory_projects.status = 'draft'))
         AND (SELECT public.is_contributor()));

-- ── 5. promote_factory_project_tx ───────────────────────────────────────────
-- House skeleton (single-read owner prologue, contributor gate, optimistic
-- lock); no moderator branch, no challenge_events. The caller passes the
-- SCREENER-scale completeness/cluster_scores (computed client-side via the
-- shared computeScores) for the minted token; the design-side gate is
-- re-verified here from data.
CREATE OR REPLACE FUNCTION public.promote_factory_project_tx(
  p_project_id uuid,
  p_expected_updated_at timestamptz,
  p_token_completeness integer DEFAULT NULL,
  p_token_cluster_scores jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project          factory_projects%ROWTYPE;
  v_supply           factory_supply_metrics%ROWTYPE;
  v_emission         factory_emission_models%ROWTYPE;
  v_alloc            factory_allocation_segments%ROWTYPE;
  v_alloc_count      integer;
  v_alloc_sum        numeric;
  v_vesting_count    integer;
  v_token_id         uuid;
  v_token_updated_at timestamptz;
  v_new_alloc_id     uuid;
  v_now              timestamptz := now();
BEGIN
  -- Ownership + optimistic-lock source of truth in one read.
  SELECT * INTO v_project FROM factory_projects WHERE id = p_project_id;

  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: design not found or not owned'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this design'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.status <> 'draft' THEN
    RAISE EXCEPTION 'READONLY: design has already been promoted'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF v_project.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Design was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Completeness gate, re-verified FROM DATA. These conditions mirror
  -- computeFactoryScore (factory-score.ts) exactly — a design scores 100/100
  -- iff all of them hold. NB the emission sub-point: the scorer treats a
  -- JS-falsy inflation rate (null OR 0) as absent, hence `<> 0` here.
  SELECT * INTO v_supply FROM factory_supply_metrics WHERE project_id = p_project_id;
  SELECT * INTO v_emission FROM factory_emission_models WHERE project_id = p_project_id;
  SELECT count(*), COALESCE(sum(percentage), 0)
    INTO v_alloc_count, v_alloc_sum
    FROM factory_allocation_segments WHERE project_id = p_project_id;
  SELECT count(*) INTO v_vesting_count
    FROM factory_vesting_schedules vs
    JOIN factory_allocation_segments s ON s.id = vs.allocation_id
    WHERE s.project_id = p_project_id;

  IF v_project.category IS NULL OR v_project.sector IS NULL
     OR v_supply.project_id IS NULL OR v_supply.max_supply IS NULL
     OR v_alloc_count < 3 OR abs(v_alloc_sum - 100) >= 0.01
     OR v_vesting_count = 0
     OR v_emission.project_id IS NULL OR v_emission.type IS NULL
     OR NOT (
          (v_emission.annual_inflation_rate IS NOT NULL AND v_emission.annual_inflation_rate <> 0)
          OR v_emission.has_burn
          OR v_emission.has_buyback
        )
  THEN
    RAISE EXCEPTION 'INCOMPLETE: design must be fully complete (100/100) before promotion'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Mint the screener token: a private draft owned by the same contributor.
  -- contract_address / coingecko_* stay NULL by design (the design describes
  -- a token that does not exist on-chain yet); completeness mirrors the
  -- studio's create default when the caller passes none.
  INSERT INTO tokens (
    name, ticker, chain, tge_date, category, sector, notes,
    status, completeness, cluster_scores, created_by
  ) VALUES (
    v_project.name, v_project.ticker, v_project.chain, v_project.tge_date,
    v_project.category, v_project.sector, v_project.notes,
    'draft', COALESCE(p_token_completeness, 10), p_token_cluster_scores, auth.uid()
  )
  RETURNING id, updated_at INTO v_token_id, v_token_updated_at;

  INSERT INTO supply_metrics (
    token_id, max_supply, initial_supply, tge_supply, circulating_supply,
    circulating_date, source_url, notes
  ) VALUES (
    v_token_id, v_supply.max_supply, v_supply.initial_supply, v_supply.tge_supply,
    v_supply.circulating_supply, v_supply.circulating_date, v_supply.source_url,
    v_supply.notes
  );

  -- Allocations carry their 1:1 vesting schedule across via the fresh id.
  -- (allocation_segments has no notes column — the design note stays on the
  -- archived design.)
  FOR v_alloc IN
    SELECT * FROM factory_allocation_segments
    WHERE project_id = p_project_id
    ORDER BY created_at, id
  LOOP
    INSERT INTO allocation_segments (
      token_id, segment_type, label, percentage, token_amount, wallet_address
    ) VALUES (
      v_token_id, v_alloc.segment_type, v_alloc.label, v_alloc.percentage,
      v_alloc.token_amount, v_alloc.wallet_address
    )
    RETURNING id INTO v_new_alloc_id;

    INSERT INTO vesting_schedules (
      allocation_id, cliff_months, duration_months, frequency,
      tge_percentage, cliff_unlock_percentage, notes
    )
    SELECT v_new_alloc_id, fvs.cliff_months, fvs.duration_months, fvs.frequency,
           fvs.tge_percentage, fvs.cliff_unlock_percentage, fvs.notes
    FROM factory_vesting_schedules fvs
    WHERE fvs.allocation_id = v_alloc.id;
  END LOOP;

  INSERT INTO emission_models (
    token_id, type, annual_inflation_rate, inflation_schedule,
    has_burn, burn_details, has_buyback, buyback_details, notes
  ) VALUES (
    v_token_id, v_emission.type, v_emission.annual_inflation_rate,
    v_emission.inflation_schedule, v_emission.has_burn, v_emission.burn_details,
    v_emission.has_buyback, v_emission.buyback_details, v_emission.notes
  );

  -- Lock the design. The transaction-local GUC lets the status transition
  -- through the readonly-guard trigger, and is reset IMMEDIATELY after the
  -- guarded UPDATE: a transaction-local value would otherwise stay '1' until
  -- commit, disarming the guard for any later statement batched in the same
  -- transaction.
  PERFORM set_config('app.factory_promote', '1', true);
  UPDATE factory_projects SET
    status            = 'promoted',
    promoted_token_id = v_token_id,
    promoted_at       = v_now,
    updated_at        = v_now
  WHERE id = p_project_id;
  PERFORM set_config('app.factory_promote', '0', true);

  RETURN jsonb_build_object(
    'token_id', v_token_id,
    'token_updated_at', v_token_updated_at,
    'updated_at', v_now,
    'promoted_at', v_now
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.promote_factory_project_tx(uuid, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_factory_project_tx(uuid, timestamptz, integer, jsonb) TO authenticated, service_role;
