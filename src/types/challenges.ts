// Domain types for the "Resolve Box" challenge feature (§6.1 of the Resolve
// Box plan). The `challenges` and `challenge_events` DB tables do not exist
// yet — these interfaces mirror the planned columns and are the forward
// contract the eventual migration must implement. Keep this file in sync
// with the migration when it lands.

import type { ClaimType } from '@/types/form'

export type ChallengeType = 'update' | 'dispute'

export type ChallengeStatus =
  | 'open'
  | 'withdrawn'
  | 'accepted'
  | 'rejected'
  | 'auto_adopted'
  | 'stale'
  | 'expired'

export type ChallengeResolutionVia = 'owner' | 'moderator' | 'auto_threshold'

export type ChallengeEventType =
  | 'opened'
  | 'withdrawn'
  | 'owner_accepted'
  | 'owner_rejected'
  | 'moderator_accepted'
  | 'moderator_rejected'
  | 'moderator_corrected'
  | 'auto_adopted'
  | 'onchain_linked'
  | 'stake_recorded'
  | 'stale_marked'
  | 'superseded_notice'
  | 'expired'
  | 'veto_window_started'
  | 'veto_window_cleared'
  | 'published_despite_challenge'

export interface Challenge {
  id: string
  token_id: string
  claim_type: ClaimType
  claim_id: string | null
  field_key: string
  challenge_type: ChallengeType
  reason: string
  evidence_url: string | null
  evidence_note: string | null
  evidence_source_id: string | null
  proposed_value: unknown | null
  snapshot_value: unknown
  snapshot_updated_at: string | null
  status: ChallengeStatus
  resolved_by: string | null
  resolved_via: ChallengeResolutionVia | null
  resolved_at: string | null
  resolution_reason: string | null
  auto_adopt_eligible_at: string | null
  target_triple_id: string | null
  target_triple_term_id: string | null
  counter_term_id: string | null
  curve_id: number | null
  new_claim_term_id: string | null
  supersedes_triple_term_id: string | null
  onchain_tx_hashes: string[] | null
  declared_stake_wei: string | null
  challenger_wallet_address: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface ChallengeEvent {
  id: string
  challenge_id: string | null
  token_id: string | null
  event_type: ChallengeEventType
  from_status: ChallengeStatus | null
  to_status: ChallengeStatus | null
  actor_id: string | null
  actor_role: string | null
  note: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}
