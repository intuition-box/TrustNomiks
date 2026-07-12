-- ============================================================================
-- Backfill sector/category on validated tokens (Factory Phase 2 prerequisite)
--
-- Six of the twelve validated tokens carried a NULL sector (three also a NULL
-- category), which starves the benchmark cohort ladder: no sector could reach
-- MIN_COHORT_ATTESTED and the assist degraded to the all-attested tier for
-- every request. This backfill classifies those six rows so sector cohorts
-- can resolve.
--
-- Classifications (advisory benchmark buckets, reviewable):
--   Alpine F1 Team Fan Token  → open-digital-economy / fan-token
--       (aligns with the other two fan tokens, Santos FC and FC Porto; the
--        previous two-sided-market category had no compatible sector filled
--        and would not have satisfied the sector-category consistency CHECK)
--   GOG (Guild of Guardians)  → open-digital-economy / game
--   Illuvium                  → open-digital-economy / gaming-ecosystem
--   MAGIC (Treasure)          → open-digital-economy / gaming-ecosystem
--   MOBOX                     → open-digital-economy / gaming-ecosystem
--   Peaq                      → infrastructure / l1
--
-- Guards: exact name + status = 'validated' + sector IS NULL, so replays and
-- rows classified since are no-ops. Plain UPDATEs do not touch updated_at
-- (only the save RPCs bump it), so no open studio session gets a spurious
-- optimistic-lock CONFLICT.
-- ============================================================================

UPDATE tokens SET category = 'open-digital-economy', sector = 'fan-token'
WHERE name = 'Alpine F1 Team Fan Token' AND status = 'validated' AND sector IS NULL;

UPDATE tokens SET category = 'open-digital-economy', sector = 'game'
WHERE name = 'GOG' AND status = 'validated' AND sector IS NULL;

UPDATE tokens SET category = 'open-digital-economy', sector = 'gaming-ecosystem'
WHERE name = 'Illuvium' AND status = 'validated' AND sector IS NULL;

UPDATE tokens SET category = 'open-digital-economy', sector = 'gaming-ecosystem'
WHERE name = 'MAGIC' AND status = 'validated' AND sector IS NULL;

UPDATE tokens SET category = 'open-digital-economy', sector = 'gaming-ecosystem'
WHERE name = 'MOBOX' AND status = 'validated' AND sector IS NULL;

UPDATE tokens SET category = 'infrastructure', sector = 'l1'
WHERE name = 'Peaq' AND status = 'validated' AND sector IS NULL;
