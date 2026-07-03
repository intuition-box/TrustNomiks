'use client'

import { StatusPill } from '@/components/composite/data-badge'
import { ClusterMeter } from '@/components/patterns/cluster-meter'
import { cn } from '@/lib/utils'
import type { ClusterScores } from '@/lib/utils/completeness'
import type { TokenStatus } from '@/types/token'

interface TokenSelectorCardProps {
  token: {
    id: string
    name: string
    ticker: string
    chain: string | null
    status: string
    completeness: number
    coingecko_image: string | null
    cluster_scores: ClusterScores | null
  }
  /** charts are available for this token */
  ready: boolean
  selected: boolean
  onClick: () => void
}

/**
 * Data Room picker card. Every token appears, thin ones included: readiness is
 * shown (ClusterMeter + hint), never used to hide entries (docs/redesign/08 §8).
 */
export function TokenSelectorCard({ token, ready, selected, onClick }: TokenSelectorCardProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors hover:bg-surface-2',
        selected ? 'border-primary/60 bg-surface-2' : 'bg-surface-1',
      )}
    >
      <div className="flex items-center gap-2.5">
        {token.coingecko_image ? (
          // eslint-disable-next-line @next/next/no-img-element -- tiny remote thumbs, next/image gains nothing here
          <img
            src={token.coingecko_image}
            alt=""
            className="h-8 w-8 flex-shrink-0 rounded-full"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-2">
            <span className="font-mono text-xs font-semibold text-muted-foreground">
              {token.ticker.slice(0, 2)}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{token.name}</span>
            <span className="flex-shrink-0 font-mono text-xs text-muted-foreground">{token.ticker}</span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <ClusterMeter
              scores={token.cluster_scores}
              percent={token.completeness || 0}
              identityComplete={Boolean(token.name && token.ticker)}
            />
            <StatusPill status={token.status as TokenStatus} />
          </div>
        </div>
      </div>
      {!ready && (
        <p className="mt-2 text-[11px] text-faint-foreground">
          Thin data: complete supply or allocation to light its charts up.
        </p>
      )}
    </button>
  )
}
