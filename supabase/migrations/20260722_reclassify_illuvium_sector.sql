-- ============================================================================
-- Reclassify Illuvium: sector gaming-ecosystem -> game (owner review)
--
-- The 20260718 backfill classified Illuvium as open-digital-economy /
-- gaming-ecosystem on an advisory basis, pending review. The review
-- (2026-07-13) corrects the sector to 'game': Illuvium is a game title,
-- not an ecosystem token. The category stays open-digital-economy, so the
-- sector-category consistency CHECK holds (same pairing as GOG).
--
-- Guards: exact name + status + current sector, so replays and any row
-- reclassified since are no-ops. A plain UPDATE does not touch updated_at
-- (no trigger; the optimistic lock only moves inside the save RPCs).
--
-- Apply via supabase-write MCP (standing authorization 2026-07-12); no
-- BEGIN/COMMIT wrapper (the apply runs in its own transaction).
-- ============================================================================

UPDATE tokens SET sector = 'game'
WHERE name = 'Illuvium'
  AND status = 'validated'
  AND sector = 'gaming-ecosystem';
