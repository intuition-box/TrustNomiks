-- ============================================================================
-- Stale-marking hooks for supply_metrics / emission_models saves (milestone J2a)
--
-- Design decision: triggers instead of inlining into save_supply_metrics_tx /
-- save_emission_model_tx
-- -----------------------------------------------------------------------------
-- The plan describes wiring public.mark_stale_challenges_for_field(...) calls
-- directly inside save_supply_metrics_tx and save_emission_model_tx (see the
-- note at the top of 20260709_add_challenge_rpcs.sql: "invoked from inside the
-- save_*_tx functions (wired in a later, sibling migration)"). Both RPCs are
-- previously-buggy, business-critical write paths: a cast bug in
-- save_supply_metrics_tx broke every token save until it was fixed same-day in
-- 20260709_fix_supply_metrics_tx_casts.sql, and a sibling cast bug hit
-- save_emission_model_tx (and save_allocations_tx) the same day, fixed in
-- 20260709_fix_allocations_and_optional_casts.sql. Editing either function
-- body again so soon after those fixes carries real regression risk for a
-- change that doesn't need to live there.
--
-- Instead this migration implements the hook as AFTER INSERT OR UPDATE
-- triggers on the underlying tables (supply_metrics, emission_models). This is:
--   - Equivalent: triggers fire inside the same transaction as the RPC's
--     upsert (INSERT ... ON CONFLICT (token_id) DO UPDATE fires the row-level
--     INSERT trigger on the no-conflict path and the row-level UPDATE trigger
--     on the conflict path -- TG_OP reflects which one actually happened), so
--     mark_stale_challenges_for_field() still runs atomically with the save,
--     same COMMIT/ROLLBACK boundary, same effect on challenge state.
--   - Non-invasive: save_supply_metrics_tx / save_emission_model_tx are not
--     touched at all -- zero regression surface on those RPCs.
--   - More robust: catches ANY write path that upserts these two tables (a
--     future direct write, a service_role script, a different RPC), not just
--     calls that happen to go through the two named functions.
--
-- Scope: ONLY the two single-row upsert tables (supply_metrics,
-- emission_models), each upserted ON CONFLICT (token_id) and in a stable 1:1
-- relationship to the token (claim_id is NULL for these claim types per the
-- challenges_claim_id_shape CHECK in 20260709_add_challenges.sql). Allocations
-- and vesting_schedules are handled differently in milestone J2b, because
-- save_allocations_tx / save_vesting_schedules_tx DELETE + re-INSERT rows
-- instead of updating them in place (see save_allocations_tx in
-- 20260709_fix_allocations_and_optional_casts.sql), so a plain row-level
-- AFTER INSERT OR UPDATE trigger would misfire (every unrelated segment looks
-- like a fresh INSERT) rather than reason about what changed.
--
-- Value-encoding contract
-- -----------------------------------------------------------------------------
-- mark_stale_challenges_for_field() compares p_new_value to
-- challenges.proposed_value with IS NOT DISTINCT FROM. The Resolve Box UI
-- writes proposed_value as to_jsonb(<the typed value>) per the field's `kind`
-- in src/lib/claims/field-registry.ts (number -> jsonb number, text/date ->
-- jsonb string, boolean -> jsonb boolean). To line up, every PERFORM below
-- passes exactly `to_jsonb(NEW.<column>)` -- never a hand-built jsonb literal
-- or a text cast -- so a bigint column becomes a jsonb number, a date column
-- becomes a jsonb string, etc., matching the UI's encoding exactly.
--
-- claim_type values passed match the CHECK constraint on
-- challenges.claim_type (20260709_add_challenges.sql) and
-- CHALLENGEABLE_CLAIM_TYPES in src/lib/claims/field-registry.ts:
-- 'supply_metrics' and 'emission_model' (singular -- NOT the emission_models
-- table name; the CHECK constraint only allows the singular form, so passing
-- the plural would silently never match any real challenge row). claim_id is
-- always NULL for both, since these are 1:1-with-token claim types
-- (challenges_claim_id_shape CHECK requires claim_id IS NULL for them).
--
-- Only fields that actually changed fire a PERFORM (or unconditionally on
-- INSERT, since there is no prior OLD row to diff against): each field is
-- guarded by `(TG_OP = 'INSERT') OR (OLD.<col> IS DISTINCT FROM NEW.<col>)` so
-- a save that only touches, say, notes/source_url does not needlessly
-- re-evaluate challenges on unrelated fields.
--
-- Independence: depends only on public.mark_stale_challenges_for_field(...)
-- (20260709_add_challenge_rpcs.sql) and the challenges/challenge_events
-- tables (20260709_add_challenges.sql) -- both must be applied first. The
-- underlying supply_metrics and emission_models tables already exist in the
-- live DB (they pre-date the migrations directory). No other file is touched
-- or depended on. DROP TRIGGER IF EXISTS precedes each CREATE TRIGGER for
-- replay safety.
-- ============================================================================

-- ── supply_metrics ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.supply_metrics_stales_challenges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.max_supply IS DISTINCT FROM NEW.max_supply) THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.token_id, 'supply_metrics', NULL, 'max_supply', to_jsonb(NEW.max_supply)
    );
  END IF;

  IF (TG_OP = 'INSERT') OR (OLD.initial_supply IS DISTINCT FROM NEW.initial_supply) THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.token_id, 'supply_metrics', NULL, 'initial_supply', to_jsonb(NEW.initial_supply)
    );
  END IF;

  IF (TG_OP = 'INSERT') OR (OLD.tge_supply IS DISTINCT FROM NEW.tge_supply) THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.token_id, 'supply_metrics', NULL, 'tge_supply', to_jsonb(NEW.tge_supply)
    );
  END IF;

  IF (TG_OP = 'INSERT') OR (OLD.circulating_supply IS DISTINCT FROM NEW.circulating_supply) THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.token_id, 'supply_metrics', NULL, 'circulating_supply', to_jsonb(NEW.circulating_supply)
    );
  END IF;

  IF (TG_OP = 'INSERT') OR (OLD.circulating_date IS DISTINCT FROM NEW.circulating_date) THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.token_id, 'supply_metrics', NULL, 'circulating_date', to_jsonb(NEW.circulating_date)
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS supply_metrics_stales_challenges ON supply_metrics;
CREATE TRIGGER supply_metrics_stales_challenges
  AFTER INSERT OR UPDATE ON supply_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.supply_metrics_stales_challenges();

