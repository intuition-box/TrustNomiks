-- ============================================================================
-- Contributor gate inside the save_*_tx RPCs (dual-auth onboarding)
--
-- The six save_*_tx functions are SECURITY DEFINER and therefore BYPASS the
-- table RLS policies added in 20260710_gate_writes_by_contributor.sql. They are
-- the studio's write path, so they are the real enforcement point: a viewer who
-- still owns a token could otherwise edit its metrics through these RPCs.
--
-- This migration is CREATE OR REPLACE of each function with its body reproduced
-- verbatim from the live definition (preserving every cast/NULLIF fix), adding
-- ONLY a contributor guard immediately after the existing ownership check.
-- ERRCODE insufficient_privilege maps to SQLSTATE 42501, which the client's
-- humanizeWriteError maps to a friendly message.
--
-- Signatures are unchanged, so existing GRANTs (authenticated EXECUTE) are
-- preserved by CREATE OR REPLACE.
--
-- Requires public.is_contributor() (20260710_add_is_contributor_and_profile_trigger.sql).
-- ============================================================================

BEGIN;

-- ── save_allocations_tx ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_allocations_tx(p_token_id uuid, p_segments jsonb, p_expected_updated_at timestamp with time zone, p_completeness integer DEFAULT NULL::integer, p_cluster_scores jsonb DEFAULT NULL::jsonb)
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
BEGIN
  -- Ownership check
  IF (SELECT created_by FROM tokens WHERE id = p_token_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (SECURITY DEFINER bypasses table RLS)
  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Optimistic lock check
  SELECT updated_at INTO v_current_updated_at
  FROM tokens WHERE id = p_token_id;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Token was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Get existing allocation IDs for this token
  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_ids
  FROM allocation_segments WHERE token_id = p_token_id;

  -- Process each segment
  FOR v_segment IN SELECT * FROM jsonb_array_elements(p_segments)
  LOOP
    v_segment_id := NULLIF(v_segment->>'id', '')::uuid;

    IF v_segment_id IS NOT NULL AND v_segment_id = ANY(v_existing_ids) THEN
      -- Update existing segment
      UPDATE allocation_segments SET
        segment_type   = v_segment->>'segment_type',
        label          = v_segment->>'label',
        percentage     = (v_segment->>'percentage')::numeric,
        token_amount   = NULLIF(v_segment->>'token_amount', '')::bigint,
        wallet_address = NULLIF(v_segment->>'wallet_address', '')
      WHERE id = v_segment_id AND token_id = p_token_id;
      v_submitted_existing_ids := v_submitted_existing_ids || v_segment_id;
    ELSE
      -- Insert new segment
      INSERT INTO allocation_segments (
        token_id, segment_type, label, percentage, token_amount, wallet_address
      ) VALUES (
        p_token_id,
        v_segment->>'segment_type',
        v_segment->>'label',
        (v_segment->>'percentage')::numeric,
        NULLIF(v_segment->>'token_amount', '')::bigint,
        NULLIF(v_segment->>'wallet_address', '')
      );
    END IF;
  END LOOP;

  -- Delete allocations removed by user (cascades to vesting_schedules if FK exists)
  DELETE FROM allocation_segments
  WHERE token_id = p_token_id
    AND id = ANY(v_existing_ids)
    AND NOT (id = ANY(v_submitted_existing_ids));

  -- Atomic token bump
  UPDATE tokens SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_token_id;

  -- Return saved segments for client refresh
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.percentage DESC), '[]'::jsonb)
  INTO v_result_segments
  FROM allocation_segments s
  WHERE s.token_id = p_token_id;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'segments', v_result_segments
  );
END;
$function$;

