-- ============================================================================
-- Anonymous validated-token counter for the landing page
--
-- The landing hero counts the real registry, but anon has no SELECT policy on
-- public.tokens, so RLS denies the count and the counter falls back to a goal
-- statement. This SECURITY DEFINER function exposes ONLY an aggregate count of
-- validated tokens to anon (no rows, no columns), so the public counter can
-- reflect reality without opening token data anonymously.
--
-- Intentional: EXECUTE is granted to anon. The function returns a single
-- integer and reads no user-scoped data. New function only, touches no
-- existing object.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.public_token_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.tokens
  WHERE status = 'validated';
$$;

REVOKE EXECUTE ON FUNCTION public.public_token_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_token_count() TO anon, authenticated;