-- ── emission_models ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.emission_model_stales_challenges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.type IS DISTINCT FROM NEW.type) THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.token_id, 'emission_model', NULL, 'type', to_jsonb(NEW.type)
    );
  END IF;

  IF (TG_OP = 'INSERT') OR (OLD.annual_inflation_rate IS DISTINCT FROM NEW.annual_inflation_rate) THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.token_id, 'emission_model', NULL, 'annual_inflation_rate', to_jsonb(NEW.annual_inflation_rate)
    );
  END IF;

  IF (TG_OP = 'INSERT') OR (OLD.has_burn IS DISTINCT FROM NEW.has_burn) THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.token_id, 'emission_model', NULL, 'has_burn', to_jsonb(NEW.has_burn)
    );
  END IF;

  IF (TG_OP = 'INSERT') OR (OLD.has_buyback IS DISTINCT FROM NEW.has_buyback) THEN
    PERFORM public.mark_stale_challenges_for_field(
      NEW.token_id, 'emission_model', NULL, 'has_buyback', to_jsonb(NEW.has_buyback)
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS emission_model_stales_challenges ON emission_models;
CREATE TRIGGER emission_model_stales_challenges
  AFTER INSERT OR UPDATE ON emission_models
  FOR EACH ROW
  EXECUTE FUNCTION public.emission_model_stales_challenges();
