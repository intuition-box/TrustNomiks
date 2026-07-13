-- Data repair: data_sources.verified_at was stored one day early.
--
-- Cause (fixed in code by the commit that adds src/lib/utils/date.ts): the
-- Calendar handed back a Date at LOCAL midnight and the form persisted
-- date.toISOString(). From any timezone east of Greenwich that instant falls on
-- the previous day in UTC, and verified_at is a DATE, so Postgres truncated it
-- and stored the day BEFORE the one the curator picked. The shift is
-- deterministic, not probabilistic: every date picked from Europe/Paris (UTC+1
-- or +2) is off by exactly one day, always in the same direction.
--
-- Evidence in the data: 9 of these rows have verified_at = created_at::date - 1,
-- i.e. the curator picked "today" in the calendar and the row recorded
-- yesterday. The remaining rows are deliberate past dates, shifted by the same
-- one-day mechanism.
--
-- Scope: the 15 picker-entered rows. The single CoinGecko row (ticker ARX,
-- verified_at 2026-07-09) is EXCLUDED: it was written by the studio's autofill
-- via new Date().toISOString(), which records a real instant, so its UTC date
-- already matched the local day. Shifting it would introduce the very error this
-- migration removes. (That autofill no longer stamps verified_at at all: a bot
-- fetching a URL is not a human verifying a source.)
--
-- Idempotent by construction: a marker on the table records the repair, so a
-- second run is a no-op rather than a second one-day shift.

DO $$
DECLARE
  v_marker  constant text := 'verified_at one-day shift repaired (20260721)';
  v_comment text := obj_description('public.data_sources'::regclass, 'pg_class');
  v_rows    integer;
BEGIN
  IF v_comment IS NOT NULL AND position(v_marker in v_comment) > 0 THEN
    RAISE NOTICE 'Repair already applied, skipping.';
    RETURN;
  END IF;

  UPDATE public.data_sources
     SET verified_at = verified_at + 1,
         updated_at  = now()
   WHERE verified_at IS NOT NULL
     AND document_name <> 'CoinGecko';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'Shifted % row(s) forward by one day.', v_rows;

  EXECUTE format(
    'COMMENT ON TABLE public.data_sources IS %L',
    coalesce(v_comment || ' | ', '') || v_marker
  );
END $$;
