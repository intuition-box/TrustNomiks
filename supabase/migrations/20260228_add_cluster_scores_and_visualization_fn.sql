-- Add cluster_scores JSONB column to tokens
-- Stores per-cluster point totals: { identity, supply, allocation, vesting }
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS cluster_scores JSONB DEFAULT '{}';

-- Function to certify that a token has all 4 clusters complete
-- Returns true when:
--   identity  >= 20 pts  (name+ticker+chain + optional contract + tge_date)
--   supply    >= 15 pts  (max_supply + initial/tge_supply)
--   allocation >= 20 pts (≥3 segments with total = 100%)
--   vesting   >= 20 pts  (at least 1 vesting schedule)
CREATE OR REPLACE FUNCTION is_visualization_ready(p_token_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_scores JSONB;
BEGIN
  SELECT cluster_scores INTO v_scores
  FROM tokens
  WHERE id = p_token_id;

  IF v_scores IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN (
    COALESCE((v_scores->>'identity')::int, 0)   >= 20 AND
    COALESCE((v_scores->>'supply')::int, 0)     >= 15 AND
    COALESCE((v_scores->>'allocation')::int, 0) >= 20 AND
    COALESCE((v_scores->>'vesting')::int, 0)    >= 20
  );
END;
$$;
