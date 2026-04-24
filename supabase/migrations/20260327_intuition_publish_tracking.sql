-- ============================================================================
-- Intuition Protocol publish tracking tables
-- Tracks atoms, triples, and publish runs synced to the Intuition testnet.
-- ============================================================================

-- 1. intuition_publish_runs — one row per publish execution
-- ============================================================================

CREATE TABLE intuition_publish_runs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id        uuid NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  chain_id        integer NOT NULL DEFAULT 13579,
  wallet_address  text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed')),
  atoms_created   integer NOT NULL DEFAULT 0,
  atoms_skipped   integer NOT NULL DEFAULT 0,
  atoms_failed    integer NOT NULL DEFAULT 0,
  triples_created integer NOT NULL DEFAULT 0,
  triples_skipped integer NOT NULL DEFAULT 0,
  triples_failed  integer NOT NULL DEFAULT 0,
  tx_hashes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors          jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  created_by      uuid NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_publish_runs_token   ON intuition_publish_runs(token_id);
CREATE INDEX idx_publish_runs_status  ON intuition_publish_runs(status);
CREATE INDEX idx_publish_runs_wallet  ON intuition_publish_runs(wallet_address);

-- 2. intuition_atom_mappings — maps local atom IDs to on-chain term IDs
-- ============================================================================

CREATE TABLE intuition_atom_mappings (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  atom_id         text NOT NULL UNIQUE,          -- from kg_atoms_v1 e.g. "atom:token:{uuid}"
  atom_type       text NOT NULL,                 -- e.g. "token", "allocation", "predicate", "literal"
  normalized_data text NOT NULL,                 -- exact string sent on-chain
  term_id         text,                          -- bytes32 hex on-chain identifier
  chain_id        integer NOT NULL DEFAULT 13579,
  tx_hash         text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  error_message   text,
  created_at      timestamptz DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_atom_mappings_status    ON intuition_atom_mappings(status);
CREATE INDEX idx_atom_mappings_atom_type ON intuition_atom_mappings(atom_type);
CREATE INDEX idx_atom_mappings_term_id   ON intuition_atom_mappings(term_id);

-- 3. intuition_claim_mappings — maps local triple IDs to on-chain triple term IDs
-- ============================================================================

CREATE TABLE intuition_claim_mappings (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  triple_id                 text NOT NULL UNIQUE,  -- from kg_triples_v1
  claim_group               text,                  -- e.g. "token_identity", "supply_metrics"
  origin_row_id             text,                  -- UUID of the source row
  subject_term_id           text NOT NULL,         -- on-chain term_id of subject atom
  predicate_term_id         text NOT NULL,         -- on-chain term_id of predicate atom
  object_term_id            text NOT NULL,         -- on-chain term_id of object atom
  triple_term_id            text,                  -- bytes32 hex of the created triple on-chain
  provenance_triple_term_id text,                  -- bytes32 hex of the based_on provenance triple
  chain_id                  integer NOT NULL DEFAULT 13579,
  tx_hash                   text,
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  error_message             text,
  created_at                timestamptz DEFAULT now(),
  created_by                uuid NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_claim_mappings_status      ON intuition_claim_mappings(status);
CREATE INDEX idx_claim_mappings_claim_group ON intuition_claim_mappings(claim_group);
CREATE INDEX idx_claim_mappings_triple_term ON intuition_claim_mappings(triple_term_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE intuition_publish_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE intuition_atom_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE intuition_claim_mappings ENABLE ROW LEVEL SECURITY;

-- Reads: all authenticated users can see all published data
CREATE POLICY "Authenticated users can read publish runs"
  ON intuition_publish_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read atom mappings"
  ON intuition_atom_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read claim mappings"
  ON intuition_claim_mappings FOR SELECT TO authenticated USING (true);

-- Writes: only the creator can insert/update their own records
CREATE POLICY "Users can insert their own publish runs"
  ON intuition_publish_runs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own publish runs"
  ON intuition_publish_runs FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own atom mappings"
  ON intuition_atom_mappings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own atom mappings"
  ON intuition_atom_mappings FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own claim mappings"
  ON intuition_claim_mappings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own claim mappings"
  ON intuition_claim_mappings FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);
