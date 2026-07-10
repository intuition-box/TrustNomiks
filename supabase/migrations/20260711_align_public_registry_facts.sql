-- ============================================================================
-- Landing registry facts, aligned on the unified "/300 structured" metric
-- (product decision 2026-07-10: "structured" is the primary vocabulary
-- everywhere; "validated" stays the quality-gated secondary count).
--
-- 1. public_token_count() now counts EVERY structured token (was: validated
--    only), so the landing counter matches the dashboard and the screener.
-- 2. public_token_names() lets the landing hero graph orbit real validated
--    token names instead of synthetic "Token 1..13" labels. Validated only:
--    quality-gated, public facts; no drafts leak. Names and tickers of
--    validated tokens carry no user-scoped data.
--
-- Same security posture as the existing counter (see
-- 20260710_add_public_token_count.sql): SECURITY DEFINER functions exposing
-- aggregates / quality-gated public facts only, EXECUTE granted to anon
-- deliberately, REVOKE FROM PUBLIC restated.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.public_token_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM public.tokens;
$$;

REVOKE EXECUTE ON FUNCTION public.public_token_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_token_count() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_token_names(max_rows integer DEFAULT 16)
RETURNS TABLE (name text, ticker text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.name, t.ticker
  FROM public.tokens t
  WHERE t.status = 'validated'
  ORDER BY t.updated_at DESC
  LIMIT LEAST(GREATEST(coalesce(max_rows, 16), 1), 32);
$$;

REVOKE EXECUTE ON FUNCTION public.public_token_names(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_token_names(integer) TO anon, authenticated;
