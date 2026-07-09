'use client'

import { useState } from 'react'
import {
  AlertCircle,
  Check,
  Clock,
  History,
  Plus,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTokenChallenges } from '@/features/claims/use-token-challenges'
import {
  deriveChipState,
  type ChallengeAnchor,
  type ChipState,
} from '@/features/claims/challenge-target'
import { ResolveBox } from '@/features/claims/resolve-box'

const STATE_META: Record<
  ChipState,
  { icon: LucideIcon; className: string; label: string; pulse?: boolean }
> = {
  dormant: {
    icon: Plus,
    className:
      'border-dashed border-faint-foreground/40 text-faint-foreground hover:border-muted-foreground hover:text-muted-foreground',
    label: 'No challenges. Add one',
  },
  active: {
    icon: AlertCircle,
    className: 'border-warning/40 bg-warning/10 text-warning',
    label: 'Challenge open',
    pulse: true,
  },
  dispute_accepted: {
    icon: TriangleAlert,
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
    label: 'Dispute accepted',
  },
  accepted: {
    icon: Check,
    className: 'border-success/40 bg-success/10 text-success',
    label: 'Update accepted',
  },
  auto_adopted: {
    icon: Users,
    className: 'border-info/40 bg-info/10 text-info',
    label: 'Auto-adopted by the community',
  },
  rejected: {
    icon: X,
    className: 'border-transparent text-faint-foreground opacity-60',
    label: 'Challenge rejected',
  },
  stale: {
    icon: Clock,
    className: 'border-transparent text-faint-foreground opacity-60',
    label: 'Challenge stale',
  },
  expired: {
    icon: History,
    className: 'border-transparent text-faint-foreground opacity-60',
    label: 'Challenge expired',
  },
}

interface StakeChipProps {
  anchor: ChallengeAnchor
  token: { id: string; status: string; updated_at: string; created_by: string }
}

/**
 * Compact inline pill next to a field label or allocation row (mirrors
 * ClaimSourceBadges' placement). Opens the Resolve Box on click. Drafts are
 * not challengeable, so it renders nothing for a draft token.
 */
export function StakeChip({ anchor, token }: StakeChipProps) {
  const [boxOpen, setBoxOpen] = useState(false)
  const { challenges, isLoading, forField } = useTokenChallenges(token.id)

  if (token.status === 'draft') return null
  if (isLoading) return null

  const relevant =
    anchor.anchorMode === 'field' && anchor.fieldKey
      ? forField(anchor.claimType, anchor.claimId, anchor.fieldKey)
      : challenges.filter(
          (c) =>
            c.claim_type === anchor.claimType && c.claim_id === anchor.claimId,
        )

  const state = deriveChipState(relevant, token.updated_at)
  const meta = STATE_META[state]
  const Icon = meta.icon
  const openCount = relevant.filter((c) => c.status === 'open').length

  return (
    <>
      <button
        type="button"
        onClick={() => setBoxOpen(true)}
        aria-label={`${anchor.label}: ${meta.label}`}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors hover:brightness-110',
          meta.className,
        )}
      >
        <Icon
          className={cn('h-3 w-3', meta.pulse && 'motion-safe:animate-pulse')}
          aria-hidden
        />
        {state === 'active' && openCount > 0 && (
          <span className="tabular">{openCount}</span>
        )}
      </button>
      <ResolveBox
        open={boxOpen}
        onOpenChange={setBoxOpen}
        anchor={anchor}
        token={token}
      />
    </>
  )
}
