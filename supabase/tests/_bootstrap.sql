-- ============================================================================
-- _bootstrap.sql — vanilla Postgres 16 shim for testing the challenge-domain
-- RPCs (supabase/migrations/20260709_*..20260712_*) without Supabase.
--
-- Run this FIRST, as superuser, on an empty database. Then apply the ordered
-- migration subset (see accompanying list) in order. Their functions use
-- CREATE OR REPLACE, so later files' bodies win — matching prod.
--
-- Scope decisions (see full report for rationale):
--   - Does NOT create user_roles, wallet_links, wallet_link_nonces,
--     challenges, challenge_events — those come from replaying
--     20260709_add_user_roles.sql / 20260709_add_wallet_linking.sql /
--     20260709_add_challenges.sql. Creating them here too would collide
--     (CREATE TABLE without IF NOT EXISTS) with those migrations.
--   - DOES create the intuition_* mapping/publish tables (in their CURRENT
--     shape, including the run_id column added by
--     20260424_add_run_id_to_intuition_mappings.sql) because we are NOT
--     replaying their defining migrations (20260327_*, 20260429_*) — those
--     predate the challenge-domain window and are out of scope.
--   - No extensions: grep confirms zero use of pgcrypto functions
--     (crypt/digest/hmac/pgp_*) anywhere in supabase/migrations/. PG16's
--     gen_random_uuid() is built-in, no `create extension` needed.
--   - No auth.role()/auth.jwt() stubs: grep confirms zero references in the
--     20260709–20260712 migration set.
-- ============================================================================

-- ── 1. Roles ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Let the superuser running tests SET ROLE into any of these without a
-- separate GRANT step (superuser can already do this, but membership makes
-- intent explicit and keeps this working if tests run as a non-superuser
-- migration owner instead).
GRANT anon, authenticated, service_role TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── 2. auth schema shim ──────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- auth.uid(): reads a per-session/per-transaction custom GUC that tests set
-- directly, standing in for Supabase's JWT-derived auth.uid(). No
-- auth.role()/auth.jwt() stub: grep of supabase/migrations/20260709_*
-- through 20260712_*.sql shows zero references to either.
--
-- Usage in a test:
--   SET LOCAL ROLE authenticated;
--   SET LOCAL "test.uid" = '<uuid of the acting auth.users row>';
--   ... call RPCs ...
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('test.uid', true), '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- ── 3. Base app tables (current shape; predate migration tracking) ──────

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  -- Original pre-migration-tracking defaults ('admin' / 'Nomiks'), per the
  -- header of 20260712_neutral_profile_role_defaults.sql: that migration
  -- flips the DEFAULT going forward but this is the shape it starts from,
  -- and it must already satisfy profiles_role_check for the
  -- handle_new_user() trigger's bare `INSERT (user_id, display_name)`
  -- (20260710_add_is_contributor_and_profile_trigger.sql) to succeed.
  role         text NOT NULL DEFAULT 'admin',
  organization text DEFAULT 'Nomiks',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'curator', 'viewer')),
  -- Named exactly so 20260710_add_is_contributor_and_profile_trigger.sql's
  -- conditional `IF NOT EXISTS (... conname = 'profiles_user_id_key')` sees
  -- it already present and skips the ALTER TABLE ADD CONSTRAINT.
  CONSTRAINT profiles_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.tokens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  ticker           text NOT NULL,
  chain            text,
  contract_address text,
  coingecko_id     text,
  coingecko_image  text,
  tge_date         date,
  category         text,
  sector           text,
  status           text NOT NULL DEFAULT 'draft',
  completeness     integer NOT NULL DEFAULT 0,
  cluster_scores   jsonb,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid NOT NULL REFERENCES auth.users(id),
  CONSTRAINT tokens_status_check CHECK (status IN ('draft', 'in_review', 'validated'))
);

CREATE TABLE IF NOT EXISTS public.allocation_segments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id       uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  segment_type   text,
  label          text,
  percentage     numeric,
  token_amount   bigint,
  wallet_address text
);

