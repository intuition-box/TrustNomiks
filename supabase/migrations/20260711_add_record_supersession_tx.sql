-- ============================================================================
-- record_challenge_supersession_tx (milestone J5)
--
-- Persists the new claim's term id and the supersedes-triple link on a
-- `challenges` row after an accepted UPDATE challenge has been published
-- on-chain (i.e. after `executeOpenUpdate` has broadcast the replacement
-- triple + dispute against the old one). This RPC never changes
-- challenge.status: an accepted challenge can have its on-chain supersession
-- recorded at any point after acceptance, so there is deliberately no status
-- gate here, mirroring record_challenge_onchain_tx (J3).
--
-- Depends on the J2a challenge schema from 20260709_add_challenges.sql
-- (challenges.new_claim_term_id / supersedes_triple_term_id /
-- onchain_tx_hashes, and challenge_events with the 'onchain_linked'
-- event_type) and the wallet_links table from 20260709_add_wallet_linking.sql
-- — both must be applied before this file. Additive and otherwise
-- independent of every other migration: it adds one new function and
-- touches no existing objects.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_challenge_supersession_tx(
  p_challenge_id uuid,
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
    WHERE user_id = auth.uid() AND unlinked_at IS NULL
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
    p_challenge_id, v_challenge.token_id, 'onchain_linked', auth.uid(),
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

REVOKE EXECUTE ON FUNCTION public.record_challenge_supersession_tx(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_challenge_supersession_tx(uuid, text, text, jsonb) TO authenticated, service_role;
