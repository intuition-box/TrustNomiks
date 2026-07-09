-- ============================================================================
-- Resolve Box core schema (milestone J2a)
--
-- Adds `challenges` and `challenge_events` — the backbone of the challenge
-- workflow: any authenticated user can open a challenge against a claim on a
-- token (an update proposal or a dispute), and it moves through open →
-- withdrawn/accepted/rejected/auto_adopted/stale/expired via SECURITY DEFINER
-- RPCs (built in a later migration, not this one). `challenge_events` is the
-- append-only audit ledger for every state transition.
--
-- `claim_id` is deliberately polymorphic with NO foreign key, mirroring the
-- existing `claim_sources` table (see 20260228_add_claim_sources.sql):
--   - NULL            → claim_type IN ('token_identity','supply_metrics','emission_model')
--                        (1:1 with the token, so the token_id + claim_type pair
--                        already addresses the claim)
--   - allocation_segments.id → claim_type IN ('allocation_segment','vesting_schedule')
-- Integrity for claim_id is managed application-side (whitelisted field keys
-- live in src/lib/claims/field-registry.ts) plus the stale-marking trigger
-- below; it is not enforced by the database schema.
--
-- Also adds trigger `tokens_draft_stales_challenges`: when a token's status
-- transitions back to 'draft', its open challenges become stale, since a
-- draft token is not challengeable. StatusManager (src/components/
-- token-detail/StatusManager.tsx) updates tokens.status directly via a plain
-- UPDATE, not through an RPC, so this AFTER UPDATE trigger is the only
-- interception point available for that transition.
--
-- Independent of the other 20260709 migrations in this repo
-- (20260709_add_user_roles.sql, 20260709_add_wallet_linking.sql,
-- 20260709_fix_allocations_and_optional_casts.sql,
-- 20260709_fix_supply_metrics_tx_casts.sql,
-- 20260709_harden_kg_views_and_function_grants.sql,
-- 20260709_revoke_public_execute_definer_functions.sql): it creates brand-new
-- tables and a brand-new trigger only, with no dependency on those files or
-- on their apply order. It references the existing `tokens` and
-- `data_sources` tables, both already present in the live DB.
-- ============================================================================

-- ── Tables ───────────────────────────────────────────────────────────────

CREATE TABLE challenges (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id                  uuid NOT NULL REFERENCES tokens(id) ON DELETE RESTRICT,
  claim_type                text NOT NULL CHECK (claim_type IN (
                               'token_identity',
                               'supply_metrics',
                               'emission_model',
                               'allocation_segment',
                               'vesting_schedule'
                             )),
  -- NULL for the three 1:1 types; = allocation_segments.id for
  -- allocation_segment/vesting_schedule. Deliberately NO foreign key
  -- (polymorphic addressing, mirrors claim_sources); integrity managed by
  -- app + stale hooks, not the database.
  claim_id                  uuid,
  field_key                 text NOT NULL, -- whitelisted app-side via src/lib/claims/field-registry.ts
  challenge_type            text NOT NULL CHECK (challenge_type IN ('update', 'dispute')),
  reason                    text NOT NULL,
  evidence_url              text,
  evidence_note             text,
  evidence_source_id        uuid REFERENCES data_sources(id) ON DELETE SET NULL,
  proposed_value            jsonb,
  snapshot_value            jsonb NOT NULL,
  snapshot_updated_at       timestamptz,
  status                    text NOT NULL DEFAULT 'open' CHECK (status IN (
                               'open',
                               'withdrawn',
                               'accepted',
                               'rejected',
                               'auto_adopted',
                               'stale',
                               'expired'
                             )),
  resolved_by               uuid REFERENCES auth.users(id),
  resolved_via              text CHECK (resolved_via IS NULL OR resolved_via IN ('owner', 'moderator', 'auto_threshold')),
  resolved_at               timestamptz,
  resolution_reason         text,
  auto_adopt_eligible_at    timestamptz,
  target_triple_id          text,
  target_triple_term_id     text,
  counter_term_id           text,
  curve_id                  integer,
  new_claim_term_id         text,
  supersedes_triple_term_id text,
  onchain_tx_hashes         jsonb NOT NULL DEFAULT '[]'::jsonb,
  declared_stake_wei        text, -- text: wei can exceed bigint; indicative only, never source of truth
  challenger_wallet_address text,
  created_by                uuid NOT NULL REFERENCES auth.users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT challenges_claim_id_shape CHECK (
    (claim_type IN ('token_identity', 'supply_metrics', 'emission_model') AND claim_id IS NULL)
    OR (claim_type IN ('allocation_segment', 'vesting_schedule') AND claim_id IS NOT NULL)
  ),
  CONSTRAINT challenges_update_needs_proposal CHECK (
    challenge_type <> 'update' OR proposed_value IS NOT NULL
  )
);

