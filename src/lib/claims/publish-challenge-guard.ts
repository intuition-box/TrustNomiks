// Publish-under-challenge guard (Resolve Box plan §8). A token's publish plan
// must, by default, EXCLUDE the claim triples that are currently under an OPEN
// challenge — we never silently publish contested data. This module holds the
// pure matching logic (which plan triple maps to which open challenge); the
// route (`/api/intuition/publish-plan`) does the async Supabase reads and hands
// the rows in.
//
// Matching granularity differs by claim type because the on-chain graph only
// exposes a field-level predicate for some of them:
//
// - token_identity / supply_metrics: FIELD-level. FIELD_REGISTRY maps these
//   fields to `has_*` predicates that survive into a plan triple's
//   predicateAtomId (`atom:predicate:<internalKey>`), so we exclude exactly the
//   challenged field's triple. Predicates that don't map back (has_status,
//   has_completeness) are non-challengeable and are never excluded.
// - emission_model: CLAIM-level (coarse). Its fields have no registry predicate
//   (only `annual_inflation_rate` is a triple; the rest live inside the emission
//   Thing atom) and emission is 1:1 with the token, so any open emission
//   challenge excludes the token's emission triples.
// - allocation_segment: ROW-level. The challenge's claim_id IS the segment row
//   id, which equals the triple's originRowId, so we exclude every value triple
//   of that segment. (segment_type / label live in the allocation Thing atom and
//   on a structural triple tagged token_identity, so those two fields cannot be
//   excluded per-field — documented limitation, safe direction.)
// - vesting_schedule: ROW-level. The challenge stores claim_id = allocation_id
//   (not the vesting row id), so the caller resolves allocation_id ->
//   vesting_schedules.id first and passes the rows to `buildChallengeMatchContext`.

import type { TriplePlanItem } from '@/lib/intuition/types'
import { CHALLENGEABLE_CLAIM_TYPES, FIELD_REGISTRY } from './field-registry'

export interface OpenChallengeRow {
  claim_type: string
  claim_id: string | null
  field_key: string
}

export interface VestingRow {
  id: string
  allocation_id: string
}

/** `atom:predicate:has_name` -> `has_name`. */
export const internalKeyFromPredicateAtomId = (
  predicateAtomId: string,
): string => predicateAtomId.replace('atom:predicate:', '')

/** internalKey -> field_key, per challengeable claim type. Only fields whose
 *  predicate is registered in FIELD_REGISTRY are included (identity + supply). */
export const REVERSE_FIELD_MAP: Record<
  string,
  Record<string, string>
> = (() => {
  const map: Record<string, Record<string, string>> = {}
  for (const claimType of CHALLENGEABLE_CLAIM_TYPES) {
    const inner: Record<string, string> = {}
    for (const field of FIELD_REGISTRY[claimType]) {
      if (field.predicate) {
        inner[field.predicate] = field.key
      }
    }
    map[claimType] = inner
  }
  return map
})()

export interface ChallengeMatchContext {
  /** Challenged field_keys for token_identity (registry-mapped, per field). */
  identityFields: Set<string>
  /** Challenged field_keys for supply_metrics (registry-mapped, per field). */
  supplyFields: Set<string>
  /** Any open emission_model challenge (emission is 1:1, so coarse). */
  emissionChallenged: boolean
  /** Challenged allocation row ids (= challenge.claim_id = segment id). */
  allocationRowIds: Set<string>
  /** Challenged vesting row ids, resolved from the challenge's allocation_id. */
  vestingRowIds: Set<string>
}

/**
 * The allocation_ids the caller must resolve to vesting rows (via
 * `vesting_schedules.allocation_id`) before building the match context.
 */
export function vestingAllocationIdsOf(
  openChallenges: OpenChallengeRow[],
): string[] {
  return openChallenges
    .filter((c) => c.claim_type === 'vesting_schedule' && c.claim_id)
    .map((c) => c.claim_id as string)
}

/**
 * Build the per-token match context from the open challenges and the vesting
 * rows the caller resolved for `vestingAllocationIdsOf(openChallenges)`. Pure —
 * `vestingRows` may be unfiltered; only rows whose allocation_id is actually
 * challenged contribute to `vestingRowIds`.
 */
export function buildChallengeMatchContext(
  openChallenges: OpenChallengeRow[],
  vestingRows: VestingRow[],
): ChallengeMatchContext {
  const challengedAllocationIds = new Set(
    vestingAllocationIdsOf(openChallenges),
  )
  return {
    identityFields: new Set(
      openChallenges
        .filter((c) => c.claim_type === 'token_identity')
        .map((c) => c.field_key),
    ),
    supplyFields: new Set(
      openChallenges
        .filter((c) => c.claim_type === 'supply_metrics')
        .map((c) => c.field_key),
    ),
    emissionChallenged: openChallenges.some(
      (c) => c.claim_type === 'emission_model',
    ),
    allocationRowIds: new Set(
      openChallenges
        .filter((c) => c.claim_type === 'allocation_segment' && c.claim_id)
        .map((c) => c.claim_id as string),
    ),
    vestingRowIds: new Set(
      vestingRows
        .filter((r) => challengedAllocationIds.has(r.allocation_id))
        .map((r) => String(r.id)),
    ),
  }
}

/**
 * True if `triple` belongs to a claim/field/row that currently has an OPEN
 * challenge, per the per-claim-type rules documented at the top of this file.
 */
export function isTripleChallenged(
  triple: TriplePlanItem,
  ctx: ChallengeMatchContext,
): boolean {
  const group = triple.claimGroup
  if (!group) return false

  switch (group) {
    case 'token_identity':
    case 'supply_metrics': {
      const fieldKey =
        REVERSE_FIELD_MAP[group]?.[
          internalKeyFromPredicateAtomId(triple.predicateAtomId)
        ]
      if (!fieldKey) return false
      const challengedFields =
        group === 'token_identity' ? ctx.identityFields : ctx.supplyFields
      return challengedFields.has(fieldKey)
    }
    case 'emission_model':
      return ctx.emissionChallenged
    case 'allocation_segment':
      return (
        triple.originRowId != null &&
        ctx.allocationRowIds.has(triple.originRowId)
      )
    case 'vesting_schedule':
      return (
        triple.originRowId != null && ctx.vestingRowIds.has(triple.originRowId)
      )
    default:
      return false
  }
}
