// Anchor + chip-state logic for the Resolve Box UI (milestone J2a). Pure
// functions only — no data fetching here, see use-token-challenges.ts.

import type { Challenge } from '@/types/challenges'
import type {
  AnchorMode,
  ChallengeableClaimType,
} from '@/lib/claims/field-registry'

/**
 * Identifies exactly which claim field a challenge chip (or the "open a
 * challenge" drawer) targets. `claimId` is null for the three 1:1 claim
 * types (token_identity, supply_metrics, emission_model) and is the
 * `allocation_segments.id` for the two row-anchored types.
 */
export interface ChallengeAnchor {
  claimType: ChallengeableClaimType
  claimId: string | null
  anchorMode: AnchorMode // FIELD_ANCHOR_MODE[claimType]
  fieldKey?: string // present for anchorMode 'field'; chosen in the drawer for 'row'
  label: string // e.g. 'Max supply' or 'Team — allocation'
  currentValues: Record<string, unknown> // fieldKey -> current typed value, for the claim-as-sentence + snapshot
}

export type ChipState =
  | 'dormant'
  | 'active'
  | 'dispute_accepted'
  | 'accepted'
  | 'rejected'
  | 'auto_adopted'
  | 'stale'
  | 'expired'

const resolvedTimestamp = (c: Challenge): string =>
  c.resolved_at ?? c.updated_at

/**
 * Derives the chip state for ONE field from all challenges matching that
 * field (any statuses; the caller filters via useTokenChallenges().forField).
 *
 *  - any open challenge always wins: 'active'.
 *  - otherwise the most-recently-resolved challenge (by resolved_at, falling
 *    back to updated_at for statuses that never set resolved_at, e.g.
 *    'withdrawn') decides the chip — 'withdrawn' itself is excluded from
 *    consideration since a withdrawn challenge leaves nothing to surface.
 *  - a `dispute` challenge that was `accepted` shows as 'dispute_accepted'
 *    until the token's own updated_at moves past the challenge's
 *    resolved_at, i.e. until the owner/moderator actually applies the
 *    correction through the studio (resolve_challenge_tx never writes the
 *    field itself, see 20260709_add_challenges_rpcs.sql).
 *  - no (non-withdrawn, non-open) challenges at all -> 'dormant'.
 */
export function deriveChipState(
  challenges: Challenge[],
  tokenUpdatedAt: string,
): ChipState {
  if (challenges.some((c) => c.status === 'open')) return 'active'

  const resolved = challenges.filter(
    (c) => c.status !== 'open' && c.status !== 'withdrawn',
  )
  if (resolved.length === 0) return 'dormant'

  const mostRecent = resolved.reduce((latest, c) =>
    new Date(resolvedTimestamp(c)).getTime() >
    new Date(resolvedTimestamp(latest)).getTime()
      ? c
      : latest,
  )

  if (
    mostRecent.status === 'accepted' &&
    mostRecent.challenge_type === 'dispute' &&
    new Date(tokenUpdatedAt).getTime() <=
      new Date(resolvedTimestamp(mostRecent)).getTime()
  ) {
    return 'dispute_accepted'
  }

  switch (mostRecent.status) {
    case 'accepted':
      return 'accepted'
    case 'auto_adopted':
      return 'auto_adopted'
    case 'rejected':
      return 'rejected'
    case 'stale':
      return 'stale'
    case 'expired':
      return 'expired'
    default:
      // 'open' and 'withdrawn' are filtered out above; unreachable in
      // practice, kept only so the switch is total over ChallengeStatus.
      return 'dormant'
  }
}
