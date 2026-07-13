-- ============================================================================
-- Factory S3: simulation snapshots (scenario library)
--
-- A design's saved stress-test scenarios: each row is one named run of the
-- Monte-Carlo engine - the full scenario assumptions (jsonb, the simulate
-- route's wire shape) plus the complete server-computed result (price
-- envelope, KPI aggregates, meta). Rows are inserted by the simulate route
-- only, so results are always server-computed; the client lists, renames
-- and deletes directly under RLS.
--
-- Rationale:
--   - Dedicated child table (not a jsonb column on factory_projects): a
--     design keeps several named scenarios to compare, and project loads
--     stay light.
--   - design_updated_at captures factory_projects.updated_at at run time.
--     updated_at only moves inside the save_factory_*_tx RPCs (i.e. when
--     the design's simulated substance changes), so a mismatch is a precise
--     "design changed since this run" staleness signal.
--   - engine_version is duplicated out of result.meta so the UI can badge
--     runs from an older engine without parsing jsonb.
--   - Snapshot writes never touch factory_projects.updated_at: the form's
--     optimistic lock guards the design, not this library.
--   - No separate project_id index: the UNIQUE (project_id, name) btree
--     already serves the FK and RLS lookups by leftmost prefix.
--   - No updated_at column: rows are immutable except for renames, and
--     created_at is the run timestamp, which must not drift.
--   - Cap of 5 saved scenarios per design, enforced as a hard invariant by
--     a BEFORE INSERT trigger that locks the parent row (serializing
--     concurrent inserts); the simulate route pre-checks for friendly UX.
--
-- Safety: new table, no existing data touched. RLS owner-only mirrors the
-- factory_* family (SELECT for the owner; writes also gated on
-- is_contributor()). anon has no access.
--
-- Apply via supabase-write MCP (standing authorization 2026-07-12); no
-- BEGIN/COMMIT wrapper (the apply runs in its own transaction). Verify
-- rls_enabled, policies, grants and advisors afterwards.
-- ============================================================================

CREATE TABLE factory_simulation_snapshots (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        uuid NOT NULL REFERENCES factory_projects(id) ON DELETE CASCADE,
  name              text NOT NULL,
  scenario          jsonb NOT NULL,
  result            jsonb NOT NULL,
  engine_version    text NOT NULL,
  design_updated_at timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT factory_simulation_snapshots_name_check CHECK (
    char_length(btrim(name)) BETWEEN 1 AND 80
  ),
  CONSTRAINT factory_simulation_snapshots_name_unique UNIQUE (project_id, name)
);

-- ── Cap: at most 5 saved scenarios per design ───────────────────────────────

CREATE FUNCTION public.factory_simulation_snapshots_enforce_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Lock the parent design row so concurrent inserts for the same design
  -- serialize here instead of racing past the count check.
  PERFORM 1 FROM factory_projects WHERE id = NEW.project_id FOR UPDATE;

  IF (
    SELECT count(*) FROM factory_simulation_snapshots
    WHERE project_id = NEW.project_id
  ) >= 5 THEN
    RAISE EXCEPTION 'CAP: a design keeps at most 5 saved scenarios'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER factory_simulation_snapshots_cap
  BEFORE INSERT ON factory_simulation_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.factory_simulation_snapshots_enforce_cap();

-- ── RLS: owner-only, contributor-gated writes (mirrors the factory_* family) ─

ALTER TABLE factory_simulation_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE factory_simulation_snapshots FROM anon;

CREATE POLICY "factory_simulation_snapshots: owner can select" ON factory_simulation_snapshots
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT factory_projects.id FROM factory_projects
                        WHERE factory_projects.created_by = auth.uid()));

CREATE POLICY "factory_simulation_snapshots: owner can insert" ON factory_simulation_snapshots
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_simulation_snapshots: owner can update" ON factory_simulation_snapshots
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_simulation_snapshots: owner can delete" ON factory_simulation_snapshots
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));
