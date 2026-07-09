-- ============================================================================
-- Moderator RBAC layer (milestone J1e)
--
-- Adds a `user_roles` table plus SECURITY DEFINER RPCs to grant/revoke the
-- 'moderator' role. Moderators are the reviewers who resolve challenges in
-- the Resolve Box (challenge resolution flow) — this migration only lays the
-- RBAC foundation (who is a moderator), not the resolution logic itself.
--
-- Independent of the other 20260709 migrations in this repo
-- (20260709_fix_allocations_and_optional_casts.sql,
-- 20260709_fix_supply_metrics_tx_casts.sql,
-- 20260709_harden_kg_views_and_function_grants.sql,
-- 20260709_revoke_public_execute_definer_functions.sql): it creates a
-- brand-new table and brand-new functions only, with no dependency on those
-- files or on their apply order.
--
-- Self-nomination is impossible by design: user_roles has no INSERT/UPDATE/
-- DELETE policy, so the only way to become a moderator is through
-- grant_moderator_tx, which itself requires the caller to already be a
-- moderator. This means the very first moderator cannot be created through
-- the public API and must be bootstrapped manually, once, via the Supabase
-- Studio SQL Editor (never via the app):
--
--   INSERT INTO user_roles (user_id, role) VALUES ('<auth-user-uuid>', 'moderator');
--
-- ============================================================================

CREATE TABLE user_roles (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  role       text NOT NULL CHECK (role IN ('moderator')),
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- At most one active (non-revoked) row per (user, role) — re-granting after a
-- revoke inserts a new row rather than reviving the old one, preserving history.
CREATE UNIQUE INDEX user_roles_one_active_per_user_role
  ON user_roles (user_id, role)
  WHERE revoked_at IS NULL;

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Deliberately no INSERT/UPDATE/DELETE policy: every write to this table goes
-- through grant_moderator_tx / revoke_moderator_tx below, which are SECURITY
-- DEFINER and bypass RLS. This is what makes self-nomination impossible —
-- there is no direct-write path, authenticated or otherwise, for anyone
-- (including the row's own user_id) to insert or edit their own role.
CREATE POLICY "Authenticated users can read user roles"
  ON user_roles FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- is_moderator: read-only helper, safe to use inside other RLS predicates.
--
-- SECURITY DEFINER so it can check user_roles regardless of the caller's own
-- RLS visibility, without risking recursive policy evaluation on user_roles
-- itself (the SELECT policy above is already USING (true), but future
-- policies elsewhere that gate on is_moderator() rely on this being definer).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_moderator(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id
      AND role = 'moderator'
      AND revoked_at IS NULL
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_moderator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_moderator(uuid) TO authenticated, service_role;

-- ============================================================================
-- grant_moderator_tx: caller must already be a moderator. Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.grant_moderator_tx(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id uuid;
BEGIN
  IF NOT public.is_moderator(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: only moderators can grant moderator status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_existing_id
  FROM user_roles
  WHERE user_id = p_user_id
    AND role = 'moderator'
    AND revoked_at IS NULL;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  INSERT INTO user_roles (user_id, role, granted_by)
  VALUES (p_user_id, 'moderator', auth.uid());

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.grant_moderator_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_moderator_tx(uuid) TO authenticated, service_role;

-- ============================================================================
-- revoke_moderator_tx: caller must already be a moderator.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revoke_moderator_tx(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_revoked_id uuid;
BEGIN
  IF NOT public.is_moderator(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: only moderators can revoke moderator status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE user_roles
  SET revoked_at = now()
  WHERE user_id = p_user_id
    AND role = 'moderator'
    AND revoked_at IS NULL
  RETURNING id INTO v_revoked_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: user is not currently a moderator'
      USING ERRCODE = 'serialization_failure';
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.revoke_moderator_tx(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_moderator_tx(uuid) TO authenticated, service_role;
