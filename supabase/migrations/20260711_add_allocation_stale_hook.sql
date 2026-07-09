-- ============================================================================
-- Stale-marking hook for allocation_segments saves (milestone J2b)
--
-- Why a row-level trigger is CORRECT here (unlike vesting_schedules)
-- -----------------------------------------------------------------------------
-- A per-row AFTER INSERT/UPDATE/DELETE trigger only produces correct stale
-- signals if the save path RECONCILES rows by id (UPDATE in place for a row
-- the user kept, INSERT only for a genuinely new row, DELETE only for a row
-- the user actually removed). If the save instead deletes every row and
-- re-inserts the submitted set on every call, every untouched segment would
-- look like a fresh DELETE+INSERT to the trigger and every open challenge on
-- it would be wrongly marked stale on every unrelated save.
--
-- Checked the current canonical public.save_allocations_tx body (the A4
-- moderator rewrite in 20260710_extend_saves_a4_moderator.sql, the latest
-- committed definition of this function -- confirmed via `git log` that this
-- is the tip-of-history version; an uncommitted, untracked draft in the tree,
-- 20260710_gate_save_tx_rpcs_by_contributor.sql, also touches this function
-- but is unrelated in-flight work from another session and is left untouched
-- per this migration's scope). It:
--   1. Reads existing allocation_segments.id values for the token up front
--      (v_existing_ids).
--   2. For each submitted segment whose id matches an existing row, runs
--      `UPDATE allocation_segments SET segment_type = ..., label = ...,
--      percentage = ..., token_amount = ..., wallet_address = ... WHERE id =
--      v_segment_id AND token_id = p_token_id` -- i.e. an in-place UPDATE
--      that preserves the row's id (v_submitted_existing_ids tracks which
--      ids were kept).
--   3. For each submitted segment with no id (or an id not in the existing
--      set), runs a plain INSERT -- a genuinely new row.
--   4. Finally `DELETE FROM allocation_segments WHERE token_id = p_token_id
--      AND id = ANY(v_existing_ids) AND NOT (id = ANY(v_submitted_existing_ids))`
--      -- only rows the user actually removed are deleted.
-- This is reconcile-by-id: an edited segment keeps its id and goes through
-- UPDATE, so OLD/NEW on that row reflect a real field-level diff, not a
-- teardown/rebuild artifact. A row-level trigger is therefore the right tool,
-- exactly as it is for supply_metrics / emission_models in
-- 20260709_add_save_tx_challenge_hooks_core.sql.
--
-- (For the record: save_vesting_schedules_tx, also in
-- 20260710_extend_saves_a4_moderator.sql, does NOT reconcile by id -- it runs
-- `DELETE FROM vesting_schedules WHERE allocation_id = ANY(p_allocation_ids::uuid[])`
-- unconditionally and then re-INSERTs every submitted schedule from scratch.
-- A row-level trigger on vesting_schedules would misfire the same way the
-- header of 20260709_add_save_tx_challenge_hooks_core.sql already warned
-- about. Vesting therefore still needs an in-RPC diff, like the plan
-- originally described for the non-reconciling saves -- that work is out of
-- scope for this migration and is deferred to a future milestone.)
--
-- Value-encoding contract
-- -----------------------------------------------------------------------------
-- Same contract as the supply_metrics/emission_models hooks: every PERFORM
-- passes exactly `to_jsonb(NEW.<column>)`, matching how the Resolve Box UI
-- encodes `challenges.proposed_value` per the field's `kind` in
-- src/lib/claims/field-registry.ts (percentage/number -> jsonb number,
-- text/enum -> jsonb string). mark_stale_challenges_for_field() (
-- 20260709_add_challenges_rpcs.sql) compares p_new_value to proposed_value
-- with IS NOT DISTINCT FROM: a match flips the challenge to 'accepted'
-- (implicit adoption), a mismatch flips it to 'stale' -- both write their own
-- challenge_events rows internally, so no extra bookkeeping is needed for the
-- INSERT/UPDATE branch below.
--
-- claim_type is 'allocation_segment' (singular, matches the CHECK on
-- challenges.claim_type and CHALLENGEABLE_CLAIM_TYPES in field-registry.ts).
-- Unlike supply_metrics/emission_model, allocation_segment claims are NOT
-- 1:1 with the token: challenges_claim_id_shape
-- (20260709_add_challenges.sql) requires claim_id IS NOT NULL for
-- 'allocation_segment', and claim_id IS the allocation_segments row id
-- (NEW.id / OLD.id) -- there is no separate claim table to look up.
--
-- Fields covered (src/lib/claims/field-registry.ts, allocation_segment):
-- segment_type, label, percentage, token_amount, wallet_address. Each is
-- guarded by `(TG_OP = 'INSERT') OR (OLD.<col> IS DISTINCT FROM NEW.<col>)`
-- so an UPDATE that only touches one field doesn't needlessly re-evaluate
-- challenges on the others.
--
-- DELETE branch
-- -----------------------------------------------------------------------------
-- When a segment is deleted (the user removed it from the allocation table),
-- its fields no longer exist, so mark_stale_challenges_for_field() (which
-- needs a "new value" to compare against) does not apply. Instead every
-- still-open challenge whose claim_id is the deleted segment's id is staled
-- directly: a 'stale_marked' challenge_events row is inserted for each match
-- BEFORE the UPDATE (via INSERT ... SELECT over the still-open rows), then
-- those challenges are flipped to 'stale' -- the same order used by
-- tokens_draft_stales_challenges in 20260709_add_challenges.sql, needed
-- because the UPDATE's WHERE clause would no longer match the rows once
-- their status changes.
--
-- Independence: depends only on public.mark_stale_challenges_for_field(...)
-- (20260709_add_challenges_rpcs.sql) and the challenges/challenge_events
-- tables (20260709_add_challenges.sql). allocation_segments itself pre-dates
-- the migrations directory. DROP TRIGGER IF EXISTS precedes CREATE TRIGGER
-- for replay safety.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.allocation_segment_stales_challenges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF (TG_OP = 'INSERT') OR (OLD.segment_type IS DISTINCT FROM NEW.segment_type) THEN
      PERFORM public.mark_stale_challenges_for_field(
        NEW.token_id, 'allocation_segment', NEW.id, 'segment_type', to_jsonb(NEW.segment_type)
      );
    END IF;

    IF (TG_OP = 'INSERT') OR (OLD.label IS DISTINCT FROM NEW.label) THEN
      PERFORM public.mark_stale_challenges_for_field(
        NEW.token_id, 'allocation_segment', NEW.id, 'label', to_jsonb(NEW.label)
      );
    END IF;

    IF (TG_OP = 'INSERT') OR (OLD.percentage IS DISTINCT FROM NEW.percentage) THEN
      PERFORM public.mark_stale_challenges_for_field(
        NEW.token_id, 'allocation_segment', NEW.id, 'percentage', to_jsonb(NEW.percentage)
      );
    END IF;

    IF (TG_OP = 'INSERT') OR (OLD.token_amount IS DISTINCT FROM NEW.token_amount) THEN
      PERFORM public.mark_stale_challenges_for_field(
        NEW.token_id, 'allocation_segment', NEW.id, 'token_amount', to_jsonb(NEW.token_amount)
      );
    END IF;

    IF (TG_OP = 'INSERT') OR (OLD.wallet_address IS DISTINCT FROM NEW.wallet_address) THEN
      PERFORM public.mark_stale_challenges_for_field(
        NEW.token_id, 'allocation_segment', NEW.id, 'wallet_address', to_jsonb(NEW.wallet_address)
      );
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Insert the stale_marked events BEFORE the update below, while the
    -- open challenges can still be selected.
    INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, note)
    SELECT id, token_id, 'stale_marked', 'open', 'stale', auth.uid(),
           'allocation segment removed'
    FROM challenges
    WHERE token_id = OLD.token_id
      AND claim_type = 'allocation_segment'
      AND claim_id = OLD.id
      AND status = 'open';

    UPDATE challenges
    SET status = 'stale', updated_at = now()
    WHERE token_id = OLD.token_id
      AND claim_type = 'allocation_segment'
      AND claim_id = OLD.id
      AND status = 'open';

    RETURN OLD;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

DROP TRIGGER IF EXISTS allocation_segment_stales_challenges ON allocation_segments;
CREATE TRIGGER allocation_segment_stales_challenges
  AFTER INSERT OR UPDATE OR DELETE ON allocation_segments
  FOR EACH ROW
  EXECUTE FUNCTION public.allocation_segment_stales_challenges();
