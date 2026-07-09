-- ============================================================================
-- Restrict intuition_pin_cache writes to contributors (dual-auth onboarding)
--
-- intuition_pin_cache is a shared, non-owner-scoped cache: its INSERT/UPDATE
-- policies were WITH CHECK (true) / USING (true), i.e. writable by ANY
-- authenticated user (advisor 0024, finding F3 in docs/rls-audit-20260709.md).
-- Now that "contributor" exists, gate the writes on it. SELECT stays open to
-- all authenticated users (the cache is read-shared by design); there is no
-- DELETE policy, so deletes remain denied.
--
-- Requires public.is_contributor() (20260710_add_is_contributor_and_profile_trigger.sql).
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can insert pin cache" ON public.intuition_pin_cache;
CREATE POLICY "Authenticated users can insert pin cache" ON public.intuition_pin_cache
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_contributor()));

DROP POLICY IF EXISTS "Authenticated users can update pin cache" ON public.intuition_pin_cache;
CREATE POLICY "Authenticated users can update pin cache" ON public.intuition_pin_cache
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_contributor()))
  WITH CHECK ((SELECT public.is_contributor()));
