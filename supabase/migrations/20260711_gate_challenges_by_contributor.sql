-- ============================================================================
-- Close the viewer-can-write-challenges hole in the Resolve Box (flagged by
-- the parallel onboarding/dual-auth session)
--
-- Three gaps in the challenge (Resolve Box) tables/RPCs, all stemming from
-- the dual-auth model (viewer vs. contributor, via public.is_contributor())
-- landing after `challenges` already existed:
--
--   1. `challenges` (20260709_add_challenges.sql) carries an INSERT RLS
--      policy, "challenges: authenticated can insert own", with
--      WITH CHECK (created_by = auth.uid()) and NO wallet/contributor gate.
--      Any authenticated viewer could INSERT a challenge row directly via
--      PostgREST, bypassing open_challenge_tx entirely — which defeats that
--      RPC's wallet gate. The normal creation path is open_challenge_tx
--      (SECURITY DEFINER, bypasses RLS); the INSERT policy was defense in
--      depth that turned into the hole. We DROP it: with no INSERT/UPDATE/
--      DELETE policy left on `challenges`, PostgREST denies all direct
--      writes, so every mutation must go through the SECURITY DEFINER
--      challenge RPCs. The SELECT policy is untouched — reads stay open to
--      authenticated.
--
--   2. open_challenge_tx (20260709_add_challenges_rpcs.sql) has a wallet
--      gate but no contributor gate — a viewer with a linked wallet (or one
--      calling before Fix 1, or any future direct-write path) could still
--      open a challenge. Adds a contributor-or-moderator gate immediately
--      after the existing wallet gate. Body is otherwise byte-identical to
--      the 20260709_add_challenges_rpcs.sql version (still the latest
--      committed body as of this migration — no concurrent redefinition
--      found; the only other reference to open_challenge_tx is a comment in
--      20260710_gate_writes_by_contributor.sql).
--
--   3. withdraw_challenge_tx and expire_challenges_tx
--      (20260709_add_challenges_rpcs.sql) have no contributor gate either.
--      withdraw_challenge_tx gets the same contributor-or-moderator gate as
--      open_challenge_tx, checked before the challenge row is even loaded.
--      expire_challenges_tx is a harmless idempotent sweep triggered on
--      dashboard load by any authenticated user, so instead of raising it
--      becomes a no-op for non-contributors (returns 'expired': 0 without
--      touching any rows). Both bodies are otherwise byte-identical to their
--      20260709_add_challenges_rpcs.sql versions.
--
-- resolve_challenge_tx is deliberately NOT touched: it is already
-- owner-or-moderator gated, and a token owner is necessarily a contributor
-- (token creation goes through the contributor-gated save_*_tx RPCs), so a
-- viewer can never reach it.
--
-- Depends on public.is_contributor()
-- (20260710_add_is_contributor_and_profile_trigger.sql) and
-- public.is_moderator(uuid) (20260709_add_user_roles.sql). Apply after
-- 20260709_add_challenges.sql and 20260709_add_challenges_rpcs.sql.
-- ============================================================================

-- ── Fix 1: drop the direct-INSERT policy on challenges ─────────────────────
--
-- Was: CREATE POLICY "challenges: authenticated can insert own"
--        ON challenges FOR INSERT TO authenticated
--        WITH CHECK (created_by = auth.uid());
-- with no wallet/contributor gate, so any authenticated viewer could forge a
-- challenge row directly, bypassing open_challenge_tx's wallet gate
-- entirely. With this policy gone and no UPDATE/DELETE policy ever having
-- existed on this table, PostgREST denies all direct INSERT/UPDATE/DELETE on
-- `challenges` by default. Every mutation must go through the SECURITY
-- DEFINER challenge RPCs (open_challenge_tx, withdraw_challenge_tx,
-- resolve_challenge_tx, expire_challenges_tx, mark_stale_challenges_for_field),
-- which bypass RLS and enforce their own auth checks. The SELECT policy
-- ("challenges: authenticated can read") is untouched.
DROP POLICY IF EXISTS "challenges: authenticated can insert own" ON public.challenges;

-- ── Fix 2: contributor-or-moderator gate in open_challenge_tx ──────────────
--
-- Verbatim reproduction of the 20260709_add_challenges_rpcs.sql body, with
-- one addition: a contributor-or-moderator gate immediately after the
-- existing wallet gate (step 1). Everything else — the token/draft check,
-- the proposed_value check, the target-existence check, the rate limit, the
-- insert, the audit event, the return — is unchanged.
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

  -- 1b. Contributor gate (dual-auth): a viewer must not be able to open a
  -- challenge even if a wallet is somehow linked without contributor status.
  IF NOT (public.is_contributor() OR public.is_moderator(auth.uid())) THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
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

-- ── Fix 3a: contributor-or-moderator gate in withdraw_challenge_tx ─────────
--
-- Verbatim reproduction of the 20260709_add_challenges_rpcs.sql body, with
-- one addition: the same contributor-or-moderator gate as Fix 2, checked at
-- the top of the BEGIN block before the challenge row is even loaded.
-- Everything else is unchanged.
CREATE OR REPLACE FUNCTION public.withdraw_challenge_tx(p_challenge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge challenges%ROWTYPE;
BEGIN
  IF NOT (public.is_contributor() OR public.is_moderator(auth.uid())) THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

-- ── Fix 3b: soft-gate expire_challenges_tx to a no-op for non-contributors ──
--
-- Verbatim reproduction of the 20260709_add_challenges_rpcs.sql body, with
-- one addition: this sweep is triggered on dashboard load by any
-- authenticated user, so a viewer must not be turned away with an error —
-- instead the function becomes a no-op for non-contributors, returning
-- 'expired': 0 without touching any rows. The sweep logic itself is
-- unchanged.
CREATE OR REPLACE FUNCTION public.expire_challenges_tx()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT (public.is_contributor() OR public.is_moderator(auth.uid())) THEN
    RETURN jsonb_build_object('expired', 0);
  END IF;

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