-- Only one open challenge per (token, claim, field, challenge_type) at a
-- time. claim_id is nullable for 1:1 claim types, and NULL never equals NULL
-- in a unique index, so COALESCE to a sentinel uuid to make those rows
-- collide correctly too.
CREATE UNIQUE INDEX challenges_one_open_per_field_and_type
  ON challenges (token_id, claim_type,
    COALESCE(claim_id, '00000000-0000-0000-0000-000000000000'::uuid),
    field_key, challenge_type)
  WHERE status = 'open';

CREATE INDEX idx_challenges_token ON challenges (token_id);
CREATE INDEX idx_challenges_status ON challenges (status);
CREATE INDEX idx_challenges_created_by ON challenges (created_by);

CREATE TABLE challenge_events (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id   uuid REFERENCES challenges(id), -- nullable: NULL for token-scoped events with no single challenge
  token_id       uuid REFERENCES tokens(id),      -- nullable
  event_type     text NOT NULL CHECK (event_type IN (
                    'opened',
                    'withdrawn',
                    'owner_accepted',
                    'owner_rejected',
                    'moderator_accepted',
                    'moderator_rejected',
                    'moderator_corrected',
                    'auto_adopted',
                    'onchain_linked',
                    'stake_recorded',
                    'stale_marked',
                    'superseded_notice',
                    'expired',
                    'veto_window_started',
                    'veto_window_cleared',
                    'published_despite_challenge'
                  )),
  from_status    text,
  to_status      text,
  actor_id       uuid REFERENCES auth.users(id), -- NULL = system
  actor_role     text,
  note           text,
  metadata       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT challenge_events_scope CHECK (challenge_id IS NOT NULL OR token_id IS NOT NULL)
);

CREATE INDEX idx_challenge_events_challenge ON challenge_events (challenge_id);
CREATE INDEX idx_challenge_events_token ON challenge_events (token_id);

-- ── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenges: authenticated can read"
  ON challenges FOR SELECT TO authenticated USING (true);

-- Defense in depth: normal writes go through open_challenge_tx (a later
-- migration's SECURITY DEFINER RPC), but this stops a forged created_by on
-- any direct-insert path.
CREATE POLICY "challenges: authenticated can insert own"
  ON challenges FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Deliberately no UPDATE/DELETE policy: PostgREST denies both by default
-- without one. Every state transition (withdraw, accept, reject, auto-adopt,
-- stale, expire) happens via SECURITY DEFINER RPCs, not direct table writes.

ALTER TABLE challenge_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenge_events: authenticated can read"
  ON challenge_events FOR SELECT TO authenticated USING (true);

-- Deliberately no write policy: rows are written only from inside the
-- challenge RPCs and the tokens_draft_stales_challenges trigger below, both
-- SECURITY DEFINER, which bypass RLS. This keeps the ledger append-only and
-- tamper-proof from direct client writes.

-- ── Trigger: draft transition stales open challenges ────────────────────

CREATE OR REPLACE FUNCTION public.tokens_draft_stales_challenges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'draft' AND OLD.status IS DISTINCT FROM 'draft' THEN
    -- Insert the stale_marked events BEFORE the update below, while the
    -- open challenges can still be selected.
    INSERT INTO challenge_events (challenge_id, token_id, event_type, from_status, to_status, actor_id, note)
    SELECT id, token_id, 'stale_marked', 'open', 'stale', NULL,
           'Token reverted to draft; open challenge automatically marked stale'
    FROM challenges
    WHERE token_id = NEW.id AND status = 'open';

    UPDATE challenges
    SET status = 'stale', updated_at = now()
    WHERE token_id = NEW.id AND status = 'open';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER tokens_draft_stales_challenges
  AFTER UPDATE OF status ON tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.tokens_draft_stales_challenges();
