-- ============================================================================
-- Transactional, ownership-checked save for risk_flags.
--
-- Mirrors save_data_sources_tx (20260322_fix_rpc_auth_and_atomic_saves.sql):
-- a SECURITY DEFINER function that performs the destructive delete -> insert in
-- ONE transaction, with a server-side ownership check and an optimistic-lock
-- check against tokens.updated_at. This replaces the previous client-side
-- delete()+insert() in the token form, which was non-atomic (data-loss window
-- on a failed insert) and had no ownership guard (any authenticated user could
-- wipe another owner's risk flags by passing a foreign token_id).
--
-- Apply via the Supabase SQL editor (same workflow as the other migrations).
-- ============================================================================

CREATE OR REPLACE FUNCTION save_risk_flags_tx(
  p_token_id            uuid,
  p_flags               jsonb,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