-- ── save_supply_metrics_tx ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_supply_metrics_tx(p_token_id uuid, p_metrics jsonb, p_expected_updated_at timestamp with time zone, p_completeness integer DEFAULT NULL::integer, p_cluster_scores jsonb DEFAULT NULL::jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
BEGIN
  -- Ownership check
  IF (SELECT created_by FROM tokens WHERE id = p_token_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (SECURITY DEFINER bypasses table RLS)
  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Optimistic lock check
  SELECT updated_at INTO v_current_updated_at
  FROM tokens WHERE id = p_token_id;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Token was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Upsert supply metrics
  INSERT INTO supply_metrics (
    token_id, max_supply, initial_supply, tge_supply,
    circulating_supply, circulating_date, source_url, notes
  ) VALUES (
    p_token_id,
    NULLIF(p_metrics->>'max_supply', '')::bigint,
    NULLIF(p_metrics->>'initial_supply', '')::bigint,
    NULLIF(p_metrics->>'tge_supply', '')::bigint,
    NULLIF(p_metrics->>'circulating_supply', '')::bigint,
    NULLIF(p_metrics->>'circulating_date', '')::date,
    p_metrics->>'source_url',
    p_metrics->>'notes'
  )
  ON CONFLICT (token_id) DO UPDATE SET
    max_supply         = EXCLUDED.max_supply,
    initial_supply     = EXCLUDED.initial_supply,
    tge_supply         = EXCLUDED.tge_supply,
    circulating_supply = EXCLUDED.circulating_supply,
    circulating_date   = EXCLUDED.circulating_date,
    source_url         = EXCLUDED.source_url,
    notes              = EXCLUDED.notes;

  -- Atomic token bump
  UPDATE tokens SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_token_id;

  RETURN v_new_updated_at;
END;
$function$;

-- ── save_emission_model_tx ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_emission_model_tx(p_token_id uuid, p_model jsonb, p_expected_updated_at timestamp with time zone, p_completeness integer DEFAULT NULL::integer, p_cluster_scores jsonb DEFAULT NULL::jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
BEGIN
  -- Ownership check
  IF (SELECT created_by FROM tokens WHERE id = p_token_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (SECURITY DEFINER bypasses table RLS)
  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Optimistic lock check
  SELECT updated_at INTO v_current_updated_at
  FROM tokens WHERE id = p_token_id;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Token was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Upsert emission model
  INSERT INTO emission_models (
    token_id, type, annual_inflation_rate, inflation_schedule,
    has_burn, burn_details, has_buyback, buyback_details, notes
  ) VALUES (
    p_token_id,
    p_model->>'type',
    NULLIF(p_model->>'annual_inflation_rate', '')::numeric,
    p_model->'inflation_schedule',
    COALESCE((p_model->>'has_burn')::boolean, false),
    p_model->>'burn_details',
    COALESCE((p_model->>'has_buyback')::boolean, false),
    p_model->>'buyback_details',
    p_model->>'notes'
  )
  ON CONFLICT (token_id) DO UPDATE SET
    type                  = EXCLUDED.type,
    annual_inflation_rate = EXCLUDED.annual_inflation_rate,
    inflation_schedule    = EXCLUDED.inflation_schedule,
    has_burn              = EXCLUDED.has_burn,
    has_buyback           = EXCLUDED.has_buyback,
    burn_details          = EXCLUDED.burn_details,
    buyback_details       = EXCLUDED.buyback_details,
    notes                 = EXCLUDED.notes;

  -- Atomic token bump
  UPDATE tokens SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_token_id;

  RETURN v_new_updated_at;
END;
$function$;

-- ── save_data_sources_tx ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_data_sources_tx(p_token_id uuid, p_sources jsonb, p_attributions jsonb, p_expected_updated_at timestamp with time zone, p_completeness integer DEFAULT NULL::integer, p_cluster_scores jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
  v_source             jsonb;
  v_attribution        jsonb;
  v_source_id          uuid;
  v_new_source_ids     uuid[] := '{}';
  v_idx                int;
  v_db_source_id       uuid;
BEGIN
  -- Ownership check
  IF (SELECT created_by FROM tokens WHERE id = p_token_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (SECURITY DEFINER bypasses table RLS)
  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Optimistic lock check
  SELECT updated_at INTO v_current_updated_at
  FROM tokens WHERE id = p_token_id;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Token was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Delete existing sources (claim_sources auto-cascade via FK ON DELETE CASCADE)
  DELETE FROM data_sources WHERE token_id = p_token_id;

  -- Insert new sources, collecting IDs in order
  FOR v_source IN SELECT * FROM jsonb_array_elements(p_sources)
  LOOP
    INSERT INTO data_sources (
      token_id, source_type, document_name, url, version, verified_at
    ) VALUES (
      p_token_id,
      v_source->>'source_type',
      v_source->>'document_name',
      v_source->>'url',
      v_source->>'version',
      NULLIF(v_source->>'verified_at', '')::date
    )
    RETURNING id INTO v_source_id;

    v_new_source_ids := v_new_source_ids || v_source_id;
  END LOOP;

  -- Insert claim attributions, mapping source index to DB UUID
  IF p_attributions IS NOT NULL AND jsonb_array_length(p_attributions) > 0 THEN
    FOR v_attribution IN SELECT * FROM jsonb_array_elements(p_attributions)
    LOOP
      v_idx := (v_attribution->>'source_index')::int;
      IF v_idx >= 0 AND v_idx < array_length(v_new_source_ids, 1) THEN
        v_db_source_id := v_new_source_ids[v_idx + 1]; -- PG arrays are 1-indexed
        INSERT INTO claim_sources (token_id, data_source_id, claim_type, claim_id)
        VALUES (
          p_token_id,
          v_db_source_id,
          v_attribution->>'claim_type',
          NULLIF(v_attribution->>'claim_id', '')::uuid
        );
      END IF;
    END LOOP;
  END IF;

  -- Atomic token bump
  UPDATE tokens SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_token_id;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'source_ids', to_jsonb(v_new_source_ids)
  );
END;
$function$;

-- ── save_vesting_schedules_tx ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_vesting_schedules_tx(p_token_id uuid, p_allocation_ids text[], p_schedules jsonb, p_expected_updated_at timestamp with time zone, p_completeness integer DEFAULT NULL::integer, p_cluster_scores jsonb DEFAULT NULL::jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
  v_schedule           jsonb;
BEGIN
  -- Ownership check
  IF (SELECT created_by FROM tokens WHERE id = p_token_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (SECURITY DEFINER bypasses table RLS)
  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Optimistic lock check
  SELECT updated_at INTO v_current_updated_at
  FROM tokens WHERE id = p_token_id;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Token was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Delete existing vesting schedules for these allocations
  DELETE FROM vesting_schedules
  WHERE allocation_id = ANY(p_allocation_ids::uuid[]);

  -- Insert new schedules
  FOR v_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    INSERT INTO vesting_schedules (
      allocation_id, cliff_months, duration_months, frequency,
      tge_percentage, cliff_unlock_percentage, notes
    ) VALUES (
      (v_schedule->>'allocation_id')::uuid,
      COALESCE((v_schedule->>'cliff_months')::int, 0),
      COALESCE((v_schedule->>'duration_months')::int, 0),
      COALESCE(v_schedule->>'frequency', 'monthly'),
      COALESCE((v_schedule->>'tge_percentage')::numeric, 0),
      COALESCE((v_schedule->>'cliff_unlock_percentage')::numeric, 0),
      v_schedule->>'notes'
    );
  END LOOP;

  -- Atomic token bump
  UPDATE tokens SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_token_id;

  RETURN v_new_updated_at;
END;
$function$;

-- ── save_risk_flags_tx ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_risk_flags_tx(p_token_id uuid, p_flags jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
  v_flag               jsonb;
  v_flag_id            uuid;
  v_new_flag_ids       uuid[] := '{}';
BEGIN
  -- Ownership check
  IF (SELECT created_by FROM tokens WHERE id = p_token_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (SECURITY DEFINER bypasses table RLS)
  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Optimistic lock check
  SELECT updated_at INTO v_current_updated_at
  FROM tokens WHERE id = p_token_id;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Token was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Replace the full set of risk flags for this token
  DELETE FROM risk_flags WHERE token_id = p_token_id;

  IF p_flags IS NOT NULL AND jsonb_array_length(p_flags) > 0 THEN
    FOR v_flag IN SELECT * FROM jsonb_array_elements(p_flags)
    LOOP
      INSERT INTO risk_flags (
        token_id, flag_type, severity, is_flagged, justification
      ) VALUES (
        p_token_id,
        v_flag->>'flag_type',
        v_flag->>'severity',
        COALESCE((v_flag->>'is_flagged')::boolean, true),
        NULLIF(v_flag->>'justification', '')
      )
      RETURNING id INTO v_flag_id;

      v_new_flag_ids := v_new_flag_ids || v_flag_id;
    END LOOP;
  END IF;

  -- Atomic token bump (keeps the optimistic-lock chain consistent)
  UPDATE tokens SET updated_at = v_new_updated_at WHERE id = p_token_id;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'flag_ids', to_jsonb(v_new_flag_ids)
  );
END;
$function$;

COMMIT;
