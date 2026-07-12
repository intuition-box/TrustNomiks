-- ============================================================================
-- Scope save_vesting_schedules_tx's allocation ids to the token being saved
--
-- Finding (2026-07-12, confirmed against the live definition): the ownership
-- prologue only proves the caller owns (or moderates) p_token_id; the mutation
-- block then trusts p_allocation_ids and each schedule row's allocation_id
-- as-is. SECURITY DEFINER bypasses RLS, so a contributor who owns token A
-- could pass token B's allocation ids and delete or overwrite B's
-- vesting_schedules rows (cross-tenant write). The factory twin
-- (save_factory_vesting_schedules_tx, 20260715_add_factory_projects.sql)
-- shipped with this guard from day one; this migration backports it to the
-- screener RPC.
--
-- Body reproduced VERBATIM from 20260711_vesting_reconcile_and_stale.sql
-- (the current live definition: reconcile-by-allocation_id, A4
-- owner-or-moderator check, contributor gate, optimistic lock, atomic bump,
-- moderator_corrected event, REVOKE/GRANT) with ONLY the two scope guards
-- added, marked -- SCOPE GUARD below: one over p_allocation_ids (protects the
-- trailing DELETE) and one per schedule row inside the reconcile loop
-- (protects the UPDATE/INSERT). A moderator is NOT exempt: whoever the
-- caller, this RPC may only ever touch allocations of p_token_id.
--
-- Apply after 20260715_add_factory_projects.sql (filename order).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.save_vesting_schedules_tx(p_token_id uuid, p_allocation_ids text[], p_schedules jsonb, p_expected_updated_at timestamp with time zone, p_completeness integer DEFAULT NULL::integer, p_cluster_scores jsonb DEFAULT NULL::jsonb)
 RETURNS timestamp with time zone
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
  v_is_owner            boolean;
  v_is_mod              boolean;
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

  -- SCOPE GUARD: reject any allocation id that does not belong to this token
  -- (DEFINER bypasses RLS; the ownership check above only covers the token row).
  IF EXISTS (
    SELECT 1 FROM unnest(p_allocation_ids::uuid[]) AS a(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM allocation_segments s
      WHERE s.id = a.id AND s.token_id = p_token_id
    )
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: allocation does not belong to this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reconcile by allocation_id: UPDATE in place for a kept allocation (row id
  -- stable), INSERT only for a genuinely new one.
  FOR v_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    v_alloc_id := (v_schedule->>'allocation_id')::uuid;

    -- SCOPE GUARD: same check for schedule rows not covered by p_allocation_ids.
    IF NOT EXISTS (
      SELECT 1 FROM allocation_segments s
      WHERE s.id = v_alloc_id AND s.token_id = p_token_id
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: allocation does not belong to this token'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (SELECT 1 FROM vesting_schedules WHERE allocation_id = v_alloc_id) THEN
      UPDATE vesting_schedules SET
        cliff_months            = COALESCE((v_schedule->>'cliff_months')::int, 0),
        duration_months         = COALESCE((v_schedule->>'duration_months')::int, 0),
        frequency               = COALESCE(v_schedule->>'frequency', 'monthly'),
        tge_percentage          = COALESCE((v_schedule->>'tge_percentage')::numeric, 0),
        cliff_unlock_percentage = COALESCE((v_schedule->>'cliff_unlock_percentage')::numeric, 0),
        notes                   = v_schedule->>'notes'
      WHERE allocation_id = v_alloc_id;
    ELSE
      INSERT INTO vesting_schedules (
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
  -- rows keep their id, so the on-chain origin_row_id stays stable).
  DELETE FROM vesting_schedules
  WHERE allocation_id = ANY(p_allocation_ids::uuid[])
    AND NOT (allocation_id = ANY(v_submitted_alloc_ids));

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

COMMIT;
