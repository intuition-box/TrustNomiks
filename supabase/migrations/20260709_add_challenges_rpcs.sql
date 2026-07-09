-- ============================================================================
-- Resolve Box workflow RPCs (milestone J2a)
--
-- SECURITY DEFINER RPCs driving the challenge state machine on top of the
-- `challenges` / `challenge_events` tables (20260709_add_challenges.sql,
-- applied first — this migration has a hard dependency on that one):
--   - mark_stale_challenges_for_field: internal helper, not called directly
--     by the app. It is invoked from inside the save_*_tx functions (wired in
--     a later, sibling migration) right after a field is persisted, so any
--     open challenge against that field either gets implicitly accepted (the
--     saved value now matches what the challenge proposed) or marked stale
--     (the field moved to something else while the challenge was open).
--   - open_challenge_tx / withdraw_challenge_tx / resolve_challenge_tx /
--     expire_challenges_tx: the public surface the challenge UI calls.
--
-- Independent of the other 20260709 migrations in this repo
-- (20260709_add_user_roles.sql, 20260709_add_wallet_linking.sql,
-- 20260709_fix_allocations_and_optional_casts.sql,
-- 20260709_fix_supply_metrics_tx_casts.sql,
-- 20260709_harden_kg_views_and_function_grants.sql,
-- 20260709_revoke_public_execute_definer_functions.sql) EXCEPT that it reads
-- public.is_moderator(uuid) from 20260709_add_user_roles.sql and the
-- wallet_links table from 20260709_add_wallet_linking.sql — both must be
-- applied before this file. It also depends on 20260709_add_challenges.sql
-- for the `challenges` / `challenge_events` tables themselves.
-- ============================================================================

