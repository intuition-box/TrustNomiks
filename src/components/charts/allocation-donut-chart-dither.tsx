'use client'

/**
 * PILOT — the dither-kit twin of allocation-donut-chart.tsx (recharts).
 * Same props, so the two are swappable; rendered side by side on /labs/charts
 * so we can judge the dithered canvas against the SVG original before adopting
 * it anywhere real. Delete this (and the labs route) if the answer is no.
 */

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import { PieChart } from '@/components/dither-kit/pie-chart'
import { Pie } from '@/components/dither-kit/pie'
import { Tooltip } from '@/components/dither-kit/tooltip'
import type {
  AreaVariant,
  ChartConfig,
} from '@/components/dither-kit/chart-context'
import { chartRgbFor } from '@/lib/design/tokens'
import { formatSegmentTypeLabel } from '@/types/form'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'

interface Segment {
  label: string
  segment_type: string
  percentage: number
  token_amount: string | null
}

interface AllocationDonutChartDitherProps {
  segments: Segment[]
  maxSupply: string | null
  size?: 'sm' | 'lg'
  /** Fill texture. `gradient` fades each slice outward (softer, but the slice
   *  boundaries blur); `solid` keeps the parts crisp, which an allocation
   *  breakdown arguably needs. */
  variant?: AreaVariant
}

/** Radii mirror the recharts donut so the two read at the same weight. The kit
 *  derives its outer radius from the box, so we only pass the inner ratio. */
const SIZES = {
  sm: {
    box: 160,
    innerRatio: 42 / 65,
    supply: 'text-[11px]',
    caption: 'text-[9px]',
  },
  lg: {
    box: 280,
    innerRatio: 75 / 120,
    supply: 'text-sm',
    caption: 'text-[11px]',
  },
}

const toNumber = (v: string) => Number(v.toString().replace(/,/g, ''))

export function AllocationDonutChartDither({
  segments,
  maxSupply,
  size = 'sm',
  variant = 'gradient',
}: AllocationDonutChartDitherProps) {
  const { box, innerRatio, supply, caption } = SIZES[size]
  const { resolvedTheme } = useTheme()

  // The canvas needs literal channels, and getComputedStyle is not reactive —
  // so the tokens are re-resolved whenever the theme flips.
  const { rows, config } = useMemo(() => {
    const colors = chartRgbFor(segments.map((s) => s.segment_type))
    const used = new Map<string, number>()
    const cfg: ChartConfig = {}
    const data = segments.map((seg, i) => {
      // The slice key doubles as the tooltip heading, so it has to be unique
      // and human-readable: two "Team" pools become "Team" and "Team (2)".
      const n = (used.get(seg.label) ?? 0) + 1
      used.set(seg.label, n)
      const key = n === 1 ? seg.label : `${seg.label} (${n})`
      cfg[key] = {
        label: formatSegmentTypeLabel(seg.segment_type),
        color: colors[i],
      }
      return { key, value: seg.percentage, tokens: seg.token_amount }
    })
    return { rows: data, config: cfg }
    // resolvedTheme intentionally in deps to re-resolve on dark/light switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, resolvedTheme])

  const formattedSupply = maxSupply
    ? formatCompactNumber(toNumber(maxSupply))
    : null

  const valueFormatter = (value: number, name: string) => {
    const tokens = rows.find((r) => r.key === name)?.tokens
    const pct = `${value.toFixed(1)}%`
    return tokens ? `${pct} · ${formatCompactNumber(toNumber(tokens))}` : pct
  }

  return (
    <div className="relative" style={{ width: box, height: box }}>
      <PieChart
        data={rows}
        config={config}
        dataKey="value"
        nameKey="key"
        innerRadius={innerRatio}
        margins={{ top: 6, right: 6, bottom: 6, left: 6 }}
      >
        <Pie variant={variant} />
        {size === 'lg' && <Tooltip valueFormatter={valueFormatter} />}
      </PieChart>

      {formattedSupply && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-semibold text-foreground ${supply}`}>
            {formattedSupply}
          </span>
          <span className={`text-muted-foreground ${caption}`}>Max Supply</span>
        </div>
      )}
    </div>
  )
}
