-- ============================================================================
-- Dedicated provenance mappings table
--
-- A single claim triple can be sourced from multiple data sources.
-- Each provenance = one on-chain "based_on" triple linking a claim to a source.
-- This table stores one row per (claim, source) pair, replacing the single
-- provenance_triple_term_id field in intuition_claim_mappings.
--
-- The old field in intuition_claim_mappings is left in place (nullable, unused)
-- to avoid a destructive migration during V1 testnet.
-- ============================================================================

CREATE TABLE intuition_provenance_mappings (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  triple_id                 text NOT NULL,          -- the claim triple (from kg_triples_v1)
  source_atom_id            text NOT NULL,          -- the source atom (from kg_atoms_v1, e.g. "atom:source:{uuid}")
  provenance_triple_term_id text,                   -- bytes32 hex of the on-chain "based_on" triple
  chain_id                  integer NOT NULL DEFAULT 13579,
  tx_hash                   text,
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  error_message             text,
  created_at                timestamptz DEFAULT now(),
  created_by                uuid NOT NULL REFERENCES auth.users(id),

  -- One provenance per (claim, source, chain) — prevents duplicates
  UNIQUE (triple_id, source_atom_id, chain_id)
);

CREATE INDEX idx_prov_mappings_triple_id ON intuition_provenance_mappings(triple_id);
CREATE INDEX idx_prov_mappings_status    ON intuition_provenance_mappings(status);

-- RLS: same pattern as the other Intuition tables
ALTER TABLE intuition_provenance_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read provenance mappings"
  ON intuition_provenance_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own provenance mappings"
  ON intuition_provenance_mappings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own provenance mappings"
  ON intuition_provenance_mappings FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);
