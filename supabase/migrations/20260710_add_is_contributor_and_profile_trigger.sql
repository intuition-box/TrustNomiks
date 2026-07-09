-- ============================================================================
-- Contributor predicate + reliable profile creation (dual-auth onboarding)
--
-- Introduces the derived "contributor" role: a user is a contributor iff they
-- have at least one active wallet_links row (unlinked_at IS NULL). There is no
-- stored role flag and no grandfathering, the capability follows the wallet
-- link. is_contributor() is the single source of truth for write-gating,
-- consumed by RLS policies and the save_*_tx RPCs in later 20260710 migrations.
--
-- Also replaces the fragile client-side profile insert (which set an invalid
-- role and silently failed profiles_role_check, leaving every account without
-- a profile row) with a SECURITY DEFINER trigger on auth.users, and backfills
-- the accounts that predate it.
--
-- Depends only on objects that already exist (wallet_links, profiles,
-- auth.users). MUST be applied BEFORE the write-gating migrations that call
-- is_contributor().
-- ============================================================================

-- ── Contributor predicate ────────────────────────────────────────────────
-- SECURITY INVOKER: reads wallet_links as the caller. The wallet_links SELECT
-- policy is "authenticated USING (true)", so the caller can see the rows and
-- the body filters to auth.uid(). auth.uid() comes from the request JWT (not
-- the SQL role), so this also returns the correct answer when called from
-- inside a SECURITY DEFINER RPC, which is the real save_*_tx enforcement point.
CREATE OR REPLACE FUNCTION public.is_contributor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.wallet_links
    WHERE user_id = auth.uid()
      AND unlinked_at IS NULL
  );
$$;

-- Supabase default privileges grant EXECUTE on new public functions to anon,
-- authenticated and service_role explicitly, so REVOKE FROM PUBLIC alone leaves
-- an unwanted anon grant behind. Strip anon too; the predicate is only meaningful
-- for a signed-in user (auth.uid()).
REVOKE EXECUTE ON FUNCTION public.is_contributor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_contributor() TO authenticated, service_role;

-- Partial index backing the predicate (active links per user).
CREATE INDEX IF NOT EXISTS wallet_links_user_id_active_idx
  ON public.wallet_links (user_id)
  WHERE unlinked_at IS NULL;

-- ── Reliable profile creation ────────────────────────────────────────────
-- The unique constraint the trigger's ON CONFLICT targets already exists in
-- this database; guard the ADD so the file stays replay-safe on a fresh clone.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_user_id_key'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- display_name defaults to the email local-part. role and organization keep
-- their column defaults; profiles.role is display-only (edited on the profile
-- page) and is NOT an authorization vector, write-gating is is_contributor()
-- and is_moderator().
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, split_part(NEW.email, '@', 1))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Trigger functions do not check EXECUTE to fire, and this one must never be
-- reachable as a REST RPC. Supabase default privileges grant EXECUTE to anon,
-- authenticated and service_role at creation (advisor 0028/0029), so revoke
-- every non-owner grant, not just PUBLIC.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill accounts that predate the trigger (idempotent).
INSERT INTO public.profiles (user_id, display_name)
SELECT u.id, split_part(u.email, '@', 1)
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;
