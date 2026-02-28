-- Create claim_sources junction table.
-- Links each data_source to the specific entity (claim) it justifies.
-- Purely additive: no existing tables are modified.
-- Safe to run multiple times (IF NOT EXISTS).

BEGIN;

CREATE TABLE IF NOT EXISTS claim_sources (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id        UUID        NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  data_source_id  UUID        NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  claim_type      TEXT        NOT NULL CHECK (claim_type IN (
                                'token_identity',
                                'supply_metrics',
                                'allocation_segment',
                                'vesting_schedule',
                                'emission_model'
                              )),
  -- claim_id = NULL  → claim_type = 'token_identity' (the claim is the token itself)
  -- claim_id = UUID  → row ID in the target table for all other claim_types
  claim_id        UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),

  -- One attribution row per (source, claim_type, claim_id) triplet
  UNIQUE (data_source_id, claim_type, claim_id)
);

-- Row Level Security
ALTER TABLE claim_sources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'claim_sources'
      AND policyname = 'claim_sources: authenticated users can read'
  ) THEN
    CREATE POLICY "claim_sources: authenticated users can read"
      ON claim_sources FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'claim_sources'
      AND policyname = 'claim_sources: owner can insert'
  ) THEN
    CREATE POLICY "claim_sources: owner can insert"
      ON claim_sources FOR INSERT TO authenticated
      WITH CHECK (
        token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'claim_sources'
      AND policyname = 'claim_sources: owner can delete'
  ) THEN
    CREATE POLICY "claim_sources: owner can delete"
      ON claim_sources FOR DELETE TO authenticated
      USING (
        token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())
      );
  END IF;
END $$;

COMMIT;
