-- Add missing indexes on foreign keys and frequently filtered columns
-- These support the query patterns used across the app

-- allocation_segments: frequently queried by token_id (Steps 3, completeness, export)
CREATE INDEX IF NOT EXISTS idx_allocation_segments_token_id
  ON allocation_segments (token_id);

-- vesting_schedules: frequently queried by allocation_id (Step 4, export, completeness)
CREATE INDEX IF NOT EXISTS idx_vesting_schedules_allocation_id
  ON vesting_schedules (allocation_id);

-- supply_metrics: queried by token_id (Step 2, export, completeness)
-- Note: supply_metrics has a UNIQUE constraint on token_id (used for ON CONFLICT),
-- which already creates an index. Skip this one.

-- emission_models: queried by token_id (Step 5, export, completeness)
-- Note: emission_models has a UNIQUE constraint on token_id (used for ON CONFLICT),
-- which already creates an index. Skip this one.

-- data_sources: frequently queried by token_id (Step 6, export)
CREATE INDEX IF NOT EXISTS idx_data_sources_token_id
  ON data_sources (token_id);

-- claim_sources: queried by token_id (export, RPC)
CREATE INDEX IF NOT EXISTS idx_claim_sources_token_id
  ON claim_sources (token_id);

-- claim_sources: queried by data_source_id (provenance lookups in export)
CREATE INDEX IF NOT EXISTS idx_claim_sources_data_source_id
  ON claim_sources (data_source_id);

-- risk_flags: queried by token_id (export, future UI)
CREATE INDEX IF NOT EXISTS idx_risk_flags_token_id
  ON risk_flags (token_id);

-- tokens: frequently filtered by status (dashboard, export page filters)
CREATE INDEX IF NOT EXISTS idx_tokens_status
  ON tokens (status);

-- tokens: filtered by created_by (ownership checks in RPCs, future multi-user)
CREATE INDEX IF NOT EXISTS idx_tokens_created_by
  ON tokens (created_by);

-- Note: tokens.coingecko_id already has an index from migration 20260320
