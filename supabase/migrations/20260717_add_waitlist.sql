-- ============================================================================
-- Waitlist: landing-page signups for surfaces that are not live yet
-- (first consumer: the "API & MCP server" ecosystem card).
--
-- Security posture:
-- - RLS on, policies in this same migration.
-- - Write-only funnel: anon (and authenticated, the landing is public either
--   way) may INSERT; nobody can SELECT/UPDATE/DELETE through the API, so the
--   collected emails never leak back out through PostgREST. Reads happen in
--   the Studio SQL editor / supabase-write channel.
-- - Server-side shape checks mirror the client regex (a bare "looks like an
--   email" gate + length cap) so garbage cannot pile up unbounded.
-- ============================================================================

CREATE TABLE waitlist (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text NOT NULL
             CHECK (char_length(email) <= 320 AND email ~* '^\S+@\S+\.\S+$'),
  interest   text NOT NULL DEFAULT 'api-mcp'
             CHECK (interest IN ('api-mcp')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Anonymous signup from the public landing page (write-only: no read policy)
CREATE POLICY "waitlist: public insert"
  ON waitlist FOR INSERT TO anon, authenticated
  WITH CHECK (true);
