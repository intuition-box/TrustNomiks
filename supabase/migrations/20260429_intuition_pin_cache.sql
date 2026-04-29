-- ── intuition_pin_cache ─────────────────────────────────────────────────────
-- Cache of IPFS pins for canonical Intuition entity atoms.
--
-- Keyed by (entity_kind, entity_key, content_hash):
--   entity_kind  — token | allocation | vesting | emission | data_source | category | sector | chain
--   entity_key   — internal atom_id (e.g. "atom:token:<uuid>") or canonical key for taxonomies
--   content_hash — sha256 of the pinned JSON; a new content_hash means content changed and we re-pin
--
-- Lookup flow in entity-pinner: build the Thing JSON → hash → SELECT by composite key.
-- A miss triggers a fresh pin; a hit returns the cached cid/uri/term_id.

CREATE TABLE IF NOT EXISTS intuition_pin_cache (
  entity_kind   text        NOT NULL,
  entity_key    text        NOT NULL,
  content_hash  text        NOT NULL,
  cid           text        NOT NULL,
  uri           text        NOT NULL,
  term_id       text        NOT NULL,
  pinned_json   jsonb       NOT NULL,
  pinned_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_kind, entity_key, content_hash)
);

CREATE INDEX IF NOT EXISTS intuition_pin_cache_latest_idx
  ON intuition_pin_cache (entity_kind, entity_key, pinned_at DESC);

CREATE INDEX IF NOT EXISTS intuition_pin_cache_term_id_idx
  ON intuition_pin_cache (term_id);

COMMENT ON TABLE intuition_pin_cache IS
  'Caches IPFS pins of canonical Intuition entity atoms (Things). A new content_hash creates a new row; old rows are preserved for audit.';
