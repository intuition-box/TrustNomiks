'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  Coins,
  GitBranch,
  History,
  Link2,
  ThumbsDown,
  TriangleAlert,
  UploadCloud,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { WalletGate } from '@/components/composite/wallet-gate'
import { HashText } from '@/components/composite/hash-text'
import {
  useTokenChallenges,
  useChallengeEvents,
} from '@/features/claims/use-token-challenges'
import { useResolveChallenge } from '@/features/claims/use-resolve-challenge'
import { useViewerRole } from '@/features/claims/use-viewer-role'
import { usePublishSupersession } from '@/features/claims/use-publish-supersession'
import { useReclaimStake } from '@/features/claims/use-reclaim-stake'
import type { ChallengeAnchor } from '@/features/claims/challenge-target'
import type {
  Challenge,
  ChallengeEvent,
  ChallengeEventType,
} from '@/types/challenges'

/** claim_type -> studio section, for the "Correct in studio" deep link. */
const STUDIO_SECTION_BY_CLAIM_TYPE: Record<string, string> = {
  token_identity: 'identity',
  supply_metrics: 'supply',
  emission_model: 'emission',
  allocation_segment: 'allocation',
  vesting_schedule: 'vesting',
}

const EVENT_META: Record<
  ChallengeEventType,
  { icon: LucideIcon; label: string }
> = {
  opened: { icon: Circle, label: 'Challenge opened' },
  withdrawn: { icon: Ban, label: 'Withdrawn by the challenger' },
  owner_accepted: { icon: CheckCircle2, label: 'Accepted by the owner' },
  owner_rejected: { icon: ThumbsDown, label: 'Rejected by the owner' },
  moderator_accepted: { icon: CheckCircle2, label: 'Accepted by a moderator' },
  moderator_rejected: { icon: ThumbsDown, label: 'Rejected by a moderator' },
  moderator_corrected: {
    icon: CheckCircle2,
    label: 'Corrected by a moderator',
  },
  auto_adopted: { icon: Users, label: 'Auto-adopted by the community' },
  onchain_linked: { icon: Link2, label: 'Linked on-chain' },
  stake_recorded: { icon: Coins, label: 'Stake recorded' },
  stale_marked: { icon: TriangleAlert, label: 'Marked stale' },
  superseded_notice: { icon: TriangleAlert, label: 'Superseded' },
  expired: { icon: History, label: 'Expired' },
  veto_window_started: { icon: Clock, label: 'Veto window started' },
  veto_window_cleared: { icon: CheckCircle2, label: 'Veto window cleared' },
  published_despite_challenge: {
    icon: TriangleAlert,
    label: 'Published despite the open challenge',
  },
}

/** Shape of resolve_challenge_tx's `next_action` (supabase/migrations/
 * 20260709_add_challenges_rpcs.sql), surfaced only right after an accept. */
interface StudioCorrectionAction {
  kind: 'studio_correction'
  token_id: string
  claim_type: string
  claim_id: string | null
  field_key: string
  proposed_value: unknown
  challenge_type: string
}

function pickCurrentChallenge(challenges: Challenge[]): Challenge | null {
  if (challenges.length === 0) return null
  const open = challenges.find((c) => c.status === 'open')
  if (open) return open
  return [...challenges].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0]
}

interface ResolveBoxProvenanceProps {
  tokenId: string
  anchor: ChallengeAnchor
  fieldKey: string
  token: { id: string; status: string; updated_at: string; created_by: string }
}

/**
 * Band (4): the current/most-recent challenge's provenance, its event
 * timeline, and (for the owner/a moderator, on an open challenge) the
 * accept/reject resolution panel, or (for the challenger) a withdraw button.
 */
