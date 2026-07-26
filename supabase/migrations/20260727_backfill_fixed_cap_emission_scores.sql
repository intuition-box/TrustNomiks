-- ============================================================================
-- Backfill: pure fixed-cap tokens gain the emission extra they now earn.
--
-- 20260726 (Factory) and the matching computeScores change made a pure fixed
-- cap complete the emission scoring on its own (the type IS the whole
-- decision; a BTC-style token otherwise capped below 100 forever). Stored
-- screener `tokens.completeness` values were computed under the old rule and
-- only self-heal on the next full save, which validated tokens rarely get.
--
-- The delta is exact: a pure fixed cap earned emission 5/10 under the old
-- rule and earns 10/10 now, so the cohort gains exactly +5, capped at 100.
-- cluster_scores is untouched (emission is a non-cluster extra on the
-- screener side).
-- ============================================================================

UPDATE tokens SET completeness = LEAST(completeness + 5, 100)
WHERE id IN (
  SELECT token_id FROM emission_models
  WHERE type = 'fixed_cap'
    AND COALESCE(annual_inflation_rate, 0) = 0
    AND NOT has_burn
    AND NOT has_buyback
);
