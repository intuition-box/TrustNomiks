'use client'

import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { cn } from '@/lib/utils'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import type { ActivityItem } from '@/lib/insights/build-insights'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'

interface ActivityFeedProps {
  items: ActivityItem[]
  className?: string
}

/** Feed kind → taxonomy glyph (color never alone: shape carries it too). */
const KIND_GLYPH: Record<ActivityItem['kind'], NodeType> = {
  dispute: 'risk_flag',
  resolution: 'vesting', // consensus resolved = the emerald "settled" tone
  onchain: 'export_run',
  registry: 'token',
}

/**
 * What the graph lived through, newest first: disputes, resolutions,
 * on-chain anchors, registry milestones. Copy is anonymized by role;
 * undated milestones show no timestamp (never a fake one).
 */
export function ActivityFeed({ items, className }: ActivityFeedProps) {
  if (items.length === 0) return null

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-1',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b px-5 py-3.5">
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-data-vesting opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-data-vesting" />
        </span>
        <h2 className="text-sm font-semibold">Graph activity</h2>
      </div>
      <ul className="divide-y">
        {items.map((item) => {
          const row = (
            <>
              <NodeGlyph
                type={KIND_GLYPH[item.kind]}
                size={10}
                aria-hidden
                className="mt-1 shrink-0"
              />
              <span className="min-w-0 flex-1 text-sm leading-snug">
                {item.message}
              </span>
              {item.at && (
                <time
                  dateTime={item.at}
                  className="tabular shrink-0 text-xs text-faint-foreground"
                >
                  {formatDistanceToNowStrict(new Date(item.at), {
                    addSuffix: true,
                  })}
                </time>
              )}
            </>
          )
          return (
            <li key={item.id}>
              {item.tokenId ? (
                <Link
                  href={`/tokens/${item.tokenId}`}
                  className="flex items-start gap-2.5 px-5 py-2.5 transition-colors hover:bg-surface-2"
                >
                  {row}
                </Link>
              ) : (
                <div className="flex items-start gap-2.5 px-5 py-2.5">
                  {row}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
