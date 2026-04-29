-- ── intuition_pin_cache RLS policies ────────────────────────────────────────
--
-- The cache is shared across all authenticated users: a CID is the same no
-- matter who triggered the pin, and the composite primary key
-- (entity_kind, entity_key, content_hash) already enforces dedup. Restricting
-- writes to a single owner would force every user to re-pin the same Things.
--
-- Read: any authenticated user.
-- Write: any authenticated user. Re-inserts on the same composite key are
-- handled by the entity-pinner via upsert(onConflict=…), so concurrent pins
-- of the same content collapse safely.

ALTER TABLE intuition_pin_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pin cache"
  ON intuition_pin_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert pin cache"
  ON intuition_pin_cache FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update pin cache"
  ON intuition_pin_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
