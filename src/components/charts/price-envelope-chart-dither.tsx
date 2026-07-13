'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import { AreaChart } from '@/components/dither-kit/area-chart'
import { Area, Line } from '@/components/dither-kit/area'
import { Grid } from '@/components/dither-kit/grid'
import { XAxis } from '@/components/dither-kit/x-axis'
import { YAxis } from '@/components/dither-kit/y-axis'
import { ReferenceLine } from '@/components/dither-kit/reference-line'
import type { ChartConfig } from '@/components/dither-kit/chart-context'
import { useChart } from '@/components/dither-kit/chart-context'
import { useCommonChart } from '@/components/dither-kit/common-context'
import { getTokenRgb } from '@/lib/design/tokens'
import { mixOklab } from '@/lib/design/color-space'
import type { EnvelopePoint } from '@/lib/tokenomics'

interface PriceEnvelopeChartDitherProps {
  envelope: EnvelopePoint[]
  /** Drawn as a dashed reference so drift reads against the entry price. */
  initialPriceUsd: number
  height?: number
}

/** Price formatter that survives sub-dollar token prices. */
const formatPrice = (value: number): string => {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  if (value >= 1) return value.toFixed(2)
  if (value === 0) return '0'
  return value.toPrecision(3)
}

/** Widest band first: they nest, and the later (narrower) one paints over the
 *  earlier. `weight` is that band's share of the primary hue against the card —
 *  the solid equivalent of the SVG version's fill opacity, because a canvas
 *  cannot composite alpha the way stacked SVG paths do. */
const BANDS = [
  {
    key: 'p05p95',
    lower: 'p05',
    upper: 'p95',
    label: 'p5 to p95',
    weight: 0.1,
  },
  {
    key: 'p10p90',
    lower: 'p10',
    upper: 'p90',
    label: 'p10 to p90',
    weight: 0.14,
  },
  {
    key: 'p20p80',
    lower: 'p20',
    upper: 'p80',
    label: 'p20 to p80',
    weight: 0.2,
  },
  {
    key: 'p35p65',
    lower: 'p35',
    upper: 'p65',
    label: 'p35 to p65',
    weight: 0.28,
  },
] as const

const MEDIAN_KEY = 'median'

/**
 * The dithered twin of price-envelope-chart.tsx: nested Monte-Carlo percentile
 * bands around the median path.
 *
 * This is the chart that needed all three engine additions — the bands are
 * range series, the axis must not start at zero (an envelope around $1.20
 * flattens into a sliver if it does), and the launch price is a reference line.
 * Bands share one hue at rising intensity: they are one concept, "simulated
 * dispersion", and the tooltip names each one so meaning never rides on colour
 * alone.
 */
export function PriceEnvelopeChartDither({
  envelope,
  initialPriceUsd,
  height = 280,
}: PriceEnvelopeChartDitherProps) {
  const { resolvedTheme } = useTheme()

  const { rows, config, ranges, yDomain } = useMemo(() => {
    const primary = getTokenRgb('--primary', '#6366f1')
    const card = getTokenRgb('--card', '#0b0b0c')

    const cfg: ChartConfig = {}
    const rng: Record<string, [string, string]> = {}
    for (const band of BANDS) {
      cfg[band.key] = {
        label: band.label,
        color: mixOklab(primary, card, band.weight),
      }
      rng[band.key] = [band.lower, band.upper]
    }
    cfg[MEDIAN_KEY] = { label: 'Median', color: primary }

    const data = envelope.map((point) => ({ ...point }))

    // Fit the axis to the envelope itself. Anchoring at zero is right for a
    // supply chart and wrong here — it would crush the whole spread into a
    // sliver at the top of the plot.
    let lo = Number.POSITIVE_INFINITY
    let hi = Number.NEGATIVE_INFINITY
    for (const point of envelope) {
      if (point.p05 < lo) lo = point.p05
      if (point.p95 > hi) hi = point.p95
    }
    // The start price is drawn as a reference line, so it has to be in frame.
    lo = Math.min(lo, initialPriceUsd)
    hi = Math.max(hi, initialPriceUsd)
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1
    const domain: [number, number] = [Math.max(0, lo - pad), hi + pad]

    return { rows: data, config: cfg, ranges: rng, yDomain: domain }
    // resolvedTheme intentionally in deps to re-resolve on dark/light switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelope, initialPriceUsd, resolvedTheme])

  return (
    <div style={{ height }}>
      <AreaChart
        data={rows}
        config={config}
        ranges={ranges}
        yDomain={yDomain}
        margins={{ top: 10, right: 20, bottom: 22, left: 64 }}
      >
        <Grid />
        <XAxis
          dataKey="day"
          tickFormatter={(day) => `M${Math.floor(Number(day ?? 0) / 30)}`}
        />
        <YAxis tickFormatter={(v) => `$${formatPrice(v)}`} />
        {BANDS.map((band) => (
          <Area key={band.key} dataKey={band.key} variant="solid" />
        ))}
        <Line dataKey={MEDIAN_KEY} />
        <ReferenceLine
          y={initialPriceUsd}
          label={`Start: $${formatPrice(initialPriceUsd)}`}
        />
        <EnvelopeTooltip envelope={envelope} />
      </AreaChart>
    </div>
  )
}

/** Ours, on the kit's DOM layer: the kit's own tooltip would list five opaque
 *  series names instead of naming the percentile spreads. */
function EnvelopeTooltip({ envelope }: { envelope: EnvelopePoint[] }) {
  const ctx = useChart()
  const common = useCommonChart()

  const index = ctx.hoverIndex
  if (!ctx.ready || index === null) return null
  const point = envelope[index]
  if (!point) return null

  return (
    <div
      className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground text-sm shadow-lg"
      style={{ left: common.tooltipLeft, top: 8 }}
    >
      <p className="mb-1 font-medium">
        Month {Math.floor(point.day / 30)}, day {point.day}
      </p>
      <div className="space-y-0.5 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">Median</span>
          <span className="font-mono">${formatPrice(point.median)}</span>
        </div>
        {(
          [
            ['p5 to p95', point.p05, point.p95],
            ['p20 to p80', point.p20, point.p80],
          ] as const
        ).map(([label, low, high]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span>{label}</span>
            <span className="font-mono">
              ${formatPrice(low)} to ${formatPrice(high)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

EnvelopeTooltip.chartLayer = 'dom' as const