-- ============================================================================
-- 1. mark_stale_challenges_for_field — internal helper
--
-- Called by save_*_tx (a sibling migration) immediately after a claim field
-- is persisted. For every OPEN challenge matching (token_id, claim_type,
-- field_key, claim_id):
--   - if the newly saved value equals what the challenge proposed, the
--     challenge is implicitly satisfied: status -> 'accepted' (resolved_via
--     stays NULL — this is an implicit adoption via a normal save, not an
--     owner/moderator decision), with a 'superseded_notice' event so any
--     app-recorded staker is notified the challenge closed favorably.
--   - otherwise the field moved to something else while the challenge was
--     open, so it can no longer be evaluated against the current data:
--     status -> 'stale', with a 'stale_marked' event carrying the new value,
--     plus a 'superseded_notice' event so app-recorded stakers are notified
--     per plan §5.2.
-- No-op when there are zero matching open challenges.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_stale_challenges_for_field(
  p_token_id uuid,
  p_claim_type text,
  p_claim_id uuid,
  p_field_key text,
  p_new_value jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  c       challenges%ROWTYPE;
BEGIN
  FOR c IN
    SELECT * FROM challenges
    WHERE token_id = p_token_id
      AND claim_type = p_claim_type
      AND field_key = p_field_key
      AND claim_id IS NOT DISTINCT FROM p_claim_id
      AND status = 'open'
    FOR UPDATE
  LOOP
    IF p_new_value IS NOT DISTINCT FROM c.proposed_value THEN
      UPDATE challenges
      SET status = 'accepted',
          resolved_at = now(),
          resolution_reason = 'Value updated to the proposed value',
          updated_at = now()
      WHERE id = c.id;

      INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, note)
      VALUES (c.id, p_token_id, 'superseded_notice', 'open', 'accepted', v_actor, 'field updated to proposed value');
    ELSE
      UPDATE challenges
      SET status = 'stale',
          updated_at = now()
      WHERE id = c.id;

      INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, note, metadata)
      VALUES (c.id, p_token_id, 'stale_marked', 'open', 'stale', v_actor, 'field re-edited', jsonb_build_object('new_value', p_new_value));

      INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, note)
      VALUES (c.id, p_token_id, 'superseded_notice', 'open', 'stale', v_actor, 'field re-edited while challenge was open');
    END IF;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_stale_challenges_for_field(uuid, text, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_stale_challenges_for_field(uuid, text, uuid, text, jsonb) TO authenticated, service_role;

-- ============================================================================
-- 2. open_challenge_tx — open a new challenge against a claim field.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.open_challenge_tx(
  p_token_id uuid,
  p_claim_type text,
  p_claim_id uuid,
  p_field_key text,
  p_challenge_type text,
  p_reason text,
  p_proposed_value jsonb,
  p_snapshot_value jsonb,
  p_evidence_url text,
  p_evidence_note text,
  p_evidence_source_id uuid,
  p_challenger_wallet_address text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet    text := lower(trim(p_challenger_wallet_address));
  v_status    text;
  v_updated   timestamptz;
  v_new_id    uuid;
BEGIN
  -- 1. Wallet gate (plan B4): a linked wallet is required to open a challenge.
  IF NOT EXISTS (
    SELECT 1 FROM wallet_links
    WHERE user_id = auth.uid() AND wallet_address = v_wallet AND unlinked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: a linked wallet is required to open a challenge'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. Token exists and is not draft.
  SELECT status, updated_at INTO v_status, v_updated
  FROM tokens WHERE id = p_token_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: token not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'FORBIDDEN: drafts cannot be challenged'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. proposed_value required for 'update' challenges.
  IF p_challenge_type = 'update' AND p_proposed_value IS NULL THEN
    RAISE EXCEPTION 'CONFLICT: update challenges require a proposed value'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 4. Target existence for row-anchored claim types.
  IF p_claim_type IN ('allocation_segment', 'vesting_schedule') THEN
    IF NOT EXISTS (
      SELECT 1 FROM allocation_segments WHERE id = p_claim_id AND token_id = p_token_id
    ) THEN
      RAISE EXCEPTION 'NOT_FOUND: target allocation not found'
        USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- 5. Light rate limit.
  IF (
    SELECT count(*) FROM challenges
    WHERE created_by = auth.uid() AND token_id = p_token_id AND created_at > now() - interval '1 hour'
  ) >= 10 THEN
    RAISE EXCEPTION 'CONFLICT: too many challenges opened recently, slow down'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- 6. Insert the challenge. snapshot_updated_at is server-stamped from the
  -- token's current updated_at (the freshness anchor), never client-supplied.
  BEGIN
    INSERT INTO challenges (
      token_id, claim_type, claim_id, field_key, challenge_type, reason,
      evidence_url, evidence_note, evidence_source_id,
      proposed_value, snapshot_value, snapshot_updated_at,
      challenger_wallet_address, created_by
    ) VALUES (
      p_token_id, p_claim_type, p_claim_id, p_field_key, p_challenge_type, p_reason,
      p_evidence_url, p_evidence_note, p_evidence_source_id,
      p_proposed_value, p_snapshot_value, v_updated,
      v_wallet, auth.uid()
    )
    RETURNING id INTO v_new_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'CONFLICT: a challenge of this type is already open for this field'
        USING ERRCODE = 'serialization_failure';
  END;

  -- 7. Audit event.
  INSERT INTO challenge_events (challenge_id, token_id, event_type, to_status, actor_id, actor_role)
  VALUES (
    v_new_id, p_token_id, 'opened', 'open', auth.uid(),
    CASE WHEN public.is_moderator(auth.uid()) THEN 'moderator' ELSE 'contributor' END
  );

  RETURN jsonb_build_object('id', v_new_id, 'status', 'open');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.open_challenge_tx(uuid, text, uuid, text, text, text, jsonb, jsonb, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_challenge_tx(uuid, text, uuid, text, text, text, jsonb, jsonb, text, text, uuid, text) TO authenticated, service_role;

-- ============================================================================
-- 3. withdraw_challenge_tx — the challenger withdraws their own open challenge.
--
-- Any on-chain stake redemption is a separate wallet action, not handled here.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.withdraw_challenge_tx(p_challenge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_challenge FROM challenges WHERE id = p_challenge_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: challenge not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_challenge.created_by <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: only the challenger can withdraw'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_challenge.status <> 'open' THEN
    RAISE EXCEPTION 'CONFLICT: challenge is no longer open'
      USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE challenges SET status = 'withdrawn', updated_at = now() WHERE id = p_challenge_id;

  INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id)
  VALUES (p_challenge_id, v_challenge.token_id, 'withdrawn', 'open', 'withdrawn', auth.uid());

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.withdraw_challenge_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_challenge_tx(uuid) TO authenticated, service_role;

-- ============================================================================
-- 4. resolve_challenge_tx — token owner or moderator accepts/rejects an open
-- challenge. Recusal: the challenger cannot resolve their own challenge.
--
-- This NEVER writes the token metric itself. On accept it only returns a
-- `next_action` so the UI can deep-link into the studio to actually apply the
-- correction (plan A4) via the save_*_tx path, which then calls
-- mark_stale_challenges_for_field above. Extending save_*_tx so a moderator
-- (not the token owner) can save a correction on someone else's token is
-- milestone J2b — out of scope here; this function only surfaces the CTA.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resolve_challenge_tx(
  p_challenge_id uuid,
  p_decision text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge  challenges%ROWTYPE;
  v_owner      uuid;
  v_is_owner   boolean;
  v_is_mod     boolean;
  v_via        text;
  v_new_status text;
  v_event_type text;
BEGIN
  IF p_decision NOT IN ('accept', 'reject') THEN
    RAISE EXCEPTION 'CONFLICT: invalid decision'
      USING ERRCODE = 'serialization_failure';
  END IF;

  SELECT * INTO v_challenge FROM challenges WHERE id = p_challenge_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: challenge not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_challenge.status <> 'open' THEN
    RAISE EXCEPTION 'CONFLICT: challenge is not open'
      USING ERRCODE = 'serialization_failure';
  END IF;

  SELECT created_by INTO v_owner FROM tokens WHERE id = v_challenge.token_id;

  v_is_owner := (v_owner = auth.uid());
  v_is_mod := public.is_moderator(auth.uid());

  IF NOT (v_is_owner OR v_is_mod) THEN
    RAISE EXCEPTION 'FORBIDDEN: only the token owner or a moderator can resolve'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Recusal: the challenger cannot resolve their own challenge, even if they
  -- also happen to be the token owner or a moderator.
  IF v_challenge.created_by = auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: you cannot resolve your own challenge'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_via := CASE WHEN v_is_owner THEN 'owner' ELSE 'moderator' END;
  v_new_status := CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'rejected' END;
  v_event_type := v_via || '_' || (CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'rejected' END);

  UPDATE challenges
  SET status = v_new_status,
      resolved_by = auth.uid(),
      resolved_via = v_via,
      resolved_at = now(),
      resolution_reason = p_reason,
      updated_at = now()
  WHERE id = p_challenge_id;

  INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, actor_role)
  VALUES (p_challenge_id, v_challenge.token_id, v_event_type, 'open', v_new_status, auth.uid(), v_via);

  RETURN jsonb_build_object(
    'status', v_new_status,
    'next_action', CASE WHEN p_decision = 'accept' THEN jsonb_build_object(
      'kind', 'studio_correction',
      'token_id', v_challenge.token_id,
      'claim_type', v_challenge.claim_type,
      'claim_id', v_challenge.claim_id,
      'field_key', v_challenge.field_key,
      'proposed_value', v_challenge.proposed_value,
      'challenge_type', v_challenge.challenge_type
    ) ELSE NULL END
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_challenge_tx(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_challenge_tx(uuid, text, text) TO authenticated, service_role;

-- ============================================================================
-- 5. expire_challenges_tx — on-demand idempotent sweep.
--
-- Expires every OPEN challenge whose most recent challenge_events.created_at
-- (or challenges.created_at if it has no events) is older than the
-- stale_expiry_days default of 60 days. Safe to call repeatedly and when
-- nothing qualifies.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.expire_challenges_tx()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  WITH last_activity AS (
    SELECT
      c.id,
      c.token_id,
      GREATEST(c.created_at, COALESCE(MAX(e.created_at), c.created_at)) AS activity_at
    FROM challenges c
    LEFT JOIN challenge_events e ON e.challenge_id = c.id
    WHERE c.status = 'open'
    GROUP BY c.id, c.token_id, c.created_at
  ),
  stale AS (
    SELECT id, token_id FROM last_activity
    WHERE activity_at < now() - interval '60 days'
  ),
  updated AS (
    UPDATE challenges
    SET status = 'expired', updated_at = now()
    WHERE id IN (SELECT id FROM stale)
    RETURNING id, token_id
  ),
  logged AS (
    INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, note)
    SELECT id, token_id, 'expired', 'open', 'expired', NULL, 'no activity within expiry window'
    FROM updated
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM logged;

  RETURN jsonb_build_object('expired', v_count);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_challenges_tx() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_challenges_tx() TO authenticated, service_role;
