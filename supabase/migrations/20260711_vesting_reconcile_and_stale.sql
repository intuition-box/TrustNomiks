-- ============================================================================
-- Reconcile vesting_schedules by allocation_id (stable row id) + stale hook
--
-- Why
-- -----------------------------------------------------------------------------
-- save_vesting_schedules_tx currently deletes every vesting_schedules row in
-- scope and re-INSERTs the submitted set from scratch on EVERY save (see the
-- canonical body in 20260711_merge_saves_a4_and_contributor.sql, which this
-- migration supersedes for this one function -- apply AFTER it). That
-- teardown/rebuild means a given allocation's vesting_schedules.id changes on
-- every save. Two things break because of that:
--
--   1. The on-chain resolver (src/lib/intuition/claim-triple.ts) matches a
--      vesting_schedule claim's published triple by
--      `origin_row_id = vesting_schedules.id` (NOT the allocation id --
--      vesting_schedule is the one claim type where the row id differs from
--      claim_id, see the header of 20260709_add_challenges.sql). Once the id
--      changes, the previously-published triple's origin_row_id no longer
--      matches any live row, so the resolver can no longer connect on-chain
--      state back to the current schedule.
--   2. A per-row AFTER INSERT/UPDATE/DELETE trigger (the pattern used for
--      allocation_segments in 20260711_add_allocation_stale_hook.sql) is only
--      correct when the save path reconciles by id -- otherwise every row
--      looks like a fresh INSERT on every save and every open challenge would
--      be spuriously staled/adopted. 20260711_add_allocation_stale_hook.sql
--      explicitly deferred the vesting_schedules trigger for this reason.
--
-- Since vesting_schedules is 1:1 with an allocation_segments row
-- (allocation_id, unique per schedule), reconciling by allocation_id keeps
-- the row id stable across saves (UPDATE in place for a kept allocation,
-- INSERT only for a genuinely new one, DELETE only for an allocation whose
-- vesting the user actually removed) -- fixing both (1) and (2) with a single
-- change to the mutation block.
--
-- Part 1 -- CREATE OR REPLACE save_vesting_schedules_tx
-- -----------------------------------------------------------------------------
-- Reproduces the function VERBATIM from
-- 20260711_merge_saves_a4_and_contributor.sql (signature, DECLARE block, the
-- A4 owner-or-moderator ownership check, the contributor-or-moderator gate,
-- the optimistic-lock check, the atomic tokens bump, the moderator_corrected
-- event, RETURN, REVOKE/GRANT) with ONLY the mutation block replaced: the
-- unconditional `DELETE ... ; FOR ... INSERT` pair is replaced by a
-- reconcile-by-allocation_id loop (UPDATE-if-exists / INSERT-if-not, mirroring
-- save_allocations_tx's reconcile pattern in the same merge file) followed by
-- a scoped DELETE that only removes allocations the user actually dropped
-- from p_allocation_ids -- rows that are kept-in-place never lose their id.
-- DECLARE gains v_alloc_id / v_submitted_alloc_ids alongside the existing
-- v_schedule.
--
-- Part 2 -- vesting_schedule_stales_challenges trigger
-- -----------------------------------------------------------------------------
-- Mirrors allocation_segment_stales_challenges (20260711_add_allocation_stale_hook.sql)
-- field-for-field, with the two differences that table forces:
--   - vesting_schedules has no token_id column (unlike allocation_segments),
--     so it's derived per-row via
--     `SELECT token_id INTO v_token_id FROM allocation_segments WHERE id = NEW.allocation_id`
--     (OLD.allocation_id on DELETE). A NULL result (allocation gone, or the
--     trigger racing a cascade) is a no-op, not an error.
--   - challenges.claim_id for claim_type = 'vesting_schedule' is the
--     allocation_segments id, not the vesting_schedules id (see
--     challenges_claim_id_shape + the resolver comment above) -- so every
--     PERFORM/UPDATE below keys off NEW.allocation_id / OLD.allocation_id,
--     never the row's own id.
-- Fields covered (src/lib/claims/field-registry.ts, vesting_schedule):
-- cliff_months, duration_months, frequency, tge_percentage,
-- cliff_unlock_percentage. Depends only on
-- public.mark_stale_challenges_for_field(...) (20260709_add_challenges_rpcs.sql)
-- and the challenges/challenge_events tables (20260709_add_challenges.sql).
-- DROP TRIGGER IF EXISTS precedes CREATE TRIGGER for replay safety.
--
-- The trigger function itself is never called directly (only fired by its
-- AFTER trigger), so EXECUTE is revoked from PUBLIC, anon, *and*
-- authenticated -- one step further than 20260711_revoke_anon_on_stale_trigger_functions.sql
-- revoked for the other four stale-trigger functions (PUBLIC, anon only,
-- per Supabase advisor 0028). That gap in the other four is pre-existing and
-- out of scope here; flagging it as a candidate follow-up rather than folding
-- an unrelated fix into this migration.
-- ============================================================================

BEGIN;

-- ── save_vesting_schedules_tx ───────────────────────────────────────────────
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

  -- Reconcile by allocation_id: UPDATE in place for a kept allocation (row id
  -- stable), INSERT only for a genuinely new one.
  FOR v_schedule IN SELECT * FROM jsonb_array_elements(p_schedules)
  LOOP
    v_alloc_id := (v_schedule->>'allocation_id')::uuid;
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

-- ── vesting_schedule_stales_challenges ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vesting_schedule_stales_challenges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token_id uuid;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT token_id INTO v_token_id FROM allocation_segments WHERE id = NEW.allocation_id;
    IF v_token_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF (TG_OP = 'INSERT') OR (OLD.cliff_months IS DISTINCT FROM NEW.cliff_months) THEN
      PERFORM public.mark_stale_challenges_for_field(
        v_token_id, 'vesting_schedule', NEW.allocation_id, 'cliff_months', to_jsonb(NEW.cliff_months)
      );
    END IF;

    IF (TG_OP = 'INSERT') OR (OLD.duration_months IS DISTINCT FROM NEW.duration_months) THEN
      PERFORM public.mark_stale_challenges_for_field(
        v_token_id, 'vesting_schedule', NEW.allocation_id, 'duration_months', to_jsonb(NEW.duration_months)
      );
    END IF;

    IF (TG_OP = 'INSERT') OR (OLD.frequency IS DISTINCT FROM NEW.frequency) THEN
      PERFORM public.mark_stale_challenges_for_field(
        v_token_id, 'vesting_schedule', NEW.allocation_id, 'frequency', to_jsonb(NEW.frequency)
      );
    END IF;

    IF (TG_OP = 'INSERT') OR (OLD.tge_percentage IS DISTINCT FROM NEW.tge_percentage) THEN
      PERFORM public.mark_stale_challenges_for_field(
        v_token_id, 'vesting_schedule', NEW.allocation_id, 'tge_percentage', to_jsonb(NEW.tge_percentage)
      );
    END IF;

    IF (TG_OP = 'INSERT') OR (OLD.cliff_unlock_percentage IS DISTINCT FROM NEW.cliff_unlock_percentage) THEN
      PERFORM public.mark_stale_challenges_for_field(
        v_token_id, 'vesting_schedule', NEW.allocation_id, 'cliff_unlock_percentage', to_jsonb(NEW.cliff_unlock_percentage)
      );
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT token_id INTO v_token_id FROM allocation_segments WHERE id = OLD.allocation_id;

    IF v_token_id IS NOT NULL THEN
      -- Insert the stale_marked events BEFORE the update below, while the
      -- open challenges can still be selected.
      INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, note)
      SELECT id, token_id, 'stale_marked', 'open', 'stale', auth.uid(),
             'vesting schedule removed'
      FROM challenges
      WHERE token_id = v_token_id
        AND claim_type = 'vesting_schedule'
        AND claim_id = OLD.allocation_id
        AND status = 'open';

      UPDATE challenges
      SET status = 'stale', updated_at = now()
      WHERE token_id = v_token_id
        AND claim_type = 'vesting_schedule'
        AND claim_id = OLD.allocation_id
        AND status = 'open';
    END IF;

    RETURN OLD;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.vesting_schedule_stales_challenges() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vesting_schedule_stales_challenges ON vesting_schedules;
CREATE TRIGGER vesting_schedule_stales_challenges
  AFTER INSERT OR UPDATE OR DELETE ON vesting_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.vesting_schedule_stales_challenges();

COMMIT;
