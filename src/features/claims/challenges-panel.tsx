'use client'

import { useEffect, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Ban,
  CheckCircle2,
  Circle,
  History,
  PenLine,
  ThumbsDown,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/composite/section-card'
import { EmptyState } from '@/components/composite/empty-state'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import { getFieldDef } from '@/lib/claims/field-registry'
import { extractErrorMessage } from '@/features/claims/error-message'
import {
  useChallengesOnMyTokens,
  useMyChallenges,
  type ChallengeWithToken,
} from '@/features/claims/use-my-challenges'
import type { ChallengeStatus, ChallengeType } from '@/types/challenges'

const TYPE_META: Record<
  ChallengeType,
  { label: string; icon: LucideIcon; varName: string }
> = {
  update: { label: 'Update', icon: PenLine, varName: '--info' },
  dispute: { label: 'Dispute', icon: TriangleAlert, varName: '--warning' },
}

const STATUS_META: Record<
  ChallengeStatus,
  { label: string; icon: LucideIcon; varName: string }
> = {
  open: { label: 'Open', icon: Circle, varName: '--info' },
  withdrawn: { label: 'Withdrawn', icon: Ban, varName: '--muted-foreground' },
  accepted: { label: 'Accepted', icon: CheckCircle2, varName: '--success' },
  rejected: { label: 'Rejected', icon: ThumbsDown, varName: '--destructive' },
  auto_adopted: { label: 'Auto-adopted', icon: Users, varName: '--info' },
  stale: { label: 'Stale', icon: TriangleAlert, varName: '--warning' },
  expired: { label: 'Expired', icon: History, varName: '--muted-foreground' },
}

function Pill({
  label,
  icon: Icon,
  varName,
}: {
  label: string
  icon: LucideIcon
  varName: string
}) {
  const v = `hsl(var(${varName}))`
  return (
    <span
      style={{
        color: v,
        backgroundColor: `color-mix(in oklab, ${v} 14%, transparent)`,
        borderColor: `color-mix(in oklab, ${v} 28%, transparent)`,
      }}
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  )
}

function TypeBadge({ type }: { type: ChallengeType }) {
  const meta = TYPE_META[type]
  return <Pill label={meta.label} icon={meta.icon} varName={meta.varName} />
}

function StatusBadge({ status }: { status: ChallengeStatus }) {
  const meta = STATUS_META[status]
  return <Pill label={meta.label} icon={meta.icon} varName={meta.varName} />
}

function RelativeTime({ value }: { value: string }) {
  const when = new Date(value)
  return (
    <time
      dateTime={value}
      title={format(when, 'PPPp')}
      className="text-xs text-faint-foreground"
    >
      {formatDistanceToNow(when, { addSuffix: true })}
    </time>
  )
}

function ChallengeContext({
  c,
  showStatus = true,
}: {
  c: ChallengeWithToken
  showStatus?: boolean
}) {
  const fieldLabel =
    getFieldDef(c.claim_type, c.field_key)?.label ?? c.field_key
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <NodeGlyph type="token" size={12} aria-hidden />
        <span className="truncate text-sm font-medium">
          {c.token?.name ?? 'Unknown token'}
        </span>
        {c.token?.ticker && (
          <span className="font-mono text-xs text-muted-foreground">
            {c.token.ticker}
          </span>
        )}
        <TypeBadge type={c.challenge_type} />
        {showStatus && <StatusBadge status={c.status} />}
      </div>
      <p className="truncate text-xs text-muted-foreground" title={c.reason}>
        <span className="font-medium text-foreground">{fieldLabel}</span>
        {c.reason && <span> · {c.reason}</span>}
      </p>
      <RelativeTime value={c.created_at} />
    </div>
  )
}

interface ChallengesPanelProps {
  className?: string
  /** anchor id for the dashboard's "Open challenges" StatTile to scroll to */
  id?: string
}

/**
 * Dashboard section: challenges opened against the viewer's tokens (with
 * inline accept/reject), and the challenges the viewer has opened themselves
 * (with withdraw). Sweeps stale-expired challenges once on mount.
 */
