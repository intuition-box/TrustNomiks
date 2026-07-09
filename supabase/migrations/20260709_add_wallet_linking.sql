-- ============================================================================
-- Wallet linking (milestone J1d) — nonce-challenge proof-of-possession
--
-- Lets an authenticated user prove ownership of an on-chain wallet and link
-- it to their TrustNomiks account for the Resolve Box, without ever moving
-- funds or spending gas. Flow:
--   1. request_wallet_link_nonce_tx(candidate address) issues a short-lived
--      SIWE-style message that binds the candidate address, the requesting
--      user id, and a single-use nonce.
--   2. The client has the wallet sign that exact message and recovers the
--      signer address (ECDSA recovery) client-side or via the API route.
--   3. confirm_wallet_link_tx(nonce, recovered address) re-checks the nonce
--      and — the critical step — compares the recovered signer against the
--      candidate address that was bound into the message server-side. Only
--      on a match does the wallet get linked.
--
-- Security model: the candidate address lives in wallet_link_nonces.message
-- (issued server-side, never trusted from the client on confirm). Without
-- the recovered-vs-candidate comparison in confirm_wallet_link_tx, an
-- attacker could sign the challenge with their OWN key and link a victim's
-- address to the attacker's account — that comparison is the entire point
-- of this design and must never be removed or weakened.
--
-- Independent of the other 20260709 migrations in this repo (new tables and
-- functions only; touches no existing table, view, or function).
-- ============================================================================

-- ── Tables ───────────────────────────────────────────────────────────────

CREATE TABLE wallet_link_nonces (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id),
  wallet_address text NOT NULL,          -- candidate address being linked; ALWAYS stored lowercased
  nonce          text NOT NULL UNIQUE,
  message        text NOT NULL,          -- exact text that gets signed; stored and replayed verbatim
  expires_at     timestamptz NOT NULL,
  consumed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wallet_links (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id),
  wallet_address text NOT NULL,          -- ALWAYS stored lowercased
  chain_id       integer NOT NULL DEFAULT 13579,
  is_primary     boolean NOT NULL DEFAULT false,
  linked_at      timestamptz NOT NULL DEFAULT now(),
  unlinked_at    timestamptz             -- soft-revoke, never DELETE
);

-- A wallet is actively linked to at most one user at a time.
CREATE UNIQUE INDEX wallet_links_one_active_per_wallet
  ON wallet_links (wallet_address) WHERE unlinked_at IS NULL;

-- A user has at most one active primary wallet at a time.
CREATE UNIQUE INDEX wallet_links_one_primary_per_user
  ON wallet_links (user_id) WHERE unlinked_at IS NULL AND is_primary;

-- ── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE wallet_link_nonces ENABLE ROW LEVEL SECURITY;

-- Owner-only read: the verify step reads its own nonce row. No write
-- policies — all writes go through the SECURITY DEFINER RPCs below
-- (request_wallet_link_nonce_tx inserts, confirm_wallet_link_tx consumes),
-- which enforce auth.uid() ownership inside the function body regardless
-- of RLS.
CREATE POLICY "wallet_link_nonces: owner can read"
  ON wallet_link_nonces FOR SELECT TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE wallet_links ENABLE ROW LEVEL SECURITY;

-- Collaborative read: any authenticated user can look up which links exist
-- (e.g. resolving whether an address is already linked). No write
-- policies — all writes go through the SECURITY DEFINER RPCs below, which
-- enforce auth.uid() ownership inside the function body regardless of RLS.
CREATE POLICY "wallet_links: authenticated can read"
  ON wallet_links FOR SELECT TO authenticated
  USING (true);

-- ── Functions ────────────────────────────────────────────────────────────

-- 1. Issue a nonce + message challenge for a candidate wallet address.
CREATE OR REPLACE FUNCTION public.request_wallet_link_nonce_tx(p_wallet_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet  text := lower(trim(p_wallet_address));
  v_nonce   text;
  v_now     timestamptz := now();
  v_expires timestamptz;
  v_message text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM wallet_links
    WHERE wallet_address = v_wallet AND unlinked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'CONFLICT: wallet already linked to an account'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Not pgcrypto's gen_random_bytes — two concatenated UUIDs give 256 bits
  -- of randomness without depending on an extra extension.
  v_nonce := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expires := v_now + interval '10 minutes';

  v_message := format(
    'TrustNomiks Wallet Verification' || E'\n\n' ||
    'Sign this message to prove you control the wallet below and link it ' ||
    'to your TrustNomiks account.' || E'\n' ||
    'This signature proves wallet ownership only — it moves no funds and costs no gas.' || E'\n\n' ||
    'Account: %s' || E'\n' ||
    'Wallet: %s' || E'\n' ||
    'Nonce: %s' || E'\n' ||
    'Issued At: %s' || E'\n' ||
    'Expires At: %s',
    auth.uid(),
    v_wallet,
    v_nonce,
    v_now,
    v_expires
  );

  INSERT INTO wallet_link_nonces (user_id, wallet_address, nonce, message, expires_at)
  VALUES (auth.uid(), v_wallet, v_nonce, v_message, v_expires);

  RETURN jsonb_build_object(
    'nonce', v_nonce,
    'message', v_message,
    'expires_at', v_expires
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.request_wallet_link_nonce_tx(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_wallet_link_nonce_tx(text) TO authenticated, service_role;

-- 2. Verify the signature (recovered address, checked by the caller) and
--    link the wallet. The recovered-vs-candidate comparison below is the
--    proof-of-possession check — see header comment.
CREATE OR REPLACE FUNCTION public.confirm_wallet_link_tx(p_nonce text, p_recovered_wallet text)
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
  WHERE nonce = p_nonce AND user_id = auth.uid()
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
    WHERE user_id = auth.uid() AND unlinked_at IS NULL AND is_primary
  );

  BEGIN
    INSERT INTO wallet_links (user_id, wallet_address, chain_id, is_primary)
    VALUES (auth.uid(), v_row.wallet_address, 13579, v_is_primary);
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

REVOKE EXECUTE ON FUNCTION public.confirm_wallet_link_tx(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_wallet_link_tx(text, text) TO authenticated, service_role;

-- 3. Soft-revoke an active link owned by the caller.
CREATE OR REPLACE FUNCTION public.unlink_wallet_tx(p_wallet_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text := lower(trim(p_wallet_address));
BEGIN
  UPDATE wallet_links
  SET unlinked_at = now()
  WHERE user_id = auth.uid() AND wallet_address = v_wallet AND unlinked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: no active link for that wallet'
      USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.unlink_wallet_tx(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unlink_wallet_tx(text) TO authenticated, service_role;

-- 4. Promote an active link owned by the caller to primary.
CREATE OR REPLACE FUNCTION public.set_primary_wallet_tx(p_wallet_address text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet text := lower(trim(p_wallet_address));
BEGIN
  -- Clear the existing primary first so the new one satisfies the
  -- partial-unique index (wallet_links_one_primary_per_user).
  UPDATE wallet_links
  SET is_primary = false
  WHERE user_id = auth.uid() AND unlinked_at IS NULL AND is_primary;

  UPDATE wallet_links
  SET is_primary = true
  WHERE user_id = auth.uid() AND wallet_address = v_wallet AND unlinked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: no active link for that wallet'
      USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_primary_wallet_tx(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_primary_wallet_tx(text) TO authenticated, service_role;
