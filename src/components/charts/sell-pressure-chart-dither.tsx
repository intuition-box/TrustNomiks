'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import { BarChart } from '@/components/dither-kit/bar-chart'
import { Bar } from '@/components/dither-kit/bar'
import { Grid } from '@/components/dither-kit/grid'
import { XAxis } from '@/components/dither-kit/x-axis'
import { YAxis } from '@/components/dither-kit/y-axis'
import { ReferenceLine } from '@/components/dither-kit/reference-line'
import type { ChartConfig } from '@/components/dither-kit/chart-context'
import { useChart } from '@/components/dither-kit/chart-context'
import { useCommonChart } from '@/components/dither-kit/common-context'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'
import {
  chartRgbFor,
  getDataRgb,
  getSegmentChartColor,
} from '@/lib/design/tokens'
import {
  SEGMENT_TYPES,
  formatSegmentTypeLabel,
  type SellPressurePoint,
} from '@/lib/tokenomics'

/** Stack key for minted supply (no collision with segment_type slugs). */
const EMISSION_STACK_KEY = 'emission'

interface SellPressureChartDitherProps {
  points: SellPressurePoint[]
  /** false renders token counts instead of USD (no reference price set) */
  hasPrice: boolean
  refPriceUsd: number | null
  /** 2% market depth in USD; drawn as a dashed reference line when set */
  marketDepthUsd: number | null
  height?: number
}

/**
 * The dithered twin of sell-pressure-chart.tsx. Monthly nominal sell pressure
 * as bars stacked by allocation, against the dashed 2% market-depth line.
 *
 * The kit's own <Tooltip> renders a fixed label/value list, which would drop
 * the per-allocation breakdown, the price impact and the depth warning — the
 * three things that make this chart a judgement rather than a shape. So the
 * tooltip below is ours, reading the scrubbed index straight off the chart
 * context and indexing back into the real points.
 */
