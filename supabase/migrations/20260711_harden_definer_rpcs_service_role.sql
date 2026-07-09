-- ============================================================================
-- Harden four SECURITY DEFINER RPCs to service_role-only (security findings
-- #1, #2/#9, #2/#10, #3)
--
-- All four RPCs below were reachable directly by `authenticated` and trusted
-- either `auth.uid()` (which the RPC itself cannot distinguish from a
-- request forged by a malicious client against a *different* user's data)
-- or caller-supplied "already verified" booleans. The trust boundary for
-- each of these moves from "the calling session is authenticated" to "the
-- calling process is a TrustNomiks API route" — i.e. from RLS/grants alone
-- to an API route that performs the actual verification (signature
-- recovery for wallet-link, server-side on-chain term-id resolution for the
-- record_* RPCs) and then calls the RPC via the service-role key, passing
-- the authenticated user's id explicitly as a trusted parameter. Each RPC is
-- now GRANTed to `service_role` only; `authenticated`/`anon`/`PUBLIC` are
-- revoked (or never granted), so the RPC can no longer be invoked directly
-- from a browser session.
--
-- 1. confirm_wallet_link_tx (finding #1) — was callable by `authenticated`
--    with `WHERE ... AND user_id = auth.uid()`, so an attacker could supply
--    a victim's own recovered address as p_recovered_wallet while sitting in
--    the attacker's own authenticated session, satisfying the recovered-vs-
--    candidate check and linking the victim's wallet to the attacker's
--    account. Signature gains `p_user_id uuid`; the verify API route
--    recovers the signer server-side, confirms the request is genuinely
--    the nonce owner via the caller's session, then calls this RPC with the
--    service-role key and the caller's own user id as p_user_id. Every
--    `auth.uid()` in the body is replaced with `p_user_id`; the B3
--    recovered-vs-candidate comparison is untouched.
--
-- 2. evaluate_stake_threshold_tx (finding #4/#9) — signature unchanged; it
--    trusts caller-supplied p_threshold_met/p_verified_stake_wei/
--    p_verified_accounts/p_verified_at as an "already independently
--    verified" snapshot. Under `authenticated`, any signed-in user could
--    call it directly with fabricated verified values and auto-adopt (or
--    block) a dispute. Now only the evaluate-threshold route — which does
--    the actual on-chain stake verification — can call it, via
--    service_role. `auth.uid()` inside becomes NULL under service_role,
--    which is acceptable: the two auth.uid()-stamped events
--    (veto_window_started / veto_window_cleared) simply record a system
--    actor instead of a specific user, matching the fact that the caller is
--    now always the trusted evaluation job, not an individual.
--
-- 3. record_challenge_onchain_tx (finding #2/#10) — the wallet gate only
--    checked "does the caller have ANY linked wallet", not that the caller
--    is a party to *this* challenge, so any authenticated user with a
--    linked wallet could poison ANY challenge's on-chain refs
--    (onchain_tx_hashes / target_triple_term_id / counter_term_id /
--    curve_id / declared_stake_wei) with arbitrary values. Signature gains
--    `p_actor_id uuid` as the 2nd parameter; the on-chain-record API route
--    resolves the term ids server-side from the actual broadcast
--    transaction and calls this RPC with service_role, passing the
--    authenticated user's id as p_actor_id. `auth.uid()` is replaced with
--    `p_actor_id` in both the wallet-gate EXISTS check and the
--    challenge_events actor_id.
--
-- 4. record_challenge_supersession_tx (finding #3) — same IDOR shape as #3
--    above (any authenticated user with a linked wallet could record a
--    supersession on any challenge). Signature gains `p_actor_id uuid` as
--    the 2nd parameter; `auth.uid()` is replaced with `p_actor_id` in the
--    wallet-gate EXISTS check and the challenge_events actor_id.
--
-- Grep of all committed migrations under supabase/migrations/ confirms each
-- function's body below is reproduced from its sole defining migration
-- (20260709_add_wallet_linking.sql, 20260710_add_evaluate_stake_threshold_tx.sql,
-- 20260710_add_record_challenge_onchain_tx.sql,
-- 20260711_add_record_supersession_tx.sql respectively) with no intervening
-- redefinition by any other migration — no concurrent-session surprises
-- found. The only other mention of record_challenge_onchain_tx outside its
-- defining file is a comment in 20260711_add_record_supersession_tx.sql's
-- header, not a redefinition.
-- ============================================================================

-- ── 1. confirm_wallet_link_tx: add p_user_id, drop old 2-arg signature ────

DROP FUNCTION IF EXISTS public.confirm_wallet_link_tx(text, text);

CREATE OR REPLACE FUNCTION public.confirm_wallet_link_tx(p_nonce text, p_user_id uuid, p_recovered_wallet text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row        wallet_link_nonces%ROWTYPE;
  v_recovered  text := lower(trim(p_recovered_wallet));
  v_is_primary boolean;
BEGIN
  SELECT * INTO v_row
  FROM wallet_link_nonces
  WHERE nonce = p_nonce AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: invalid or unknown nonce'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_row.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'CONFLICT: nonce already used'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_row.expires_at < now() THEN
    RAISE EXCEPTION 'CONFLICT: nonce expired'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- CRITICAL SECURITY CHECK (plan B3): the ECDSA-recovered signer must
  -- match the candidate address that was bound into the challenge
  -- server-side. Without this check, an attacker could sign the message
  -- with their OWN key and link a victim's wallet address to the
  -- attacker's account.
  IF v_recovered IS DISTINCT FROM v_row.wallet_address THEN
    RAISE EXCEPTION 'FORBIDDEN: signature does not match the address being linked'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Re-check for a race: another session may have linked this wallet while
  -- this nonce was outstanding.
  IF EXISTS (
    SELECT 1 FROM wallet_links
    WHERE wallet_address = v_row.wallet_address AND unlinked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'CONFLICT: wallet already linked to an account'
      USING ERRCODE = 'serialization_failure';
  END IF;

  UPDATE wallet_link_nonces SET consumed_at = now() WHERE id = v_row.id;

  -- First active wallet for the user becomes primary.
  v_is_primary := NOT EXISTS (
    SELECT 1 FROM wallet_links
    WHERE user_id = p_user_id AND unlinked_at IS NULL AND is_primary
  );

  BEGIN
    INSERT INTO wallet_links (user_id, wallet_address, chain_id, is_primary)
    VALUES (p_user_id, v_row.wallet_address, 13579, v_is_primary);
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'CONFLICT: wallet already linked to an account'
        USING ERRCODE = 'serialization_failure';
  END;

  RETURN jsonb_build_object(
    'wallet_address', v_row.wallet_address,
    'is_primary', v_is_primary,
    'linked_at', now()
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.confirm_wallet_link_tx(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_wallet_link_tx(text, uuid, text) TO service_role;

-- ── 2. evaluate_stake_threshold_tx: signature unchanged, revoke authenticated ──

REVOKE EXECUTE ON FUNCTION public.evaluate_stake_threshold_tx(uuid, boolean, text, integer, timestamptz) FROM authenticated;
-- service_role's existing grant (from 20260710_add_evaluate_stake_threshold_tx.sql) is untouched.

-- ── 3. record_challenge_onchain_tx: add p_actor_id, drop old 7-arg signature ──

DROP FUNCTION IF EXISTS public.record_challenge_onchain_tx(uuid, text, text, text, integer, text, text);

CREATE OR REPLACE FUNCTION public.record_challenge_onchain_tx(
  p_challenge_id uuid,
  p_actor_id uuid,
  p_tx_hash text,
  p_target_triple_term_id text,
  p_counter_term_id text,
  p_curve_id integer,
  p_stake_wei text,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge  challenges%ROWTYPE;
  v_event_type text;
BEGIN
  IF p_action NOT IN ('contest', 'add', 'withdraw') THEN
    RAISE EXCEPTION 'CONFLICT: invalid action'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Wallet gate: a linked wallet is required to record an on-chain action.
  IF NOT EXISTS (
    SELECT 1 FROM wallet_links
    WHERE user_id = p_actor_id AND unlinked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: a linked wallet is required to record an on-chain action'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_challenge FROM challenges WHERE id = p_challenge_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: challenge not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Deliberately no status gate: recording a tx is allowed regardless of the
  -- challenge's current status (e.g. a redeem after resolution). This
  -- function never mutates challenges.status.
  v_event_type := CASE WHEN p_action = 'withdraw' THEN 'onchain_linked' ELSE 'stake_recorded' END;

  UPDATE challenges
  SET onchain_tx_hashes      = CASE
                                  WHEN p_tx_hash IS NOT NULL AND p_tx_hash <> ''
                                  THEN v_challenge.onchain_tx_hashes || to_jsonb(p_tx_hash)
                                  ELSE v_challenge.onchain_tx_hashes
                                END,
      target_triple_term_id  = COALESCE(v_challenge.target_triple_term_id, p_target_triple_term_id),
      counter_term_id        = COALESCE(v_challenge.counter_term_id, p_counter_term_id),
      curve_id               = COALESCE(v_challenge.curve_id, p_curve_id),
      declared_stake_wei     = COALESCE(p_stake_wei, v_challenge.declared_stake_wei),
      updated_at             = now()
  WHERE id = p_challenge_id;

  INSERT INTO challenge_events (challenge_id, token_id, event_type, actor_id, note, metadata)
  VALUES (
    p_challenge_id, v_challenge.token_id, v_event_type, p_actor_id, p_action,
    jsonb_build_object(
      'tx_hash', p_tx_hash,
      'counter_term_id', p_counter_term_id,
      'curve_id', p_curve_id,
      'stake_wei', p_stake_wei,
      'action', p_action
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_challenge_onchain_tx(uuid, uuid, text, text, text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_challenge_onchain_tx(uuid, uuid, text, text, text, integer, text, text) TO service_role;

-- ── 4. record_challenge_supersession_tx: add p_actor_id, drop old 4-arg signature ──

DROP FUNCTION IF EXISTS public.record_challenge_supersession_tx(uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.record_challenge_supersession_tx(
  p_challenge_id uuid,
  p_actor_id uuid,
  p_new_claim_term_id text,
  p_supersedes_triple_term_id text,
  p_tx_hashes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_challenge challenges%ROWTYPE;
BEGIN
  -- Wallet gate: a linked wallet is required to record an on-chain action.
  IF NOT EXISTS (
    SELECT 1 FROM wallet_links
    WHERE user_id = p_actor_id AND unlinked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: a linked wallet is required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_challenge FROM challenges WHERE id = p_challenge_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: challenge not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Deliberately no status gate: a supersession can be recorded after
  -- acceptance, regardless of the challenge's current status. This function
  -- never mutates challenges.status.
  UPDATE challenges
  SET new_claim_term_id         = COALESCE(new_claim_term_id, p_new_claim_term_id),
      supersedes_triple_term_id = COALESCE(supersedes_triple_term_id, p_supersedes_triple_term_id),
      onchain_tx_hashes         = onchain_tx_hashes || COALESCE(p_tx_hashes, '[]'::jsonb),
      updated_at                = now()
  WHERE id = p_challenge_id;

  INSERT INTO challenge_events (challenge_id, token_id, event_type, actor_id, note, metadata)
  VALUES (
    p_challenge_id, v_challenge.token_id, 'onchain_linked', p_actor_id,
    'update published on-chain (supersession)',
    jsonb_build_object(
      'new_claim_term_id', p_new_claim_term_id,
      'supersedes_triple_term_id', p_supersedes_triple_term_id,
      'tx_hashes', p_tx_hashes
    )
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.record_challenge_supersession_tx(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_challenge_supersession_tx(uuid, uuid, text, text, jsonb) TO service_role;
