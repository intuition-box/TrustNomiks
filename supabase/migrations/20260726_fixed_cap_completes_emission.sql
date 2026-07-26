-- ============================================================================
-- Promote gate: a pure fixed cap completes the emission cluster on its own.
--
-- computeFactoryScore's second emission half-point used to require an
-- inflation rate, a burn or a buyback; a pure BTC-style fixed_cap design
-- therefore capped at 94/100 and could never clear the strict 100/100
-- promote gate. Decision (Léo, 2026-07-15): the fixed cap IS the whole
-- emission decision, so the type alone completes the cluster. The TS scorer
-- (factory-score.ts) and this SQL mirror change together.
--
-- Full CREATE OR REPLACE of promote_factory_project_tx: identical to
-- 20260725 except the emission condition in the completeness gate.
-- ============================================================================

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
  -- iff all of them hold. Emission: a pure fixed_cap completes the cluster on
  -- its own; every other type needs a declared mechanic (NB the scorer treats
  -- a JS-falsy inflation rate — null OR 0 — as absent, hence `<> 0`).
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
          v_emission.type = 'fixed_cap'
          OR (v_emission.annual_inflation_rate IS NOT NULL AND v_emission.annual_inflation_rate <> 0)
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
