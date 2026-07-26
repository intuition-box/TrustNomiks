-- ============================================================================
-- Fix: a creator's INSERT ... RETURNING on tokens 403s since 20260723
--
-- The read policy from 20260723_scope_token_reads_to_visible_set.sql is
--   USING (id IN (SELECT public.readable_token_ids()))
-- and readable_token_ids() is STABLE: inside INSERT ... RETURNING it runs
-- against the statement snapshot, taken BEFORE the insert. The creator's own
-- fresh row is therefore not in the returned set, the RETURNING row fails the
-- SELECT policy, and PostgREST surfaces 42501 ("new row violates row-level
-- security policy for table tokens"). Net effect: the screener's auto-draft
-- (.insert().select().single()) has been broken for every contributor since
-- 20260723 was applied. The SECURITY DEFINER promote path bypasses RLS, which
-- is why it kept working and masked this.
--
-- Fix: give the parent policy a row-local own-rows clause, evaluated against
-- the candidate row itself (no snapshot, no function). Semantically this adds
-- nothing (readable_token_ids() already contains created_by = auth.uid());
-- it only restores visibility of rows born in the same statement. The
-- function stays the single shared rule for every child-table policy and for
-- future extensions (teams), per the 20260723 design note.
--
-- Child tables are unaffected: their direct writes go through SECURITY
-- DEFINER save_*_tx RPCs, so no other INSERT ... RETURNING crosses this
-- policy shape.
--
-- Apply via supabase-write MCP (standing authorization 2026-07-12); no
-- BEGIN/COMMIT wrapper. Verify afterwards: as a contributor,
-- POST /rest/v1/tokens with Prefer: return=representation must 201.
-- ============================================================================

DROP POLICY IF EXISTS "tokens: read the visible set" ON tokens;
CREATE POLICY "tokens: read the visible set" ON tokens
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR id IN (SELECT public.readable_token_ids())
  );
