-- ============================================================================
-- Harden mark_stale_challenges_for_field grants + accept condition, and add
-- the missing contributor gate to save_identity_tx (3 confirmed review
-- findings)
--
-- Must be applied AFTER 20260710_add_save_identity_tx.sql,
-- 20260709_add_challenges_rpcs.sql, and
-- 20260710_add_is_contributor_and_profile_trigger.sql.
--
--   1. (grant-leak) public.mark_stale_challenges_for_field(uuid, text, uuid,
--      text, jsonb) was only revoked from PUBLIC/anon in
--      20260709_add_challenges_rpcs.sql, so `authenticated` retained a direct
--      EXECUTE grant. It is an INTERNAL helper invoked only from inside
--      SECURITY DEFINER triggers/save RPCs, which run as the function owner
--      and never need the caller's own grant to invoke it. A client could
--      otherwise call it directly to force any of its own open challenges to
--      'accepted' or 'stale' outside the normal save flow. This migration
--      revokes EXECUTE from `authenticated` too, leaving only `service_role`
--      granted.
--
--   2. (value-encoding false-accept) mark_stale_challenges_for_field's
--      accept-vs-stale branch compared only `p_new_value IS NOT DISTINCT FROM
--      c.proposed_value`. A 'dispute' challenge always has proposed_value =
--      NULL (disputes propose no replacement value). When a field is edited
--      to NULL, to_jsonb(NULL) is SQL NULL, so `NULL IS NOT DISTINCT FROM
--      NULL` is true -- which auto-accepted the DISPUTE via a plain save,
--      even though a dispute must never be auto-accepted by a value match
--      (only an explicit owner/moderator resolution, or the challenge going
--      stale, may close it). The branch condition now also requires
--      `c.challenge_type = 'update'`, so only 'update' challenges can be
--      implicitly accepted this way; 'dispute' challenges always fall
--      through to the 'stale' branch when their field is re-edited. The
--      function body is reproduced verbatim otherwise.
--
--   3. (authorization-gap) The six save_*_tx functions (per
--      20260711_merge_saves_a4_and_contributor.sql) enforce BOTH
--      owner-or-moderator AND contributor-or-moderator. save_identity_tx
--      (20260710_add_save_identity_tx.sql) only enforced owner-or-moderator,
--      so any authenticated user without a linked wallet -- who could not
--      call any of the six save_*_tx RPCs -- could still write token
--      identity fields via save_identity_tx if they happened to own or
--      moderate the token. This migration adds the same
--      `public.is_contributor() OR v_is_mod` gate immediately after the
--      existing ownership check, matching the merged saves exactly.
--      public.is_contributor() is defined in
--      20260710_add_is_contributor_and_profile_trigger.sql (a sibling
--      migration from a concurrent session) -- referenced here exactly as
--      the merged saves reference it. The rest of the function body
--      (optimistic lock, the tokens UPDATE with its NULLIF/::date casts, the
--      moderator_corrected event, RETURN) is reproduced verbatim.
-- ============================================================================

-- ── 1 & 2. mark_stale_challenges_for_field ──────────────────────────────────
-- Verbatim body from 20260709_add_challenges_rpcs.sql except the accept
-- condition on the line marked below, which now also requires
-- challenge_type = 'update' (finding 2).

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
    IF c.challenge_type = 'update' AND p_new_value IS NOT DISTINCT FROM c.proposed_value THEN
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

-- Finding 1: authenticated no longer retains a direct-call grant on this
-- internal helper; only service_role (used by SECURITY DEFINER callers'
-- underlying execution, which runs as the function owner regardless of the
-- caller's own grants) is granted.
REVOKE EXECUTE ON FUNCTION public.mark_stale_challenges_for_field(uuid, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stale_challenges_for_field(uuid, text, uuid, text, jsonb) TO service_role;

-- ── 3. save_identity_tx ─────────────────────────────────────────────────────
-- Verbatim body from 20260710_add_save_identity_tx.sql except the contributor
-- gate inserted immediately after the existing ownership check (finding 3).

CREATE OR REPLACE FUNCTION public.save_identity_tx(
  p_token_id uuid,
  p_identity jsonb,
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
  v_owner               uuid;
  v_is_owner            boolean;
  v_is_mod              boolean;
BEGIN
  -- Ownership + optimistic-lock source of truth in one read.
  SELECT created_by, updated_at INTO v_owner, v_current_updated_at
  FROM tokens WHERE id = p_token_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: token not found or not owned'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A4: owner OR moderator may write.
  v_is_owner := (v_owner IS NOT DISTINCT FROM auth.uid());
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
  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Token was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Atomic identity update. name/ticker are NOT NULL, so no NULLIF; every
  -- other identity field is optional text, so NULLIF('') collapses an empty
  -- string to NULL instead of persisting ''. tge_date is a date column -- a
  -- bare ->> is always text, so it needs the explicit ::date cast.
  UPDATE tokens SET
    name              = p_identity->>'name',
    ticker            = p_identity->>'ticker',
    chain             = NULLIF(p_identity->>'chain', ''),
    contract_address  = NULLIF(p_identity->>'contract_address', ''),
    coingecko_id      = NULLIF(p_identity->>'coingecko_id', ''),
    coingecko_image   = NULLIF(p_identity->>'coingecko_image', ''),
    tge_date          = NULLIF(p_identity->>'tge_date', '')::date,
    category          = NULLIF(p_identity->>'category', ''),
    sector            = NULLIF(p_identity->>'sector', ''),
    notes             = NULLIF(p_identity->>'notes', ''),
    completeness      = COALESCE(p_completeness, completeness),
    cluster_scores    = COALESCE(p_cluster_scores, cluster_scores),
    updated_at        = v_new_updated_at
  WHERE id = p_token_id;

  -- A4 audit trail: only when a moderator writes on someone else's token.
  IF v_is_mod AND NOT v_is_owner THEN
    INSERT INTO challenge_events (challenge_id, token_id, event_type, actor_id, actor_role, note)
    VALUES (NULL, p_token_id, 'moderator_corrected', auth.uid(), 'moderator', 'identity corrected by moderator');
  END IF;

  RETURN v_new_updated_at;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_identity_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_identity_tx(uuid, jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;
