-- ============================================================================
-- record_challenge_onchain_tx (milestone J3)
--
-- Persists on-chain references (tx hash, target/counter term ids, curve id,
-- declared stake) on a `challenges` row after the caller has broadcast a
-- stake or redeem transaction against the Resolve Box market. This RPC never
-- changes challenge.status: recording a tx is allowed regardless of the
-- challenge's current state, since a redeem can legitimately happen after the
-- challenge has already been resolved (accepted/rejected/expired/etc).
--
-- Depends on the J2a challenge schema from 20260709_add_challenges.sql
-- (challenges / challenge_events tables) and the wallet_links table from
-- 20260709_add_wallet_linking.sql — both must be applied before this file.
-- Additive and otherwise independent of every other migration: it adds one
-- new function and touches no existing objects.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_challenge_onchain_tx(
  p_challenge_id uuid,
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
    WHERE user_id = auth.uid() AND unlinked_at IS NULL
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
    p_challenge_id, v_challenge.token_id, v_event_type, auth.uid(), p_action,
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

REVOKE EXECUTE ON FUNCTION public.record_challenge_onchain_tx(uuid, text, text, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_challenge_onchain_tx(uuid, text, text, text, integer, text, text) TO authenticated, service_role;
