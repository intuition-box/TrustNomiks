'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Hexagon,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { InsightCard } from '@/components/composite/insight-card'
import { buildRegistryPulse } from '@/lib/insights/build-insights'
import { useRegistryTokens } from '@/features/insights/use-registry-tokens'
import { usePriceMovers } from '@/features/insights/use-price-movers'
import { useOpenChallengeCountByToken } from '@/features/claims/use-my-challenges'
import { buildLeaderboard } from '@/lib/contribution/leaderboard'
import { CONTRIBUTION_TIERS, getTierIndex } from '@/lib/contribution/tiers'
import { cn } from '@/lib/utils'

/** Cluster key → taxonomy var (same mapping as the screener's pulse band). */
const CLUSTER_CSS_VAR: Record<string, string> = {
  identity: '--data-token',
  supply: '--data-supply',
  allocation: '--data-allocation',
  vesting: '--data-vesting',
}

/**
 * What the platform has learned, as a compact card rail: the registry's
 * milestone, its weakest cluster, and your own standing. Every card derives
 * from the shared registry read: the rail costs zero extra fetches.
 */
export function InsightRail({ className }: { className?: string }) {
  const { data: tokens } = useRegistryTokens()
  const { data: openChallengeCounts } = useOpenChallengeCountByToken()
  const { topMover } = usePriceMovers()
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  const cards = useMemo(() => {
    if (!tokens || tokens.length === 0) return []
    const pulse = buildRegistryPulse(tokens, new Date())

    let openTotal = 0
    openChallengeCounts.forEach((n) => {
      openTotal += n
    })

    const list: Array<React.ComponentProps<typeof InsightCard>> = []

    list.push({
      title: `${pulse.total} of ${pulse.target} tokens structured`,
      body:
        pulse.additions7d > 0
          ? `+${pulse.additions7d} this week · ${pulse.validated} validated`
          : `${pulse.validated} validated · last added ${pulse.lastAdded?.name ?? 'none yet'}`,
      icon: Hexagon,
      accentVar: '--data-hub',
      href: '/tokens',
    })

    if (pulse.weakest) {
      list.push({
        title: `${pulse.weakest.label} is the weakest cluster`,
        body: `${pulse.weakest.missing} token${pulse.weakest.missing === 1 ? '' : 's'} still missing it · the next contribution lands hardest here`,
        icon: Sparkles,
        accentVar: CLUSTER_CSS_VAR[pulse.weakest.key] ?? '--data-vesting',
        href: '/tokens',
      })
    }

    if (openTotal > 0) {
      list.push({
        title: `${openTotal} open challenge${openTotal === 1 ? '' : 's'}`,
        body: 'consensus is being negotiated on the graph',
        icon: TriangleAlert,
        accentVar: '--data-risk',
      })
    }

    if (topMover) {
      const up = topMover.change24h >= 0
      list.push({
        title: `${topMover.ticker} ${up ? '+' : ''}${topMover.change24h.toFixed(1)}% in 24h`,
        body: `${topMover.name} is the registry's biggest market move`,
        icon: up ? TrendingUp : TrendingDown,
        accentVar: up ? '--success' : '--destructive',
        href: `/tokens/${topMover.tokenId}`,
      })
    }

    if (userId) {
      const leaderboard = buildLeaderboard(tokens, userId)
      const rank = leaderboard.findIndex((e) => e.isCurrentUser) + 1
      const mine = tokens.filter((t) => t.created_by === userId).length
      if (mine > 0 && rank > 0) {
        const tierIndex = getTierIndex(mine)
        const tier = CONTRIBUTION_TIERS[tierIndex]
        const next =
          tierIndex < CONTRIBUTION_TIERS.length - 1
            ? CONTRIBUTION_TIERS[tierIndex + 1]
            : null
        list.push({
          title: `You rank #${rank} · ${tier.label}`,
          body: next
            ? `${next.min - mine} more token${next.min - mine === 1 ? '' : 's'} to reach ${next.label}`
            : 'the summit of the ladder',
          icon: TrendingUp,
          accentVar: '--primary',
          href: '/progress',
        })
      }
    }

    return list.slice(0, 4)
  }, [tokens, openChallengeCounts, topMover, userId])

  if (cards.length === 0) return null

  return (
    <section
      aria-label="Registry insights"
      className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}
    >
      {cards.map((card) => (
        <InsightCard key={card.title} {...card} />
      ))}
    </section>
  )
}
