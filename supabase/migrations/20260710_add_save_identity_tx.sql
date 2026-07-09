-- ============================================================================
-- save_identity_tx + identity stale-hook trigger (milestone J2b)
--
-- Token identity (Step 1) is the last studio section with NO save RPC: the
-- client does a direct `.update()` on tokens from onSubmitStep1 in
-- src/components/token-form/use-token-save-handlers.ts. That means the
-- Resolve Box challenge state machine can never detect an identity re-edit
-- (no INSERT/UPDATE trigger ever fired for name/ticker/chain/etc.), and there
-- is no server-side ownership or optimistic-lock guard on this path — an
-- identity save is trusted purely on client-side checks. This migration
-- closes both gaps:
--
--   1. public.save_identity_tx: a SECURITY DEFINER RPC mirroring the shape of
--      save_supply_metrics_tx (20260709_fix_supply_metrics_tx_casts.sql) --
--      ownership + optimistic-lock check, atomic UPDATE, completeness/
--      cluster_scores bump, returns the new updated_at. Unlike
--      save_supply_metrics_tx it also implements decision A4 (a MODERATOR may
--      write even when not the token owner -- see the ownership check in
--      resolve_challenge_tx, 20260709_add_challenges_rpcs.sql, which already
--      establishes this v_owner/v_is_owner/v_is_mod pattern for the challenge
--      RPCs; this migration extends the same allowance to the actual field
--      write path, which resolve_challenge_tx explicitly deferred as
--      "milestone J2b -- out of scope here"). When a moderator corrects
--      someone else's token, a 'moderator_corrected' challenge_events row is
--      appended for the audit trail (challenge_id NULL, token_id set --
--      allowed by the challenge_events_scope CHECK).
--
--   2. public.token_identity_stales_challenges: an AFTER UPDATE ON tokens
--      trigger mirroring supply_metrics_stales_challenges /
--      emission_model_stales_challenges
--      (20260709_add_save_tx_challenge_hooks_core.sql). For each challengeable
--      identity field (name, ticker, chain, contract_address, tge_date,
--      category, sector -- exactly the token_identity entries in
--      src/lib/claims/field-registry.ts), a per-field OLD/NEW diff calls
--      public.mark_stale_challenges_for_field(NEW.id, 'token_identity', NULL,
--      '<field_key>', to_jsonb(NEW.<col>)) so any open challenge on that field
--      is implicitly accepted or marked stale, exactly like the supply/
--      emission hooks. claim_id is always NULL: token_identity is a 1:1
--      claim type per the challenges_claim_id_shape CHECK
--      (20260709_add_challenges.sql). to_jsonb(NEW.<col>) matches the
--      Resolve Box UI's proposed_value encoding (field-registry.ts kind ->
--      jsonb: text/date columns become jsonb strings), same contract as the
--      existing supply/emission triggers.
--
--      This trigger fires AFTER UPDATE only (not INSERT OR UPDATE): new token
--      creation is a plain INSERT with no prior challenges to reconcile
--      against, and unlike the supply_metrics/emission_models triggers there
--      is no ON CONFLICT upsert path here that needs an INSERT branch. It
--      coexists with the pre-existing tokens_draft_stales_challenges trigger
--      (20260709_add_challenges.sql, AFTER UPDATE OF status ON tokens) -- that
--      one blanket-staled every open challenge on a draft reversion; this one
--      is a narrower, per-field diff that fires on any identity edit, via
--      save_identity_tx or any other direct update to these columns.
--
-- Dependencies: public.is_moderator(uuid) (20260709_add_user_roles.sql),
-- public.mark_stale_challenges_for_field(uuid, text, uuid, text, jsonb) and
-- the challenges/challenge_events tables (20260709_add_challenges_rpcs.sql,
-- 20260709_add_challenges.sql) -- all must be applied first.
-- ============================================================================

-- ── 1. save_identity_tx ─────────────────────────────────────────────────────

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

-- ── 2. token_identity_stales_challenges trigger ─────────────────────────────

CREATE OR REPLACE FUNCTION public.token_identity_stales_challenges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.id, 'token_identity', NULL, 'name', to_jsonb(NEW.name)
    );
  END IF;

  IF OLD.ticker IS DISTINCT FROM NEW.ticker THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.id, 'token_identity', NULL, 'ticker', to_jsonb(NEW.ticker)
    );
  END IF;

  IF OLD.chain IS DISTINCT FROM NEW.chain THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.id, 'token_identity', NULL, 'chain', to_jsonb(NEW.chain)
    );
  END IF;

  IF OLD.contract_address IS DISTINCT FROM NEW.contract_address THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.id, 'token_identity', NULL, 'contract_address', to_jsonb(NEW.contract_address)
    );
  END IF;

  IF OLD.tge_date IS DISTINCT FROM NEW.tge_date THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.id, 'token_identity', NULL, 'tge_date', to_jsonb(NEW.tge_date)
    );
  END IF;

  IF OLD.category IS DISTINCT FROM NEW.category THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.id, 'token_identity', NULL, 'category', to_jsonb(NEW.category)
    );
  END IF;

  IF OLD.sector IS DISTINCT FROM NEW.sector THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.id, 'token_identity', NULL, 'sector', to_jsonb(NEW.sector)
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS token_identity_stales_challenges ON tokens;
CREATE TRIGGER token_identity_stales_challenges
  AFTER UPDATE ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.token_identity_stales_challenges();
