'use client'

import { formatCompactNumber } from '@/lib/utils/vesting-timeline'

interface SupplyBarChartProps {
  maxSupply: number
  circulatingSupply: number
}

export function SupplyBarChart({ maxSupply, circulatingSupply }: SupplyBarChartProps) {
  if (maxSupply <= 0) return null

  const circulatingPct = Math.min((circulatingSupply / maxSupply) * 100, 100)
  const lockedPct = 100 - circulatingPct
  const locked = maxSupply - circulatingSupply

  // If no circulating data, show max supply only
  if (circulatingSupply <= 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Max Supply</span>
          <span className="font-mono">{formatCompactNumber(maxSupply)}</span>
        </div>
        <div className="h-5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-sky-500/40 rounded-full" style={{ width: '100%' }} />
        </div>
        <p className="text-xs text-muted-foreground">
          Circulating supply data not available.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="h-6 rounded-full bg-muted overflow-hidden flex">
        {circulatingPct > 0 && (
          <div
            className="h-full bg-emerald-500 transition-all duration-300 flex items-center justify-center"
            style={{ width: `${Math.max(circulatingPct, 2)}%` }}
          >
            {circulatingPct >= 12 && (
              <span className="text-[10px] font-medium text-white">
                {circulatingPct.toFixed(1)}%
              </span>
            )}
          </div>
        )}
        {lockedPct > 0 && (
          <div
            className="h-full bg-amber-500 transition-all duration-300 flex items-center justify-center"
            style={{ width: `${Math.max(lockedPct, 2)}%` }}
          >
            {lockedPct >= 12 && (
              <span className="text-[10px] font-medium text-white">
                {lockedPct.toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Circulating</span>
          <span className="font-mono font-medium">{formatCompactNumber(circulatingSupply)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Locked</span>
          <span className="font-mono font-medium">{formatCompactNumber(locked)}</span>
        </div>
      </div>
    </div>
  )
}