CREATE TABLE IF NOT EXISTS public.vesting_schedules (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE, not just indexed: 20260711_vesting_reconcile_and_stale.sql's
  -- header states vesting_schedules is 1:1 with an allocation_segments row
  -- ("allocation_id, unique per schedule") and reconciles by allocation_id
  -- via `IF EXISTS (SELECT 1 FROM vesting_schedules WHERE allocation_id = ...)`.
  -- ON DELETE CASCADE matches save_allocations_tx's comment "(cascades to
  -- vesting_schedules if FK exists)".
  allocation_id           uuid NOT NULL UNIQUE REFERENCES public.allocation_segments(id) ON DELETE CASCADE,
  cliff_months            integer NOT NULL DEFAULT 0,
  duration_months         integer NOT NULL DEFAULT 0,
  frequency               text NOT NULL DEFAULT 'monthly',
  tge_percentage          numeric NOT NULL DEFAULT 0,
  cliff_unlock_percentage numeric NOT NULL DEFAULT 0,
  notes                   text
);

CREATE TABLE IF NOT EXISTS public.supply_metrics (
  token_id           uuid PRIMARY KEY REFERENCES public.tokens(id) ON DELETE CASCADE,
  max_supply         bigint,
  initial_supply     bigint,
  tge_supply         bigint,
  circulating_supply bigint,
  circulating_date   date,
  source_url         text,
  notes              text
);

CREATE TABLE IF NOT EXISTS public.emission_models (
  token_id              uuid PRIMARY KEY REFERENCES public.tokens(id) ON DELETE CASCADE,
  type                  text,
  annual_inflation_rate numeric,
  inflation_schedule    jsonb,
  has_burn              boolean NOT NULL DEFAULT false,
  burn_details          text,
  has_buyback           boolean NOT NULL DEFAULT false,
  buyback_details       text,
  notes                 text
);

CREATE TABLE IF NOT EXISTS public.data_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id      uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  source_type   text,
  document_name text,
  url           text,
  version       text,
  verified_at   date,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.claim_sources (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id       uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  -- ON DELETE CASCADE per save_data_sources_tx's comment: "Delete existing
  -- sources (claim_sources auto-cascade via FK ON DELETE CASCADE)".
  data_source_id uuid NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  claim_type     text NOT NULL,
  claim_id       uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.risk_flags (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id      uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  flag_type     text,
  severity      text,
  is_flagged    boolean NOT NULL DEFAULT true,
  justification text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 4. Intuition publish/mapping tables (current shape) ─────────────────
-- Verbatim from 20260327_intuition_publish_tracking.sql /
-- 20260327_add_provenance_mappings.sql / 20260429_intuition_pin_cache.sql,
-- with the run_id column from 20260424_add_run_id_to_intuition_mappings.sql
-- folded in inline (that migration is not replayed, so its ADD COLUMN must
-- be baked into the CREATE TABLE here). Columns cross-checked against
-- src/lib/intuition/claim-triple.ts's resolveChallengeTriple query.

CREATE TABLE IF NOT EXISTS public.intuition_publish_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id        uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  chain_id        integer NOT NULL DEFAULT 13579,
  wallet_address  text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  atoms_created   integer NOT NULL DEFAULT 0,
  atoms_skipped   integer NOT NULL DEFAULT 0,
  atoms_failed    integer NOT NULL DEFAULT 0,
  triples_created integer NOT NULL DEFAULT 0,
  triples_skipped integer NOT NULL DEFAULT 0,
  triples_failed  integer NOT NULL DEFAULT 0,
  tx_hashes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors          jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at      timestamptz DEFAULT now(),
  completed_at    timestamptz,
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  CONSTRAINT intuition_publish_runs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.intuition_atom_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atom_id         text NOT NULL UNIQUE,
  atom_type       text NOT NULL,
  normalized_data text NOT NULL,
  term_id         text,
  chain_id        integer NOT NULL DEFAULT 13579,
  tx_hash         text,
  status          text NOT NULL DEFAULT 'pending',
  error_message   text,
  created_at      timestamptz DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES auth.users(id),
  run_id          uuid REFERENCES public.intuition_publish_runs(id) ON DELETE SET NULL,
  CONSTRAINT intuition_atom_mappings_status_check
    CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.intuition_claim_mappings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triple_id                 text NOT NULL UNIQUE,
  claim_group               text,
  origin_row_id             text,
  subject_term_id           text NOT NULL,
  predicate_term_id         text NOT NULL,
  object_term_id            text NOT NULL,
  triple_term_id            text,
  provenance_triple_term_id text,
  chain_id                  integer NOT NULL DEFAULT 13579,
  tx_hash                   text,
  status                    text NOT NULL DEFAULT 'pending',
  error_message             text,
  created_at                timestamptz DEFAULT now(),
  created_by                uuid NOT NULL REFERENCES auth.users(id),
  run_id                    uuid REFERENCES public.intuition_publish_runs(id) ON DELETE SET NULL,
  CONSTRAINT intuition_claim_mappings_status_check
    CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.intuition_provenance_mappings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triple_id                 text NOT NULL,
  source_atom_id            text NOT NULL,
  provenance_triple_term_id text,
  chain_id                  integer NOT NULL DEFAULT 13579,
  tx_hash                   text,
  status                    text NOT NULL DEFAULT 'pending',
  error_message             text,
  created_at                timestamptz DEFAULT now(),
  created_by                uuid NOT NULL REFERENCES auth.users(id),
  run_id                    uuid REFERENCES public.intuition_publish_runs(id) ON DELETE SET NULL,
  CONSTRAINT intuition_provenance_mappings_status_check
    CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
  UNIQUE (triple_id, source_atom_id, chain_id)
);

CREATE TABLE IF NOT EXISTS public.intuition_pin_cache (
  entity_kind  text NOT NULL,
  entity_key   text NOT NULL,
  content_hash text NOT NULL,
  cid          text NOT NULL,
  uri          text NOT NULL,
  term_id      text NOT NULL,
  pinned_json  jsonb NOT NULL,
  pinned_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_kind, entity_key, content_hash)
);

