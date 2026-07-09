-- ============================================================================
-- Merge the two conflicting concurrent redefinitions of the six save_*_tx RPCs
--
-- Two migrations landed independently, each a CREATE OR REPLACE of the same
-- six functions (save_supply_metrics_tx, save_allocations_tx,
-- save_emission_model_tx, save_data_sources_tx, save_vesting_schedules_tx,
-- save_risk_flags_tx), with different auth logic:
--   - 20260710_extend_saves_a4_moderator.sql (decision A4): ownership check
--     allows owner OR moderator, and logs a 'moderator_corrected'
--     challenge_events row when a moderator-not-owner writes.
--   - 20260710_gate_save_tx_rpcs_by_contributor.sql: keeps owner-only
--     ownership, and adds an IF NOT public.is_contributor() THEN RAISE
--     'FORBIDDEN: Contributor role required' gate right after it.
-- Whichever of those two applies last silently wins and drops the other's
-- behavior change -- CREATE OR REPLACE has no notion of merging bodies.
--
-- This migration supersedes BOTH of them for these six functions and MUST be
-- applied LAST, i.e. after:
--   - 20260709_add_user_roles.sql                       (defines is_moderator())
--   - 20260710_add_is_contributor_and_profile_trigger.sql (defines is_contributor())
--   - 20260710_extend_saves_a4_moderator.sql
--   - 20260710_gate_save_tx_rpcs_by_contributor.sql
--
-- Merged rule per function: owner-or-moderator ownership check, THEN a
-- contributor-or-moderator gate (a correcting moderator need not also be a
-- contributor), THEN -- immediately before RETURN -- a 'moderator_corrected'
-- challenge_events audit row when the caller is a moderator acting on a token
-- they do not own.
--
-- Every function body below is reproduced VERBATIM from
-- 20260710_gate_save_tx_rpcs_by_contributor.sql (that file already carries
-- the full, cast-correct body plus the contributor gate for all six), with
-- ONLY the auth block replaced (owner-only -> owner-or-moderator, plus a
-- moderator bypass on the contributor gate) and the moderator_corrected
-- INSERT added before RETURN. DECLARE gains v_owner/v_is_owner/v_is_mod.
-- Signatures, casts, NULLIF guards, delete/insert and reconcile loops,
-- cluster_scores/completeness bump, and RETURN shapes are all untouched.
--
-- REVOKE/GRANT is restated after each CREATE OR REPLACE with the function's
-- exact signature, consistently as `REVOKE ... FROM PUBLIC, anon` + `GRANT
-- ... TO authenticated, service_role` (some earlier migrations only revoked
-- FROM PUBLIC; this migration normalizes all six to the anon-inclusive form).
-- ============================================================================

BEGIN;

