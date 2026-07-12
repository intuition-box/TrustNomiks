-- ============================================================================
-- Factory Phase 3: funding rounds (table + RLS + transactional save RPC)
--
-- A design's fundraising plan: ordered rounds with a type, a token price, a
-- token amount and a raised amount. Factory-only (the screener has no funding
-- section), so there is no live DDL to replicate; conventions mirror the
-- factory_* family from 20260715_add_factory_projects.sql.
--
-- Scoring: funding is an OPTIONAL enrich section. It does NOT participate in
-- the computeFactoryScore / FACTORY_RESCALE contract, so the RPC carries no
-- p_completeness / p_cluster_scores (same nature as the screener's
-- save_risk_flags_tx).
--
-- Numeric shapes: token_price_usd numeric(20,10) (early-round prices go far
-- below a cent), amount_usd numeric(18,2), tokens_sold bigint (mirrors
-- allocation token_amount). All three are stored: the UI cross-calculates
-- price x tokens -> amount but each stays editable, like the allocation
-- percentage/token_amount pair.
--
-- Apply via supabase-write MCP (standing authorization 2026-07-12); verify
-- rls_enabled, policies, proacl and advisors afterwards.
-- ============================================================================

BEGIN;

CREATE TABLE factory_funding_rounds (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id      uuid NOT NULL REFERENCES factory_projects(id) ON DELETE CASCADE,
  round_type      text NOT NULL,
  label           text,
  round_date      date,
  token_price_usd numeric(20,10),
  tokens_sold     bigint,
  amount_usd      numeric(18,2),
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  CONSTRAINT factory_funding_rounds_round_type_check CHECK (
    round_type = ANY (ARRAY[
      'pre-seed'::text, 'seed'::text, 'private'::text, 'strategic'::text,
      'public'::text, 'other'::text
    ])
  ),
  CONSTRAINT factory_funding_rounds_price_check CHECK (
    token_price_usd IS NULL OR token_price_usd >= 0
  ),
  CONSTRAINT factory_funding_rounds_tokens_check CHECK (
    tokens_sold IS NULL OR tokens_sold >= 0
  ),
  CONSTRAINT factory_funding_rounds_amount_check CHECK (
    amount_usd IS NULL OR amount_usd >= 0
  )
);

CREATE INDEX idx_factory_funding_rounds_project_id
  ON factory_funding_rounds (project_id);

-- ── RLS: owner-only, contributor-gated writes (mirrors the factory_* family) ─

ALTER TABLE factory_funding_rounds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE factory_funding_rounds FROM anon;

CREATE POLICY "factory_funding_rounds: owner can select" ON factory_funding_rounds
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT factory_projects.id FROM factory_projects
                        WHERE factory_projects.created_by = auth.uid()));

CREATE POLICY "factory_funding_rounds: owner can insert" ON factory_funding_rounds
  FOR INSERT TO authenticated
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_funding_rounds: owner can update" ON factory_funding_rounds
  FOR UPDATE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()))
  WITH CHECK ((project_id IN (SELECT factory_projects.id FROM factory_projects
                              WHERE factory_projects.created_by = auth.uid()))
              AND (SELECT public.is_contributor()));

CREATE POLICY "factory_funding_rounds: owner can delete" ON factory_funding_rounds
  FOR DELETE TO authenticated
  USING ((project_id IN (SELECT factory_projects.id FROM factory_projects
                         WHERE factory_projects.created_by = auth.uid()))
         AND (SELECT public.is_contributor()));

-- ── save_factory_funding_tx ─────────────────────────────────────────────────
-- House skeleton (single-read owner prologue, contributor gate, optimistic
-- lock, reconcile-by-id, atomic bump, REVOKE/GRANT), no completeness params.
CREATE OR REPLACE FUNCTION public.save_factory_funding_tx(
  p_project_id uuid,
  p_rounds jsonb,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_updated_at     timestamptz;
  v_new_updated_at         timestamptz := now();
  v_existing_ids           uuid[];
  v_submitted_existing_ids uuid[] := '{}';
  v_round                  jsonb;
  v_round_id               uuid;
  v_result_rounds          jsonb;
  v_owner                  uuid;
BEGIN
  SELECT created_by, updated_at INTO v_owner, v_current_updated_at
  FROM factory_projects WHERE id = p_project_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: design not found or not owned'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_owner IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: you do not own this design'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.is_contributor() THEN
    RAISE EXCEPTION 'FORBIDDEN: Contributor role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'CONFLICT: Design was modified by another session'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Existing round ids for this design (scope for the reconcile delete)
  SELECT COALESCE(array_agg(id), '{}') INTO v_existing_ids
  FROM factory_funding_rounds WHERE project_id = p_project_id;

  -- Reconcile by id: UPDATE kept rounds in place, INSERT new ones
  FOR v_round IN SELECT * FROM jsonb_array_elements(p_rounds)
  LOOP
    v_round_id := NULLIF(v_round->>'id', '')::uuid;

    IF v_round_id IS NOT NULL AND v_round_id = ANY(v_existing_ids) THEN
      UPDATE factory_funding_rounds SET
        round_type      = v_round->>'round_type',
        label           = NULLIF(v_round->>'label', ''),
        round_date      = NULLIF(v_round->>'round_date', '')::date,
        token_price_usd = NULLIF(v_round->>'token_price_usd', '')::numeric,
        tokens_sold     = NULLIF(v_round->>'tokens_sold', '')::bigint,
        amount_usd      = NULLIF(v_round->>'amount_usd', '')::numeric,
        notes           = NULLIF(v_round->>'notes', '')
      WHERE id = v_round_id AND project_id = p_project_id;
      v_submitted_existing_ids := v_submitted_existing_ids || v_round_id;
    ELSE
      INSERT INTO factory_funding_rounds (
        project_id, round_type, label, round_date,
        token_price_usd, tokens_sold, amount_usd, notes
      ) VALUES (
        p_project_id,
        v_round->>'round_type',
        NULLIF(v_round->>'label', ''),
        NULLIF(v_round->>'round_date', '')::date,
        NULLIF(v_round->>'token_price_usd', '')::numeric,
        NULLIF(v_round->>'tokens_sold', '')::bigint,
        NULLIF(v_round->>'amount_usd', '')::numeric,
        NULLIF(v_round->>'notes', '')
      );
    END IF;
  END LOOP;

  -- Delete rounds removed by the user
  DELETE FROM factory_funding_rounds
  WHERE project_id = p_project_id
    AND id = ANY(v_existing_ids)
    AND NOT (id = ANY(v_submitted_existing_ids));

  -- Atomic project bump (keeps the optimistic-lock chain consistent)
  UPDATE factory_projects SET updated_at = v_new_updated_at
  WHERE id = p_project_id;

  -- Return saved rounds for client refresh (stable chronological order)
  SELECT COALESCE(
    jsonb_agg(row_to_json(r) ORDER BY r.round_date NULLS LAST, r.created_at),
    '[]'::jsonb
  )
  INTO v_result_rounds
  FROM factory_funding_rounds r
  WHERE r.project_id = p_project_id;

  RETURN jsonb_build_object(
    'updated_at', v_new_updated_at,
    'rounds', v_result_rounds
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_factory_funding_tx(uuid, jsonb, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_factory_funding_tx(uuid, jsonb, timestamptz) TO authenticated, service_role;

COMMIT;
