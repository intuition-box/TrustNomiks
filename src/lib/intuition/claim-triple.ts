/**
 * Resolves a challenged claim field (claimType + claimId + fieldKey) to its
 * published on-chain triple, so the Resolve Box can build a `dispute`
 * transaction against the existing claim triple and its counter-triple.
 *
 * Resolution chain:
 *   1. fieldKey -> predicate internalKey (field-registry.ts), gated on the
 *      predicate actually being canonically registered on-chain.
 *   2. internalKey -> predicate atom termId (canonical-registry.ts).
 *   3. tokenId -> this token's publish run ids (intuition_publish_runs).
 *   4. run ids + claimType + predicateTermId -> confirmed claim_mappings
 *      rows (intuition_claim_mappings), newest first.
 *   5. Pick the one row that actually corresponds to this claimId (see
 *      pickMappingRow below and the origin_row_id note).
 *   6. tripleTermId -> counterTermId via the SDK's pure, client-side
 *      `calculateCounterTripleId` (no RPC call).
 *
 * origin_row_id assumption (verified against
 * supabase/migrations/20260322_knowledge_graph_views.sql, kg_triples_v1):
 *   - allocation_segment literal facts (has_percentage, has_token_amount,
 *     has_wallet_address) set `origin_row_id = a.id` — i.e. exactly
 *     `allocation_segments.id`. This IS the challenge's claimId for
 *     claim_type='allocation_segment' (see
 *     supabase/migrations/20260709_add_challenges.sql,
 *     `challenges_claim_id_shape`: claim_id = allocation_segments.id for
 *     both allocation_segment and vesting_schedule). So for
 *     allocation_segment, origin_row_id === claimId directly.
 *   - vesting_schedule literal facts (has_cliff_months, has_duration_months,
 *     has_frequency, has_tge_percentage, has_cliff_unlock_percentage) set
 *     `origin_row_id = v.id` — i.e. `vesting_schedules.id`, NOT the
 *     allocation id, even though the view only joins through
 *     allocation_segments to derive token_id. This is a genuine mismatch:
 *     the challenge's claimId is the allocation id, but the published
 *     mapping's origin_row_id is the vesting row id. We resolve it with one
 *     extra lookup (`vesting_schedules` where `allocation_id = claimId`,
 *     RLS: authenticated read is open, see
 *     20260620_enable_rls_child_write_policies.sql) to translate the
 *     allocation id into the vesting row id before matching. If no live
 *     vesting row exists for that allocation anymore, resolution fails
 *     (returns null) rather than guessing.
 *
 * `resolveChallengeTripleFull` (J5, on-chain UPDATE flow) runs the exact same
 * chain via the private `resolvePickedMapping` helper and additionally
 * returns the picked row's subject/predicate/object term ids, so the caller
 * can compose the replacement triple that supersedes the old one.
 */

import { calculateCounterTripleId } from '@0xintuition/sdk'
import type { Hex } from 'viem'
import type { ClaimType } from '@/types/form'
import {
  FIELD_ANCHOR_MODE,
  getFieldPredicate,
  type ChallengeableClaimType,
} from '@/lib/claims/field-registry'
import {
  getCanonicalPredicate,
  hasCanonicalPredicate,
} from '@/lib/intuition/canonical-registry'

export interface ResolvedTriple {
  tripleTermId: Hex
  counterTermId: Hex
}

/**
 * Full resolution for the on-chain UPDATE flow: everything
 * `resolveChallengeTriple` returns, plus the subject/predicate/old-object
 * term ids needed to build the replacement triple (same subject, same
 * predicate, new object) alongside the dispute against the old one.
 */
export interface ResolvedTripleFull {
  tripleTermId: Hex // the old claim triple
  counterTermId: Hex
  subjectTermId: Hex // reuse for the new triple (same subject)
  predicateTermId: Hex // reuse for the new triple (same predicate)
  oldObjectTermId: Hex // the value atom being replaced
}

export interface ClaimMappingRow {
  triple_term_id: string | null
  origin_row_id: string | null
  created_at: string
  // NOT NULL in intuition_claim_mappings (see
  // 20260327_intuition_publish_tracking.sql), but optional here: the
  // pickMappingRow unit tests build minimal ClaimMappingRow fixtures that
  // predate these fields and never read them, so they stay optional on this
  // shared interface rather than forcing every fixture to carry dummy
  // on-chain ids that are irrelevant to the logic under test.
  subject_term_id?: string
  predicate_term_id?: string
  object_term_id?: string
}

/**
 * Minimal shape both the browser (`@/lib/supabase/client`) and server
 * (`@/lib/supabase/server`) Supabase clients satisfy. Neither is constructed
 * with a generated `Database` type in this repo (see
 * src/lib/supabase/{client,server}.ts), so there is no stronger type to
 * import — this is intentionally loose rather than falsely precise.
 */
export type MinimalSupabaseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any
}

// ── pickMappingRow (pure) ────────────────────────────────────────────────────

/**
 * Selects the one confirmed claim_mappings row that corresponds to a
 * challenge, given `rows` already filtered to the right token/claim_group/
 * predicate/status and sorted newest-first by created_at.
 *
 * - 1:1 claim types (token_identity, supply_metrics, emission_model) have no
 *   per-row anchor — the token+predicate pair already addresses the claim —
 *   so the most-recently-confirmed row wins.
 * - Row-anchored claim types (allocation_segment, vesting_schedule) match by
 *   `origin_row_id === claimId`. For allocation_segment, `claimId` here is
 *   the challenge's claimId directly (= allocation_segments.id, same as
 *   origin_row_id). For vesting_schedule, the CALLER must first resolve the
 *   allocation id to the corresponding `vesting_schedules.id` and pass that
 *   resolved id in the `claimId` slot — see the module-level comment above.
 * - An unrecognized claimType, or a row-anchored type with a null claimId
 *   (shouldn't happen given field-registry's constraints), falls back to the
 *   1:1 behavior defensively rather than throwing.
 */
