-- ============================================================================
-- Neutral profile defaults for new accounts (viewer onboarding polish)
--
-- profiles.role and profiles.organization carried org-specific DEFAULTs
-- ('admin' / 'Nomiks') from before migration tracking, so every account
-- created by handle_new_user() (which inserted only user_id + display_name)
-- showed "admin @ Nomiks" on its profile. profiles.role is display-only and
-- grants NO privilege anywhere (no RLS policy, RPC, or client gating reads
-- it), so this is a cosmetic / data-hygiene fix, not a security one.
--
-- This makes NEW accounts neutral. Existing rows are intentionally left as-is:
-- the profile UI now shows the DERIVED role (viewer/contributor) instead of
-- profiles.role, so the stale 'admin' value is no longer surfaced.
--
-- Forward-only; supersedes the INSERT in
-- 20260710_add_is_contributor_and_profile_trigger.sql (do not re-edit that
-- file). CREATE OR REPLACE preserves the function's owner-only EXECUTE grant.
-- ============================================================================

BEGIN;

-- New signups get a neutral role/org. role='viewer' satisfies profiles_role_check
-- (CHECK role IN ('admin','curator','viewer')); organization is left NULL.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, role, organization)
  VALUES (NEW.id, split_part(NEW.email, '@', 1), 'viewer', NULL)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger functions do not check EXECUTE to fire; keep this owner-only.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

-- Make any direct insert path safe too (no longer 'admin' / 'Nomiks').
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'viewer';
ALTER TABLE public.profiles ALTER COLUMN organization DROP DEFAULT;

COMMIT;
