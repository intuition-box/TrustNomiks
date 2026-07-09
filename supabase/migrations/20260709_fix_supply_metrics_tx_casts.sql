-- ============================================================================
-- Fix save_supply_metrics_tx: cast jsonb text values to the column types
--
-- Bug: the function (created in 20260322_fix_rpc_auth_and_atomic_saves.sql)
-- inserted `p_metrics->>'…'` values — which are always text — straight into
-- bigint columns (max_supply, initial_supply, tge_supply, circulating_supply)
-- and a date column (circulating_date). Postgres has no implicit text→bigint
-- or text→date assignment cast, so EVERY call failed with
--   ERROR: column "max_supply" is of type bigint but expression is of type text
-- (PostgREST 400). The RPC was dead on arrival: all existing supply_metrics
-- rows predate it (seeded 2026-02-16..19); the first real form save on
-- 2026-07-09 exposed it. Every other save_*_tx function already casts.
--
-- Fix: explicit casts, with NULLIF('') so empty optional fields become NULL
-- instead of failing the cast. The ON CONFLICT branch reuses EXCLUDED.*, so
-- the VALUES list is the single fix point. Also drops the stale comment
-- claiming circulating_date is TEXT (the column is DATE).
--
-- Independent of the two other 20260709 migrations (any apply order is fine).
-- Grants are restated explicitly so a fresh-database replay of this file is
-- correct on its own (CREATE OR REPLACE preserves ACLs on the live DB, but a
-- replayed CREATE would otherwise default to PUBLIC execute).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_supply_metrics_tx(
  p_token_id uuid,
  p_metrics jsonb,
  p_expected_updated_at timestamptz,
  p_completeness integer DEFAULT NULL,
  p_cluster_scores jsonb DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at timestamptz;
  v_new_updated_at     timestamptz := now();
BEGIN
  -- Ownership check
  IF (SELECT created_by FROM tokens WHERE id = p_token_id) IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You do not own this token'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Optimistic lock check
  SELECT updated_at INTO v_current_updated_at
  FROM tokens WHERE id = p_token_id;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Token was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Upsert supply metrics
  INSERT INTO supply_metrics (
    token_id, max_supply, initial_supply, tge_supply,
    circulating_supply, circulating_date, source_url, notes
  ) VALUES (
    p_token_id,
    NULLIF(p_metrics->>'max_supply', '')::bigint,
    NULLIF(p_metrics->>'initial_supply', '')::bigint,
    NULLIF(p_metrics->>'tge_supply', '')::bigint,
    NULLIF(p_metrics->>'circulating_supply', '')::bigint,
    NULLIF(p_metrics->>'circulating_date', '')::date,
    p_metrics->>'source_url',
    p_metrics->>'notes'
  )
  ON CONFLICT (token_id) DO UPDATE SET
    max_supply         = EXCLUDED.max_supply,
    initial_supply     = EXCLUDED.initial_supply,
    tge_supply         = EXCLUDED.tge_supply,
    circulating_supply = EXCLUDED.circulating_supply,
    circulating_date   = EXCLUDED.circulating_date,
    source_url         = EXCLUDED.source_url,
    notes              = EXCLUDED.notes;

  -- Atomic token bump
  UPDATE tokens SET
    updated_at     = v_new_updated_at,
    completeness   = COALESCE(p_completeness, completeness),
    cluster_scores = COALESCE(p_cluster_scores, cluster_scores)
  WHERE id = p_token_id;

  RETURN v_new_updated_at;
END;
$function$;

-- Replay-safe grants (see header): no anonymous/PUBLIC execution, app + ops only.
REVOKE EXECUTE ON FUNCTION public.save_supply_metrics_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_supply_metrics_tx(uuid, jsonb, timestamptz, integer, jsonb) TO authenticated, service_role;