export function pickMappingRow(
  rows: readonly ClaimMappingRow[],
  claimType: string,
  claimId: string | null,
): ClaimMappingRow | null {
  if (rows.length === 0) return null

  const isRowAnchored =
    FIELD_ANCHOR_MODE[claimType as ChallengeableClaimType] === 'row'

  if (!isRowAnchored || claimId === null) {
    return rows[0]
  }

  return rows.find((row) => row.origin_row_id === claimId) ?? null
}

// ── resolvePickedMapping (shared internals) ─────────────────────────────────

interface PickedMapping {
  row: ClaimMappingRow
  counterTermId: Hex
}

/**
 * Shared body behind both `resolveChallengeTriple` and
 * `resolveChallengeTripleFull`: resolves the challenge args down to the one
 * confirmed `intuition_claim_mappings` row that corresponds to it, plus the
 * counter-triple id derived from it. Neither exported function does any
 * resolution of its own beyond shaping this into its own return type — this
 * guarantees zero behavior drift between the two.
 */
async function resolvePickedMapping(
  supabase: MinimalSupabaseClient,
  args: {
    tokenId: string
    claimType: string
    claimId: string | null
    fieldKey: string
  },
): Promise<PickedMapping | null> {
  const { tokenId, claimType, claimId, fieldKey } = args

  // 1. Field -> predicate internal key. getFieldPredicate already gates on
  // hasCanonicalPredicate internally; the explicit check here documents and
  // defends the invariant against future changes to that helper.
  const internalKey = getFieldPredicate(claimType as ClaimType, fieldKey)
  if (!internalKey || !hasCanonicalPredicate(internalKey)) {
    return null
  }

  // 2. Predicate internal key -> on-chain predicate atom termId.
  const predicateTermId = getCanonicalPredicate(internalKey).termId

  // 3. This token's publish runs.
  const { data: runs, error: runsError } = await supabase
    .from('intuition_publish_runs')
    .select('id')
    .eq('token_id', tokenId)

  if (runsError || !runs || runs.length === 0) {
    return null
  }

  const runIds = (runs as Array<{ id: string }>).map((run) => run.id)

  // 4. Confirmed claim mappings for this predicate under this token, newest
  // first (pickMappingRow relies on this order for the 1:1 case).
  const { data: rows, error: rowsError } = await supabase
    .from('intuition_claim_mappings')
    .select(
      'triple_term_id, origin_row_id, created_at, subject_term_id, predicate_term_id, object_term_id',
    )
    .in('run_id', runIds)
    .eq('claim_group', claimType)
    .eq('predicate_term_id', predicateTermId)
    .eq('status', 'confirmed')
    .not('triple_term_id', 'is', null)
    .order('created_at', { ascending: false })

  if (rowsError || !rows || rows.length === 0) {
    return null
  }

  // 5. Resolve the row-match id. For vesting_schedule, origin_row_id is the
  // vesting row id, not the allocation id carried by the challenge — see the
  // module-level comment for why. Translate it with one extra lookup.
  let matchRowId = claimId

  if (claimId && claimType === 'vesting_schedule') {
    const { data: vestingRows, error: vestingError } = await supabase
      .from('vesting_schedules')
      .select('id')
      .eq('allocation_id', claimId)

    if (vestingError || !vestingRows || vestingRows.length === 0) {
      // No live vesting row for this allocation (e.g. deleted since the
      // challenge was opened) — unresolvable, don't guess.
      return null
    }

    matchRowId = (vestingRows[0] as { id: string }).id
  }

  const picked = pickMappingRow(
    rows as ClaimMappingRow[],
    claimType,
    matchRowId,
  )

  if (!picked || !picked.triple_term_id) {
    return null
  }

  // 6. tripleTermId -> counterTermId via the SDK's pure, client-side
  // `calculateCounterTripleId` (no RPC call).
  const counterTermId = calculateCounterTripleId(picked.triple_term_id as Hex)

  return { row: picked, counterTermId }
}

// ── resolveChallengeTriple ───────────────────────────────────────────────────

export async function resolveChallengeTriple(
  supabase: MinimalSupabaseClient,
  args: {
    tokenId: string
    claimType: string
    claimId: string | null
    fieldKey: string
  },
): Promise<ResolvedTriple | null> {
  const resolved = await resolvePickedMapping(supabase, args)
  if (!resolved) return null

  return {
    tripleTermId: resolved.row.triple_term_id as Hex,
    counterTermId: resolved.counterTermId,
  }
}

// ── resolveChallengeTripleFull ───────────────────────────────────────────────

/**
 * Richer resolver for the on-chain UPDATE flow: in addition to the old claim
 * triple + its counter-triple, also returns the subject/predicate/old-object
 * term ids so the caller can compose the replacement triple (same subject,
 * same predicate, new object atom) that supersedes the old one.
 */
export async function resolveChallengeTripleFull(
  supabase: MinimalSupabaseClient,
  args: {
    tokenId: string
    claimType: string
    claimId: string | null
    fieldKey: string
  },
): Promise<ResolvedTripleFull | null> {
  const resolved = await resolvePickedMapping(supabase, args)
  if (!resolved) return null

  const { row, counterTermId } = resolved

  return {
    tripleTermId: row.triple_term_id as Hex,
    counterTermId,
    subjectTermId: row.subject_term_id as Hex,
    predicateTermId: row.predicate_term_id as Hex,
    oldObjectTermId: row.object_term_id as Hex,
  }
}
