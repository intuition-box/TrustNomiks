-- ============================================================================
-- evaluate_stake_threshold_tx (milestone J4)
--
-- The freshness-bounded state machine that lets a community stake threshold
-- on a published Resolve Box dispute auto-adopt after an owner-response
-- window and a moderator veto window. Applies to published disputes only
-- (challenge_type = 'dispute' AND counter_term_id IS NOT NULL — an on-chain
-- counter market must exist to stake against); 'update' challenges are
-- resolved exclusively via resolve_challenge_tx. This RPC never writes token
-- data itself — its only durable effects are challenges.status /
-- auto_adopt_eligible_at bookkeeping and challenge_events audit rows; the
-- actual metric correction (if any) still flows through the owner/moderator
-- studio path per resolve_challenge_tx's `next_action` contract.
--
-- The caller (an app job or a client action) passes a server-verified
-- on-chain stake snapshot (p_threshold_met / p_verified_stake_wei /
-- p_verified_accounts / p_verified_at). The freshness bound on that snapshot
-- is enforced IN this RPC, not left to the caller, so a stale read can never
-- silently drive a state transition. No wallet/role gate: any authenticated
-- caller may trigger an evaluation, since the function only ever acts on
-- fresh, independently-verified data and its effect is a display verdict.
--
-- MVP constant windows (see DECLARE block below), literals for now:
--   - owner-response window: 5 days from challenge creation before any
--     auto-adopt progression is possible.
--   - moderator veto window: 7 days from when the stake threshold first
--     holds, during which a moderator can still resolve the dispute
--     manually before it auto-adopts.
--   - freshness bound: the verified snapshot must be no older than 5 minutes.
--
-- Depends on the J2a challenge schema from 20260709_add_challenges.sql
-- (challenges.status/challenge_type/counter_term_id/auto_adopt_eligible_at/
-- resolved_by/resolved_via/resolved_at/resolution_reason and the
-- challenge_events table with the veto_window_started/veto_window_cleared/
-- auto_adopted event types), which must be applied before this file.
-- Additive and otherwise independent of every other migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.evaluate_stake_threshold_tx(
  p_challenge_id uuid,
  p_threshold_met boolean,
  p_verified_stake_wei text,
  p_verified_accounts integer,
  p_verified_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- MVP literals: not yet configurable, hardcoded as the initial policy.
  c_owner_response_window constant interval := interval '5 days';  -- time the token owner has to respond before auto-adopt progression can start
  c_moderator_veto_window constant interval := interval '7 days';  -- time a moderator has to veto once the stake threshold first holds
  c_freshness_window      constant interval := interval '5 minutes'; -- max age of the verified on-chain snapshot accepted by this RPC
  v_challenge challenges%ROWTYPE;
BEGIN
  -- 1. Freshness bound — enforced here, not by the caller. A stale verified
  -- snapshot must never be allowed to drive a state transition.
  IF p_verified_at <= now() - c_freshness_window THEN
    RAISE EXCEPTION 'CONFLICT: stale threshold evaluation'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 2. Load the challenge row, locking it against concurrent evaluations.
  SELECT * INTO v_challenge FROM challenges WHERE id = p_challenge_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: challenge not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- 3. Only open challenges can be evaluated.
  IF v_challenge.status <> 'open' THEN
    RAISE EXCEPTION 'CONFLICT: challenge is not open'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 4. Auto-threshold only applies to disputes; 'update' challenges are
  -- resolved via resolve_challenge_tx, never auto-adopted by stake.
  IF v_challenge.challenge_type <> 'dispute' THEN
    RAISE EXCEPTION 'CONFLICT: auto-threshold applies to disputes only'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 5. Only published disputes have an on-chain counter market to stake
  -- against; an unpublished dispute has no market for a threshold to hold on.
  IF v_challenge.counter_term_id IS NULL THEN
    RAISE EXCEPTION 'CONFLICT: not_published: dispute has no on-chain counter market'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 6. Owner-response window: give the token owner time to respond before any
  -- auto-adopt progression can begin. No state change while waiting.
  IF now() < v_challenge.created_at + c_owner_response_window THEN
    RETURN jsonb_build_object(
      'status', 'waiting_owner_window',
      'eligible_from', v_challenge.created_at + c_owner_response_window
    );
  END IF;

  IF p_threshold_met THEN
    IF v_challenge.auto_adopt_eligible_at IS NULL THEN
      -- Threshold holds for the first time: start the veto window clock.
      UPDATE challenges
      SET auto_adopt_eligible_at = now(),
          updated_at = now()
      WHERE id = p_challenge_id;

      INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, metadata)
      VALUES (
        p_challenge_id, v_challenge.token_id, 'veto_window_started', 'open', 'open', auth.uid(),
        jsonb_build_object('verified_stake_wei', p_verified_stake_wei, 'verified_accounts', p_verified_accounts)
      );

      RETURN jsonb_build_object('status', 'veto_started', 'veto_until', now() + c_moderator_veto_window);

    ELSIF now() >= v_challenge.auto_adopt_eligible_at + c_moderator_veto_window THEN
      -- Threshold held through the full veto window without a moderator
      -- veto: auto-adopt. This is a presentational verdict only — it never
      -- writes token data.
      UPDATE challenges
      SET status = 'auto_adopted',
          resolved_by = NULL,
          resolved_via = 'auto_threshold',
          resolved_at = now(),
          resolution_reason = 'Auto-adopted after the community stake threshold held through the veto window',
          updated_at = now()
      WHERE id = p_challenge_id;

      INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, metadata)
      VALUES (
        p_challenge_id, v_challenge.token_id, 'auto_adopted', 'open', 'auto_adopted', NULL,
        jsonb_build_object('verified_stake_wei', p_verified_stake_wei, 'verified_accounts', p_verified_accounts)
      );

      RETURN jsonb_build_object('status', 'auto_adopted');

    ELSE
      -- Still within the veto window; no state change.
      RETURN jsonb_build_object(
        'status', 'in_veto_window',
        'veto_until', v_challenge.auto_adopt_eligible_at + c_moderator_veto_window
      );
    END IF;

  ELSE
    IF v_challenge.auto_adopt_eligible_at IS NOT NULL THEN
      -- Threshold no longer holds: clear the veto window clock.
      UPDATE challenges
      SET auto_adopt_eligible_at = NULL,
          updated_at = now()
      WHERE id = p_challenge_id;

      INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, metadata)
      VALUES (
        p_challenge_id, v_challenge.token_id, 'veto_window_cleared', 'open', 'open', auth.uid(),
        jsonb_build_object('verified_stake_wei', p_verified_stake_wei, 'verified_accounts', p_verified_accounts)
      );

      RETURN jsonb_build_object('status', 'veto_cleared');
    ELSE
      RETURN jsonb_build_object('status', 'below_threshold');
    END IF;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.evaluate_stake_threshold_tx(uuid, boolean, text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_stake_threshold_tx(uuid, boolean, text, integer, timestamptz) TO authenticated, service_role;