export function ChallengesPanel({
  className,
  id = 'challenges-panel',
}: ChallengesPanelProps) {
  const queryClient = useQueryClient()
  const { data: onMyTokens, isLoading: onMyTokensLoading } =
    useChallengesOnMyTokens()
  const { data: mine, isLoading: mineLoading } = useMyChallenges()
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    const sweepExpired = async () => {
      try {
        const supabase = createClient()
        const { error } = await supabase.rpc('expire_challenges_tx')
        if (error) {
          console.error('expire_challenges_tx failed', error)
          return
        }
        if (cancelled) return
        queryClient.invalidateQueries({
          queryKey: ['challenges', 'on-my-tokens'],
        })
        queryClient.invalidateQueries({ queryKey: ['challenges', 'mine'] })
      } catch (err) {
        console.error('expire_challenges_tx failed', err)
      }
    }
    sweepExpired()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setPending = (challengeId: string, pending: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev)
      if (pending) next.add(challengeId)
      else next.delete(challengeId)
      return next
    })
  }

  const handleResolve = async (
    challengeId: string,
    decision: 'accept' | 'reject',
  ) => {
    setPending(challengeId, true)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('resolve_challenge_tx', {
        p_challenge_id: challengeId,
        p_decision: decision,
        p_reason: '',
      })
      if (error) {
        toast.error(extractErrorMessage(error, 'Failed to resolve challenge'))
        return
      }
      await queryClient.invalidateQueries({
        queryKey: ['challenges', 'on-my-tokens'],
      })
      toast.success(
        decision === 'accept' ? 'Challenge accepted' : 'Challenge rejected',
      )
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to resolve challenge'))
    } finally {
      setPending(challengeId, false)
    }
  }

  const handleWithdraw = async (challengeId: string) => {
    setPending(challengeId, true)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('withdraw_challenge_tx', {
        p_challenge_id: challengeId,
      })
      if (error) {
        toast.error(extractErrorMessage(error, 'Failed to withdraw challenge'))
        return
      }
      await queryClient.invalidateQueries({ queryKey: ['challenges', 'mine'] })
      toast.success('Challenge withdrawn')
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to withdraw challenge'))
    } finally {
      setPending(challengeId, false)
    }
  }

  const openOnMyTokens = onMyTokens.filter((c) => c.status === 'open')
  const otherOnMyTokens = onMyTokens.filter((c) => c.status !== 'open')

  return (
    <div id={id} className="scroll-mt-6">
      <SectionCard
        title="Challenges"
        accent="risk_flag"
        description="Updates and disputes raised against claims, across the graph."
        className={className}
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Challenges on your tokens
              </h3>
              {openOnMyTokens.length > 0 && (
                <span className="tabular text-xs text-muted-foreground">
                  {openOnMyTokens.length} open
                </span>
              )}
            </div>
            {onMyTokensLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading challenges…
              </p>
            ) : onMyTokens.length === 0 ? (
              <EmptyState
                className="py-8"
                title="No challenges yet"
                description="Nobody has proposed an update or dispute on your tokens."
              />
            ) : (
              <ul className="space-y-2">
                {[...openOnMyTokens, ...otherOnMyTokens].map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-col gap-3 rounded-lg border bg-surface-2/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <ChallengeContext c={c} showStatus={c.status !== 'open'} />
                    {c.status === 'open' && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          disabled={pendingIds.has(c.id)}
                          onClick={() => handleResolve(c.id, 'accept')}
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={pendingIds.has(c.id)}
                          onClick={() => handleResolve(c.id, 'reject')}
                        >
                          <ThumbsDown className="h-4 w-4" aria-hidden />
                          Reject
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 border-t pt-5">
            <h3 className="text-sm font-semibold">Your challenges</h3>
            {mineLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading challenges…
              </p>
            ) : mine.length === 0 ? (
              <EmptyState
                className="py-8"
                title="You haven't opened any challenges"
                description="Propose an update or dispute from a token's claim to see it here."
              />
            ) : (
              <ul className="space-y-2">
                {mine.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-col gap-3 rounded-lg border bg-surface-2/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <ChallengeContext c={c} />
                    {c.status === 'open' && (
                      <div className="flex shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pendingIds.has(c.id)}
                          onClick={() => handleWithdraw(c.id)}
                        >
                          Withdraw
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
