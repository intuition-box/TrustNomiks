-- ============================================================================
-- Column-by-column cast audit of all save_*_tx functions (follow-up to
-- 20260709_fix_supply_metrics_tx_casts.sql, after allocations hit the same
-- 42804 in QA: column "token_amount" is of type bigint but expression is of
-- type text).
--
-- Audit result (live defs vs information_schema.columns):
--   save_allocations_tx        ✗ token_amount (bigint) written as text in both
--                                the UPDATE and INSERT branches — hard failure
--                                on every call that includes a token_amount.
--   save_emission_model_tx     ⚠ annual_inflation_rate::numeric without
--                                NULLIF: an empty-string optional would fail
--                                the cast at runtime (22P02).
--   save_data_sources_tx       ⚠ verified_at::date without NULLIF: same
--                                latent empty-string failure.
--   save_vesting_schedules_tx  ✓ all casts correct.
--   save_risk_flags_tx         ✓ all casts correct.
--
-- This migration re-creates the three affected functions with the casts and
-- NULLIF('') guards; everything else in their bodies is verbatim. Grants are
-- restated for fresh-replay safety (same rationale as the previous fix).
-- ============================================================================

-- ── save_allocations_tx: token_amount must be cast to bigint ────────────────

CREATE OR REPLACE FUNCTION public.save_allocations_tx(
  p_token_id uuid,
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
BEGIN
  -- Ownership check
  IF (SELECT created_by FROM tokens WHERE id = p_token_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own this token'
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

REVOKE EXECUTE ON FUNCTION public.save_allocations_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_allocations_tx(uuid, jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;

-- ── save_emission_model_tx: guard empty-string annual_inflation_rate ────────

CREATE OR REPLACE FUNCTION public.save_emission_model_tx(
  p_token_id uuid,
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
BEGIN
  -- Ownership check
  IF (SELECT created_by FROM tokens WHERE id = p_token_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own this token'
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

REVOKE EXECUTE ON FUNCTION public.save_emission_model_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_emission_model_tx(uuid, jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;

-- ── save_data_sources_tx: guard empty-string verified_at ────────────────────

CREATE OR REPLACE FUNCTION public.save_data_sources_tx(
  p_token_id uuid,
  p_sources jsonb,
  p_attributions jsonb,
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

REVOKE EXECUTE ON FUNCTION public.save_data_sources_tx(uuid, jsonb, jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_data_sources_tx(uuid, jsonb, jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;