-- ── 5. RLS: enable + baseline collaborative-read policy ─────────────────
-- "SELECT is authenticated USING (true) everywhere" per
-- docs/rls-audit-20260709.md section 1. Write policies for tokens,
-- allocation_segments, supply_metrics, emission_models, data_sources,
-- risk_flags, claim_sources, vesting_schedules, and the four intuition_*
-- mapping/run tables are all (re)created from scratch by the replayed
-- 20260710_gate_writes_by_contributor.sql (DROP POLICY IF EXISTS + CREATE
-- POLICY — works whether or not a same-named policy pre-exists), and
-- intuition_pin_cache's write policies likewise by
-- 20260710_restrict_pin_cache_writes_to_contributors.sql. profiles is the
-- one table NOT touched by any replayed migration's write policies, so its
-- owner-scoped INSERT/UPDATE/DELETE are added here directly (mirrors
-- 20260620_enable_rls_profiles.sql).

DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'profiles', 'tokens', 'allocation_segments', 'vesting_schedules',
    'supply_metrics', 'emission_models', 'data_sources', 'claim_sources',
    'risk_flags', 'intuition_publish_runs', 'intuition_atom_mappings',
    'intuition_claim_mappings', 'intuition_provenance_mappings',
    'intuition_pin_cache'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
      t || ': authenticated can read', t
    );
  END LOOP;
END $$;

CREATE POLICY "profiles: owner can insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles: owner can update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "profiles: owner can delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 6. Base table-level grants ───────────────────────────────────────────
-- RLS restricts ROWS; roles still need the underlying SQL privilege on the
-- table itself (Supabase's own project bootstrap grants this by default —
-- it is separate from RLS policies). service_role has BYPASSRLS (§1) but
-- still needs the grant to touch tables at all.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- The tables above cover only what exists now. The challenge-domain tables
-- (challenges, challenge_events, user_roles, wallet_links, …) are created by
-- the migrations applied AFTER this bootstrap; Supabase auto-grants them via
-- project-level default privileges, so replicate that here (postgres also owns
-- the migration objects, so the defaults apply to them).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

-- ============================================================================
-- End of bootstrap. Next: apply the ordered migration subset (see the
-- accompanying list), in order, on top of this.
-- ============================================================================
