-- ============================================================================
-- Announcements: the shell's banner slot (Pulse increment 2)
--
-- Moderator-authored messages surfaced as banners in the authenticated shell
-- (release notes, milestones, maintenance warnings). Reads are limited to the
-- active time window; writes are moderator-only (authoring v1 happens through
-- the Studio SQL editor or the supabase-write channel, no admin UI yet).
--
-- Security posture:
-- - RLS on, policies in this same migration.
-- - body is PLAIN TEXT by contract: the UI renders it as text, never HTML,
--   so a compromised moderator account cannot inject markup (anti-XSS).
-- - No service-role dependency; is_moderator() (SECURITY DEFINER, existing)
--   gates every write.
-- ============================================================================

CREATE TABLE announcements (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  kind        text NOT NULL DEFAULT 'info'
              CHECK (kind IN ('info', 'milestone', 'warning')),
  title       text NOT NULL CHECK (char_length(title) <= 140),
  body        text CHECK (char_length(body) <= 500),
  href        text,
  audience    text NOT NULL DEFAULT 'all'
              CHECK (audience IN ('all', 'contributors', 'viewers')),
  priority    integer NOT NULL DEFAULT 0,
  dismissible boolean NOT NULL DEFAULT true,
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT announcements_window CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX idx_announcements_window ON announcements (starts_at, ends_at);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Readers only ever see currently-active rows
CREATE POLICY "announcements: authenticated read active"
  ON announcements FOR SELECT TO authenticated
  USING (starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

-- Moderator-only authoring
CREATE POLICY "announcements: moderators insert"
  ON announcements FOR INSERT TO authenticated
  WITH CHECK (public.is_moderator(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "announcements: moderators update"
  ON announcements FOR UPDATE TO authenticated
  USING (public.is_moderator(auth.uid()))
  WITH CHECK (public.is_moderator(auth.uid()));

CREATE POLICY "announcements: moderators delete"
  ON announcements FOR DELETE TO authenticated
  USING (public.is_moderator(auth.uid()));
