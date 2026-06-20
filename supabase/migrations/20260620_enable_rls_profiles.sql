-- ============================================================================
-- DRAFT — review before applying; enabling RLS without correct policies will
-- break access. NOT YET APPLIED.
-- ============================================================================
--
-- Enable Row Level Security on `profiles`.
--
-- Why this is a DRAFT and not an "emergency fix":
--   The 2026-06-20 read-only production audit could NOT determine the RLS state
--   of `profiles` because the table is empty (service-role Content-Range */0).
--   An empty table returns `[]` to anon whether RLS is on or off, so its posture
--   is INCONCLUSIVE via REST and must be made explicit here. If RLS is currently
--   OFF in production, this migration closes the gap; if it is already ON with
--   equivalent policies, the IF NOT EXISTS guards make this a no-op.
--
-- Owner column:
--   The audit guessed `id`→auth.uid(), but the application disagrees:
--   src/app/login/page.tsx inserts `{ user_id: authData.user.id, ... }`, so the
--   ownership column on `profiles` is `user_id` (FK → auth.users.id). We scope
--   owner writes on `user_id = auth.uid()`.
--
-- Read policy:
--   Authenticated users can read all profiles (display_name / role / organization
--   are shown in shared UI such as the user menu and contributor attribution).
--   Tighten to owner-only reads if profiles must be private.
--
-- Idempotent: ENABLE RLS is harmless if already enabled; policies are created
-- only when absent.
-- ============================================================================

BEGIN;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'profiles: authenticated users can read'
  ) THEN
    CREATE POLICY "profiles: authenticated users can read"
      ON profiles FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'profiles: owner can insert'
  ) THEN
    CREATE POLICY "profiles: owner can insert"
      ON profiles FOR INSERT TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'profiles: owner can update'
  ) THEN
    CREATE POLICY "profiles: owner can update"
      ON profiles FOR UPDATE TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles'
      AND policyname = 'profiles: owner can delete'
  ) THEN
    CREATE POLICY "profiles: owner can delete"
      ON profiles FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

COMMIT;