export function SellPressureChartDither({
  points,
  hasPrice,
  refPriceUsd,
  marketDepthUsd,
  height = 240,
}: SellPressureChartDitherProps) {
  const { resolvedTheme } = useTheme()

  const toDisplayUnit = (tokens: number): number =>
    hasPrice && refPriceUsd !== null ? tokens * refPriceUsd : tokens

  // One stacked series per selling segment type, in the canonical taxonomy
  // order (unknown legacy types appended), plus emission on top.
  const { rows, config, typeOrder, hasEmission } = useMemo(() => {
    const sellingTypes = new Set<string>()
    for (const point of points) {
      for (const segmentType of Object.keys(point.soldByType)) {
        sellingTypes.add(segmentType)
      }
    }
    const order = [
      ...SEGMENT_TYPES.filter((t) => sellingTypes.has(t)),
      ...[...sellingTypes].filter(
        (t) => !(SEGMENT_TYPES as readonly string[]).includes(t),
      ),
    ]
    const emission = points.some((point) => point.soldFromEmission > 0)

    const colors = chartRgbFor(order)
    const cfg: ChartConfig = {}
    order.forEach((segmentType, i) => {
      cfg[segmentType] = {
        label: formatSegmentTypeLabel(segmentType),
        color: colors[i],
      }
    })
    if (emission) {
      cfg[EMISSION_STACK_KEY] = {
        label: 'Emission',
        color: getDataRgb('emission'),
      }
    }

    const data = points.map((point) => {
      const row: Record<string, unknown> = {
        month: point.month,
        date: point.date,
      }
      for (const segmentType of order) {
        row[segmentType] = toDisplayUnit(point.soldByType[segmentType] ?? 0)
      }
      if (emission) {
        row[EMISSION_STACK_KEY] = toDisplayUnit(point.soldFromEmission)
      }
      return row
    })

    return { rows: data, config: cfg, typeOrder: order, hasEmission: emission }
    // resolvedTheme intentionally in deps to re-resolve on dark/light switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, hasPrice, refPriceUsd, resolvedTheme])

  const formatValue = (v: number) =>
    hasPrice ? `$${formatCompactNumber(v)}` : formatCompactNumber(v)

  const hasDepth = hasPrice && marketDepthUsd !== null

  return (
    <div style={{ height }}>
      <BarChart
        data={rows}
        config={config}
        stackType="stacked"
        margins={{ top: 10, right: 20, bottom: 22, left: 60 }}
      >
        <Grid />
        <XAxis
          dataKey={points[0]?.date ? 'date' : 'month'}
          tickFormatter={(v) => (typeof v === 'number' ? `M${v}` : String(v))}
        />
        <YAxis tickFormatter={formatValue} />
        {typeOrder.map((segmentType) => (
          <Bar key={segmentType} dataKey={segmentType} />
        ))}
        {hasEmission && <Bar dataKey={EMISSION_STACK_KEY} />}
        {hasDepth && (
          <ReferenceLine
            y={marketDepthUsd}
            label={`2% depth: $${formatCompactNumber(marketDepthUsd)}`}
          />
        )}
        <SellPressureTooltip
          points={points}
          hasPrice={hasPrice}
          refPriceUsd={refPriceUsd}
          marketDepthUsd={marketDepthUsd}
        />
      </BarChart>
    </div>
  )
}

/**
 * Our tooltip, on the kit's DOM layer. `chartLayer = 'dom'` is how the root
 * knows to render it outside the SVG.
 */
function SellPressureTooltip({
  points,
  hasPrice,
  refPriceUsd,
  marketDepthUsd,
}: {
  points: SellPressurePoint[]
  hasPrice: boolean
  refPriceUsd: number | null
  marketDepthUsd: number | null
}) {
  const ctx = useChart()
  const common = useCommonChart()

  const index = ctx.hoverIndex
  if (!ctx.ready || index === null) return null
  const point = points[index]
  if (!point) return null

  const formatSold = (tokens: number): string =>
    hasPrice && refPriceUsd !== null
      ? `$${formatCompactNumber(tokens * refPriceUsd)}`
      : formatCompactNumber(tokens)

  const exceeds =
    hasPrice &&
    marketDepthUsd !== null &&
    (point.soldUsd as number) > marketDepthUsd

  return (
    <div
      className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground text-sm shadow-lg"
      style={{ left: common.tooltipLeft, top: 8 }}
    >
      <p className="mb-1 font-medium">{point.date ?? `Month ${point.month}`}</p>
      <div className="space-y-0.5 text-xs">
        <Row
          label="Tokens sold"
          value={formatCompactNumber(point.tokensSold)}
        />
        {point.soldUsd !== null && (
          <Row
            label="Sell pressure"
            value={`$${formatCompactNumber(point.soldUsd)}`}
          />
        )}
        {point.priceImpactPct !== null && (
          <Row
            label="Est. price impact"
            value={`${point.priceImpactPct.toFixed(1)}%`}
          />
        )}
        {(Object.keys(point.soldByType).length > 0 ||
          point.soldFromEmission > 0) && (
          <div className="mt-1.5 space-y-0.5 border-border border-t pt-1.5">
            {Object.entries(point.soldByType)
              .sort(([, a], [, b]) => b - a)
              .map(([segmentType, tokens]) => (
                <Row
                  key={segmentType}
                  label={formatSegmentTypeLabel(segmentType)}
                  value={formatSold(tokens)}
                  swatch={getSegmentChartColor(segmentType)}
                />
              ))}
            {point.soldFromEmission > 0 && (
              <Row
                label="Emission"
                value={formatSold(point.soldFromEmission)}
                swatch="hsl(var(--data-emission))"
              />
            )}
          </div>
        )}
        {exceeds && (
          <p className="pt-1 font-medium text-warning">
            Exceeds the 2% market depth
          </p>
        )}
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  swatch,
}: {
  label: string
  value: string
  swatch?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5">
        {swatch && (
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: swatch }}
          />
        )}
        {label}
      </span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

SellPressureTooltip.chartLayer = 'dom' as const
