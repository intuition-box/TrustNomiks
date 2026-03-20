'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AssetReadiness } from '@/lib/utils/asset-readiness'

interface TokenSelectorCardProps {
  token: {
    id: string
    name: string
    ticker: string
    chain: string | null
    status: string
    coingecko_image: string | null
  }
  assets: AssetReadiness[]
  selected: boolean
  onClick: () => void
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20',
  in_review:
    'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  validated:
    'bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  validated: 'Validated',
}

export function TokenSelectorCard({
  token,
  assets,
  selected,
  onClick,
}: TokenSelectorCardProps) {
  // Only show Phase 1 assets that are actually rendered in the workspace
  const readyAssets = assets.filter((a) => a.ready && a.phase === 1)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border p-3 transition-all',
        'hover:bg-accent/50',
        selected
          ? 'border-primary bg-accent/30 shadow-sm'
          : 'border-border/60 bg-card'
      )}
    >
      <div className="flex items-center gap-2.5">
        {token.coingecko_image ? (
          <img
            src={token.coingecko_image}
            alt={token.name}
            className="h-8 w-8 rounded-full flex-shrink-0"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-muted-foreground">
              {token.ticker.slice(0, 2)}
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-sm truncate">{token.name}</span>
            <span className="text-xs font-mono text-primary flex-shrink-0">{token.ticker}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {token.chain && (
              <span className="text-[10px] text-muted-foreground">{token.chain}</span>
            )}
            <Badge
              variant="outline"
              className={cn('text-[10px] px-1 py-0 h-4', STATUS_CLASSES[token.status])}
            >
              {STATUS_LABELS[token.status] ?? token.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Asset readiness chips */}
      {readyAssets.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {readyAssets.map((asset) => (
            <span
              key={asset.asset}
              className={cn(
                'inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium',
                asset.chipColor
              )}
            >
              {asset.label}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
