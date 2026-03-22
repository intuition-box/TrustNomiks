-- RPC: Atomically save vesting schedules with optimistic locking
CREATE OR REPLACE FUNCTION save_vesting_schedules_tx(
  p_token_id uuid,
  p_allocation_ids text[],
  p_schedules jsonb,
  p_expected_updated_at timestamptz
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at timestamptz := now();
  v_schedule jsonb;
BEGIN
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

  -- Bump token timestamp
  UPDATE tokens SET updated_at = v_new_updated_at WHERE id = p_token_id;

  RETURN v_new_updated_at;
END;
$$;

-- RPC: Atomically save data sources + claim attributions with optimistic locking
CREATE OR REPLACE FUNCTION save_data_sources_tx(
  p_token_id uuid,
  p_sources jsonb,
  p_attributions jsonb,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at timestamptz := now();
  v_source jsonb;
  v_attribution jsonb;
  v_source_id uuid;
  v_new_source_ids uuid[] := '{}';
  v_idx int;
  v_db_source_id uuid;
BEGIN
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
      v_source->>'verified_at'
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
          NULLIF(v_attribution->>'claim_id', '')
        );
      END IF;
    END LOOP;
  END IF;

  -- Bump token timestamp
  UPDATE tokens SET updated_at = v_new_updated_at WHERE id = p_token_id;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'source_ids', to_jsonb(v_new_source_ids)
  );
END;
$$;