export function ResolveBoxProvenance({
  tokenId,
  anchor,
  fieldKey,
  token,
}: ResolveBoxProvenanceProps) {
  const { isLoading, forField } = useTokenChallenges(tokenId)
  const { isOwner, isModerator, userId } = useViewerRole(token)
  const { resolve, withdraw, isPending } = useResolveChallenge(tokenId)
  const { publish, isPublishing } = usePublishSupersession(tokenId)

  const relevant = useMemo(
    () => forField(anchor.claimType, anchor.claimId, fieldKey),
    [forField, anchor.claimType, anchor.claimId, fieldKey],
  )
  const current = useMemo(() => pickCurrentChallenge(relevant), [relevant])
  const { events, isLoading: eventsLoading } = useChallengeEvents(
    current?.id ?? null,
  )
  const { hasReclaimableStake, reclaim, isReclaiming } =
    useReclaimStake(current)

  const [decision, setDecision] = useState<'accept' | 'reject' | null>(null)
  const [decisionReason, setDecisionReason] = useState('')
  const [nextAction, setNextAction] = useState<StudioCorrectionAction | null>(
    null,
  )

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading provenance…</p>
  }

  if (!current) {
    return (
      <p className="text-sm text-muted-foreground">
        No challenge has been opened for this claim yet.
      </p>
    )
  }

  const canResolve =
    (isOwner || isModerator) &&
    current.status === 'open' &&
    current.created_by !== userId
  const isChallenger =
    current.created_by === userId && current.status === 'open'
  const section = STUDIO_SECTION_BY_CLAIM_TYPE[anchor.claimType] ?? 'identity'
  const isAcceptedUpdate =
    current.status === 'accepted' && current.challenge_type === 'update'

  const submitDecision = async () => {
    if (!decision) return
    // useResolveChallenge already unwraps resolve_challenge_tx's
    // `next_action` field, so a truthy result IS the studio-correction
    // payload itself (only present on 'accept'), not a wrapper around it.
    const result = await resolve(current.id, decision, decisionReason.trim())
    if (result) setNextAction(result as unknown as StudioCorrectionAction)
    setDecision(null)
    setDecisionReason('')
  }

  const handleWithdraw = async () => {
    await withdraw(current.id)
  }

  const handlePublishSupersession = async () => {
    await publish(current)
  }

  const handleReclaim = async () => {
    await reclaim()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Timeline</h3>
        <ol className="space-y-2.5">
          {eventsLoading && (
            <li className="text-xs text-muted-foreground">Loading events…</li>
          )}
          {events.map((event) => (
            <ProvenanceEvent key={event.id} event={event} />
          ))}
        </ol>
      </div>

      {nextAction && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-surface-2 p-3">
          <p className="text-xs text-muted-foreground">
            Accepted. Apply this correction in the studio to make it official.
          </p>
          <Button asChild size="sm" variant="brand">
            <Link
              href={`/tokens/new?id=${nextAction.token_id}&section=${section}&challengeId=${current.id}`}
            >
              Correct in studio
            </Link>
          </Button>
        </div>
      )}

      {isAcceptedUpdate && !current.new_claim_term_id && (
        <div className="space-y-2 rounded-lg border bg-surface-2 p-3">
          <p className="text-xs text-muted-foreground">
            Publish this correction on-chain: it mints the corrected value as a
            new claim linked to the old one.
          </p>
          <WalletGate reason="Connect your wallet to publish this correction on-chain.">
            <Button
              size="sm"
              variant="brand"
              onClick={handlePublishSupersession}
              disabled={isPublishing}
            >
              <UploadCloud className="h-4 w-4" aria-hidden />
              {isPublishing ? 'Publishing…' : 'Publish update on-chain'}
            </Button>
          </WalletGate>
        </div>
      )}

      {isAcceptedUpdate && current.new_claim_term_id && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
          <GitBranch className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-medium">Superseded on-chain:</span>
          {current.supersedes_triple_term_id && (
            <span className="flex items-center gap-1">
              old <HashText value={current.supersedes_triple_term_id} />
            </span>
          )}
          <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex items-center gap-1">
            new <HashText value={current.new_claim_term_id} />
          </span>
        </div>
      )}

      {hasReclaimableStake && current.status !== 'open' && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-surface-2 p-3">
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Coins className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Your dispute stake is still locked in this claim&apos;s
            counter-vault. Reclaim it to redeem your tTRUST.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReclaim}
            disabled={isReclaiming}
          >
            {isReclaiming ? 'Reclaiming…' : 'Reclaim stake'}
          </Button>
        </div>
      )}

      {canResolve && (
        <div className="space-y-2 rounded-lg border bg-surface-2 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Resolve this challenge
          </p>
          {decision ? (
            <div className="space-y-2">
              <Textarea
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                placeholder={
                  decision === 'accept'
                    ? 'Why is this accepted?'
                    : 'Why is this rejected?'
                }
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={decision === 'accept' ? 'success' : 'destructive'}
                  onClick={submitDecision}
                  disabled={isPending}
                >
                  Confirm {decision}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDecision(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="success"
                onClick={() => setDecision('accept')}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Accept
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setDecision('reject')}
              >
                <ThumbsDown className="h-4 w-4" aria-hidden />
                Reject
              </Button>
            </div>
          )}
        </div>
      )}

      {isChallenger && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleWithdraw}
          disabled={isPending}
        >
          Withdraw challenge
        </Button>
      )}
    </div>
  )
}

function ProvenanceEvent({ event }: { event: ChallengeEvent }) {
  const meta = EVENT_META[event.event_type]
  const Icon = meta.icon
  const when = new Date(event.created_at)

  return (
    <li className="flex items-start gap-2.5">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{meta.label}</p>
        <p className="text-xs text-muted-foreground">
          <time dateTime={event.created_at} title={format(when, 'PPPp')}>
            {formatDistanceToNow(when, { addSuffix: true })}
          </time>
          {event.note && <span> · {event.note}</span>}
        </p>
      </div>
    </li>
  )
}
