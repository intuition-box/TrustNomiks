-- ============================================================================
-- token_stat_history: append-only stat snapshots (Pulse increment 3)
--
-- Every change to a token's completeness / status / cluster_scores lands one
-- history row, so the UI can say "Δ this week" honestly (rank moves,
-- completeness deltas, tier-ups). An AFTER trigger on tokens is the ONE
-- capture point that also sees StatusManager's direct `UPDATE status`, not
-- just the studio's save_*_tx RPCs.
--
-- TRIGGER SAFETY (pre-mortem: a failing AFTER trigger aborts the studio
-- save): the body is deliberately minimal — one change check, one INSERT of
-- NEW's own columns. No joins, no branching beyond IS DISTINCT FROM, no
-- casts. Covered by supabase/tests/06_token_stat_history.sql in CI.
--
-- Security posture:
-- - RLS on; SELECT for authenticated only. NO write policies: rows are
--   written exclusively by the trigger (SECURITY DEFINER, search_path
--   pinned), so the ledger is append-only and tamper-proof from clients.
-- - EXECUTE revoked from every client role (trigger functions never need it).
-- - Baseline backfill in this same migration so deltas have a starting point.
-- ============================================================================

CREATE TABLE token_stat_history (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id       uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  status         text NOT NULL,
  completeness   integer NOT NULL,
  cluster_scores jsonb,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_token_stat_history_token_time
  ON token_stat_history (token_id, recorded_at DESC);

ALTER TABLE token_stat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_stat_history: authenticated read"
  ON token_stat_history FOR SELECT TO authenticated USING (true);

-- Deliberately no INSERT/UPDATE/DELETE policy: the trigger below is the only
-- writer (SECURITY DEFINER bypasses RLS), keeping the history append-only.

CREATE OR REPLACE FUNCTION public.tokens_record_stat_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Minimal by design: a failure here would abort the token save.
  IF TG_OP = 'INSERT'
     OR NEW.completeness IS DISTINCT FROM OLD.completeness
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.cluster_scores IS DISTINCT FROM OLD.cluster_scores THEN
    INSERT INTO token_stat_history (token_id, status, completeness, cluster_scores)
    VALUES (NEW.id, NEW.status, NEW.completeness, NEW.cluster_scores);
  END IF;
  RETURN NULL; -- AFTER trigger: return value is ignored
END $$;

REVOKE EXECUTE ON FUNCTION public.tokens_record_stat_history()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_tokens_record_stat_history
AFTER INSERT OR UPDATE ON tokens
FOR EACH ROW
EXECUTE FUNCTION public.tokens_record_stat_history();

-- Baseline: one snapshot per existing token so deltas have an anchor
INSERT INTO token_stat_history (token_id, status, completeness, cluster_scores)
SELECT id, status, completeness, cluster_scores FROM tokens;
