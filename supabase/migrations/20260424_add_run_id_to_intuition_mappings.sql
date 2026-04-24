-- ============================================================================
-- Additive migration: attach each mapping row to its originating publish run.
--
-- Rationale:
-- Previously, the link between a mapping (atom / claim / provenance) and a
-- publish run was inferred via `tx_hash ∈ run.tx_hashes`, which breaks down if
-- a term is republished in a later run (the mapping row is upserted and its
-- tx_hash gets overwritten). Adding an explicit `run_id` lets us attribute
-- each row to exactly one run and power a per-run drill-down view.
--
-- Safety:
-- - Nullable column → existing rows remain valid (null = pre-migration).
-- - ON DELETE SET NULL → deleting a run does not cascade-delete its mappings
--   (mappings reflect on-chain state which is immutable).
-- - No backfill → older runs will render in "legacy" mode on the UI.
-- - Indexed for the per-run query path.
-- ============================================================================

ALTER TABLE intuition_atom_mappings
  ADD COLUMN run_id uuid NULL REFERENCES intuition_publish_runs(id) ON DELETE SET NULL;

CREATE INDEX idx_atom_mappings_run_id ON intuition_atom_mappings(run_id);

ALTER TABLE intuition_claim_mappings
  ADD COLUMN run_id uuid NULL REFERENCES intuition_publish_runs(id) ON DELETE SET NULL;

CREATE INDEX idx_claim_mappings_run_id ON intuition_claim_mappings(run_id);

ALTER TABLE intuition_provenance_mappings
  ADD COLUMN run_id uuid NULL REFERENCES intuition_publish_runs(id) ON DELETE SET NULL;

CREATE INDEX idx_prov_mappings_run_id ON intuition_provenance_mappings(run_id);