-- ── save_supply_metrics_tx ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_supply_metrics_tx(p_token_id uuid, p_metrics jsonb, p_expected_updated_at timestamp with time zone, p_completeness integer DEFAULT NULL::integer, p_cluster_scores jsonb DEFAULT NULL::jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
  v_owner              uuid;
  v_is_owner           boolean;
  v_is_mod             boolean;
BEGIN
  -- Ownership (A4: moderators may correct any token)
  SELECT created_by INTO v_owner FROM tokens WHERE id = p_token_id;
  v_is_owner := (v_owner IS NOT DISTINCT FROM auth.uid());   -- NULL-safe: non-existent token still forbids
  v_is_mod := public.is_moderator(auth.uid());

  IF NOT (v_is_owner OR v_is_mod) THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (moderators bypass it -- a correcting moderator need not be a contributor)
  IF NOT (public.is_contributor() OR v_is_mod) THEN
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

  IF v_is_mod AND NOT v_is_owner THEN
    INSERT INTO challenge_events (challenge_id, token_id, event_type, actor_id, actor_role, note)
    VALUES (NULL, p_token_id, 'moderator_corrected', auth.uid(), 'moderator', 'save_supply_metrics_tx corrected by moderator');
  END IF;

  RETURN v_new_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_supply_metrics_tx(uuid, jsonb, timestamp with time zone, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_supply_metrics_tx(uuid, jsonb, timestamp with time zone, integer, jsonb) TO authenticated, service_role;

-- ── save_allocations_tx ─────────────────────────────────────────────────────
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
  v_owner                  uuid;
  v_is_owner               boolean;
  v_is_mod                 boolean;
BEGIN
  -- Ownership (A4: moderators may correct any token)
  SELECT created_by INTO v_owner FROM tokens WHERE id = p_token_id;
  v_is_owner := (v_owner IS NOT DISTINCT FROM auth.uid());   -- NULL-safe: non-existent token still forbids
  v_is_mod := public.is_moderator(auth.uid());

  IF NOT (v_is_owner OR v_is_mod) THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (moderators bypass it -- a correcting moderator need not be a contributor)
  IF NOT (public.is_contributor() OR v_is_mod) THEN
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

  IF v_is_mod AND NOT v_is_owner THEN
    INSERT INTO challenge_events (challenge_id, token_id, event_type, actor_id, actor_role, note)
    VALUES (NULL, p_token_id, 'moderator_corrected', auth.uid(), 'moderator', 'save_allocations_tx corrected by moderator');
  END IF;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'segments', v_result_segments
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_allocations_tx(uuid, jsonb, timestamp with time zone, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_allocations_tx(uuid, jsonb, timestamp with time zone, integer, jsonb) TO authenticated, service_role;

-- ── save_emission_model_tx ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_emission_model_tx(p_token_id uuid, p_model jsonb, p_expected_updated_at timestamp with time zone, p_completeness integer DEFAULT NULL::integer, p_cluster_scores jsonb DEFAULT NULL::jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
  v_owner              uuid;
  v_is_owner           boolean;
  v_is_mod             boolean;
BEGIN
  -- Ownership (A4: moderators may correct any token)
  SELECT created_by INTO v_owner FROM tokens WHERE id = p_token_id;
  v_is_owner := (v_owner IS NOT DISTINCT FROM auth.uid());   -- NULL-safe: non-existent token still forbids
  v_is_mod := public.is_moderator(auth.uid());

  IF NOT (v_is_owner OR v_is_mod) THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (moderators bypass it -- a correcting moderator need not be a contributor)
  IF NOT (public.is_contributor() OR v_is_mod) THEN
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

  IF v_is_mod AND NOT v_is_owner THEN
    INSERT INTO challenge_events (challenge_id, token_id, event_type, actor_id, actor_role, note)
    VALUES (NULL, p_token_id, 'moderator_corrected', auth.uid(), 'moderator', 'save_emission_model_tx corrected by moderator');
  END IF;

  RETURN v_new_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_emission_model_tx(uuid, jsonb, timestamp with time zone, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_emission_model_tx(uuid, jsonb, timestamp with time zone, integer, jsonb) TO authenticated, service_role;

-- ── save_data_sources_tx ────────────────────────────────────────────────────
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
  v_owner              uuid;
  v_is_owner           boolean;
  v_is_mod             boolean;
BEGIN
  -- Ownership (A4: moderators may correct any token)
  SELECT created_by INTO v_owner FROM tokens WHERE id = p_token_id;
  v_is_owner := (v_owner IS NOT DISTINCT FROM auth.uid());   -- NULL-safe: non-existent token still forbids
  v_is_mod := public.is_moderator(auth.uid());

  IF NOT (v_is_owner OR v_is_mod) THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (moderators bypass it -- a correcting moderator need not be a contributor)
  IF NOT (public.is_contributor() OR v_is_mod) THEN
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

  IF v_is_mod AND NOT v_is_owner THEN
    INSERT INTO challenge_events (challenge_id, token_id, event_type, actor_id, actor_role, note)
    VALUES (NULL, p_token_id, 'moderator_corrected', auth.uid(), 'moderator', 'save_data_sources_tx corrected by moderator');
  END IF;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'source_ids', to_jsonb(v_new_source_ids)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_data_sources_tx(uuid, jsonb, jsonb, timestamp with time zone, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_data_sources_tx(uuid, jsonb, jsonb, timestamp with time zone, integer, jsonb) TO authenticated, service_role;

-- ── save_vesting_schedules_tx ───────────────────────────────────────────────
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
  v_owner              uuid;
  v_is_owner           boolean;
  v_is_mod             boolean;
BEGIN
  -- Ownership (A4: moderators may correct any token)
  SELECT created_by INTO v_owner FROM tokens WHERE id = p_token_id;
  v_is_owner := (v_owner IS NOT DISTINCT FROM auth.uid());   -- NULL-safe: non-existent token still forbids
  v_is_mod := public.is_moderator(auth.uid());

  IF NOT (v_is_owner OR v_is_mod) THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (moderators bypass it -- a correcting moderator need not be a contributor)
  IF NOT (public.is_contributor() OR v_is_mod) THEN
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

  IF v_is_mod AND NOT v_is_owner THEN
    INSERT INTO challenge_events (challenge_id, token_id, event_type, actor_id, actor_role, note)
    VALUES (NULL, p_token_id, 'moderator_corrected', auth.uid(), 'moderator', 'save_vesting_schedules_tx corrected by moderator');
  END IF;

  RETURN v_new_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_vesting_schedules_tx(uuid, text[], jsonb, timestamp with time zone, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_vesting_schedules_tx(uuid, text[], jsonb, timestamp with time zone, integer, jsonb) TO authenticated, service_role;

-- ── save_risk_flags_tx ──────────────────────────────────────────────────────
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
  v_owner              uuid;
  v_is_owner           boolean;
  v_is_mod             boolean;
BEGIN
  -- Ownership (A4: moderators may correct any token)
  SELECT created_by INTO v_owner FROM tokens WHERE id = p_token_id;
  v_is_owner := (v_owner IS NOT DISTINCT FROM auth.uid());   -- NULL-safe: non-existent token still forbids
  v_is_mod := public.is_moderator(auth.uid());

  IF NOT (v_is_owner OR v_is_mod) THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Contributor gate (moderators bypass it -- a correcting moderator need not be a contributor)
  IF NOT (public.is_contributor() OR v_is_mod) THEN
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

  IF v_is_mod AND NOT v_is_owner THEN
    INSERT INTO challenge_events (challenge_id, token_id, event_type, actor_id, actor_role, note)
    VALUES (NULL, p_token_id, 'moderator_corrected', auth.uid(), 'moderator', 'save_risk_flags_tx corrected by moderator');
  END IF;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'flag_ids', to_jsonb(v_new_flag_ids)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_risk_flags_tx(uuid, jsonb, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_risk_flags_tx(uuid, jsonb, timestamp with time zone) TO authenticated, service_role;

COMMIT;
