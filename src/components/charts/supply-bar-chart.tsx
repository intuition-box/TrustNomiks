'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import { DitherBarRow } from '@/components/charts/dither-bar-row'
import { getTokenRgb } from '@/lib/design/tokens'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'

interface SupplyBarChartProps {
  maxSupply: number
  circulatingSupply: number
}

/**
 * Circulating against the hard cap, as one dithered proportion bar.
 *
 * The two halves take the taxonomy tokens that already mean this elsewhere in
 * the product: circulating is the supply cluster, locked is vesting — because
 * a locked token is precisely one still under a vesting schedule. (This used to
 * be `bg-emerald-500` / `bg-amber-500`: colour with no meaning behind it, and
 * the one chart in the repo that never went through the tokens.)
 */
export function SupplyBarChart({
  maxSupply,
  circulatingSupply,
}: SupplyBarChartProps) {
  const { resolvedTheme } = useTheme()

  const colors = useMemo(
    () => ({
      circulating: getTokenRgb('--data-supply', '187 80% 45%'),
      locked: getTokenRgb('--data-vesting', '160 84% 39%'),
      unknown: getTokenRgb('--muted-foreground', '240 5% 68%'),
    }),
    // resolvedTheme intentionally in deps to re-resolve on dark/light switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme],
  )

  if (maxSupply <= 0) return null

  // No circulating figure: say so, rather than drawing a full bar that would
  // read as "all of it is circulating".
  if (circulatingSupply <= 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span>Max Supply</span>
          <span className="font-mono">{formatCompactNumber(maxSupply)}</span>
        </div>
        <DitherBarRow
          segments={[
            {
              key: 'unknown',
              value: 1,
              color: colors.unknown,
              variant: 'dotted',
            },
          ]}
          total={1}
          height={20}
        />
        <p className="text-muted-foreground text-xs">
          Circulating supply data not available.
        </p>
      </div>
    )
  }

  const circulating = Math.min(circulatingSupply, maxSupply)
  const locked = maxSupply - circulating
  const circulatingPct = (circulating / maxSupply) * 100

  return (
    <div className="space-y-2">
      <DitherBarRow
        segments={[
          { key: 'circulating', value: circulating, color: colors.circulating },
          { key: 'locked', value: locked, color: colors.locked },
        ]}
        total={maxSupply}
        height={24}
      />
      <div className="flex justify-between text-xs">
        <Legend
          label="Circulating"
          value={formatCompactNumber(circulating)}
          cssVar="--data-supply"
          share={`${circulatingPct.toFixed(1)}%`}
        />
        <Legend
          label="Locked"
          value={formatCompactNumber(locked)}
          cssVar="--data-vesting"
          share={`${(100 - circulatingPct).toFixed(1)}%`}
        />
      </div>
    </div>
  )
}

function Legend({
  label,
  value,
  cssVar,
  share,
}: {
  label: string
  value: string
  cssVar: string
  share: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: `hsl(var(${cssVar}))` }}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium font-mono">{value}</span>
      <span className="text-muted-foreground tabular-nums">({share})</span>
    </div>
  )
}
