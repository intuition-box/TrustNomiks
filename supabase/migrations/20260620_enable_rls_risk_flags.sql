-- ============================================================================
-- DRAFT — review before applying; enabling RLS without correct policies will
-- break access. NOT YET APPLIED.
-- ============================================================================
--
-- Enable Row Level Security on `risk_flags`.
--
-- Why this is a DRAFT and not an "emergency fix":
--   The 2026-06-20 read-only production audit could NOT determine the RLS state
--   of `risk_flags` because the table is empty (service-role Content-Range */0).
--   An empty table returns `[]` to anon whether RLS is on or off, so its posture
--   is INCONCLUSIVE via REST and must be made explicit here. If RLS is currently
--   OFF in production, this migration closes the gap before the table is ever
--   populated; if it is already ON with equivalent policies, the IF NOT EXISTS
--   guards make this a no-op.
--
-- Owner column:
--   `risk_flags` has NO per-row owner column. It is a child of `tokens`, joined
--   via `token_id` (confirmed: src/app/(authenticated)/export/page.tsx reads
--   `risk_flags` with `.eq('token_id', tokenId)`). We therefore scope ownership
--   through the FK chain to `tokens.created_by`, exactly like `claim_sources`
--   in 20260228_add_claim_sources.sql:
--       token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())
--
-- Read policy:
--   Authenticated users can read all risk flags (the export pipeline and token
--   detail pages surface them across tokens). Tighten to the owner predicate if
--   risk data must be private to the token owner.
--
-- Idempotent: ENABLE RLS is harmless if already enabled; policies are created
-- only when absent.
-- ============================================================================

BEGIN;

ALTER TABLE risk_flags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'risk_flags'
      AND policyname = 'risk_flags: authenticated users can read'
  ) THEN
    CREATE POLICY "risk_flags: authenticated users can read"
      ON risk_flags FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'risk_flags'
      AND policyname = 'risk_flags: owner can insert'
  ) THEN
    CREATE POLICY "risk_flags: owner can insert"
      ON risk_flags FOR INSERT TO authenticated
      WITH CHECK (
        token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'risk_flags'
      AND policyname = 'risk_flags: owner can update'
  ) THEN
    CREATE POLICY "risk_flags: owner can update"
      ON risk_flags FOR UPDATE TO authenticated
      USING (
        token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())
      )
      WITH CHECK (
        token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'risk_flags'
      AND policyname = 'risk_flags: owner can delete'
  ) THEN
    CREATE POLICY "risk_flags: owner can delete"
      ON risk_flags FOR DELETE TO authenticated
      USING (
        token_id IN (SELECT id FROM tokens WHERE created_by = auth.uid())
      );
  END IF;
END $$;

COMMIT;
