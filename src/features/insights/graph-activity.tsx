'use client'

import { useMemo } from 'react'
import { ActivityFeed } from '@/components/patterns/activity-feed'
import {
  buildActivityItems,
  buildRegistryPulse,
} from '@/lib/insights/build-insights'
import { useActivityFeed } from '@/features/insights/use-activity-feed'
import { useRegistryTokens } from '@/features/insights/use-registry-tokens'

/**
 * The assembled feed: whitelisted lifecycle events joined in memory with
 * token names from the shared registry read, milestones fused in when the
 * ledger is sparse. Renders nothing until both reads land (no empty shell).
 */
export function GraphActivity({ className }: { className?: string }) {
  const { data: events } = useActivityFeed()
  const { data: tokens } = useRegistryTokens()

  const items = useMemo(() => {
    if (!events || !tokens) return []
    const namesById = new Map(
      tokens.map((t) => [t.id, { name: t.name, ticker: t.ticker }]),
    )
    const pulse = buildRegistryPulse(tokens, new Date())
    return buildActivityItems(events, namesById, pulse)
  }, [events, tokens])

  return <ActivityFeed items={items} className={className} />
}
