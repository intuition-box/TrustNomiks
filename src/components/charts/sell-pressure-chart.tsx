'use client'

import {
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'
import { getSegmentChartColor } from '@/lib/design/tokens'
import {
  SEGMENT_TYPES,
  formatSegmentTypeLabel,
  type SellPressurePoint,
} from '@/lib/tokenomics'

/** Stack key for minted supply (no collision with segment_type slugs). */
const EMISSION_STACK_KEY = 'emission'

interface SellPressureChartProps {
  points: SellPressurePoint[]
  /** false renders token counts instead of USD (no reference price set) */
  hasPrice: boolean
  /** Converts the per-allocation token breakdown to USD in the tooltip. */
  refPriceUsd: number | null
  /** 2% market depth in USD; drawn as a dashed reference line when set */
  marketDepthUsd: number | null
  height?: number
}

/**
 * Monthly nominal sell pressure as bars stacked by allocation (USD when a
 * reference price is set, token counts otherwise), against a dashed 2%
 * market-depth line. Each stack slice uses the segment's chart color, the
 * same one the supply chart above uses, so a bar reads at a glance as the
 * mix of allocations unlocking that month; minted emission sits on top with
 * the emission taxonomy color, mirroring the supply chart's overlay.
 * Exceeding the depth stays a fact of the tooltip and the summary tile.
 */
export function SellPressureChart({
  points,
  hasPrice,
  refPriceUsd,
  marketDepthUsd,
  height = 240,
}: SellPressureChartProps) {
  const exceeds = (point: SellPressurePoint) =>
    hasPrice &&
    marketDepthUsd !== null &&
    (point.soldUsd as number) > marketDepthUsd

  /** Tokens in USD when a price is set, token counts otherwise. */
  const toDisplayUnit = (tokens: number): number =>
    hasPrice && refPriceUsd !== null ? tokens * refPriceUsd : tokens
  const formatSold = (tokens: number): string =>
    hasPrice && refPriceUsd !== null
      ? `$${formatCompactNumber(tokens * refPriceUsd)}`
      : formatCompactNumber(tokens)

  // One stacked series per selling segment type, in the canonical taxonomy
  // order (unknown legacy types appended), plus emission on top.
  const sellingTypes = new Set<string>()
  for (const point of points) {
    for (const segmentType of Object.keys(point.soldByType)) {
      sellingTypes.add(segmentType)
    }
  }
  const typeOrder = [
    ...SEGMENT_TYPES.filter((t) => sellingTypes.has(t)),
    ...[...sellingTypes].filter(
      (t) => !(SEGMENT_TYPES as readonly string[]).includes(t),
    ),
  ]
  const hasEmission = points.some((point) => point.soldFromEmission > 0)

  // Rows keep every SellPressurePoint field (the tooltip reads them back)
  // and add one display-unit value per stacked series.
  const data = points.map((point) => {
    const row: Record<string, unknown> = { ...point }
    for (const segmentType of typeOrder) {
      row[segmentType] = toDisplayUnit(point.soldByType[segmentType] ?? 0)
    }
    if (hasEmission) {
      row[EMISSION_STACK_KEY] = toDisplayUnit(point.soldFromEmission)
    }
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
      >
        <XAxis
          dataKey={points[0]?.date ? 'date' : 'month'}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          tickFormatter={(v) => (typeof v === 'number' ? `M${v}` : v)}
        />
        <YAxis
          tickFormatter={(v) =>
            hasPrice ? `$${formatCompactNumber(v)}` : formatCompactNumber(v)
          }
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted-foreground))', fillOpacity: 0.08 }}
          wrapperStyle={{
            outline: 'none',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
          }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as SellPressurePoint
            return (
              <div
                className="rounded-lg px-3 py-2 text-sm shadow-lg max-w-64"
                style={{
                  backgroundColor: 'hsl(var(--popover))',
                  color: 'hsl(var(--popover-foreground))',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                <p className="font-medium mb-1">
                  {typeof label === 'number' ? `Month ${label}` : label}
                </p>
                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span>Tokens sold</span>
                    <span className="font-mono">
                      {formatCompactNumber(point.tokensSold)}
                    </span>
                  </div>
                  {point.soldUsd !== null && (
                    <div className="flex items-center justify-between gap-3">
                      <span>Sell pressure</span>
                      <span className="font-mono">
                        ${formatCompactNumber(point.soldUsd)}
                      </span>
                    </div>
                  )}
                  {point.priceImpactPct !== null && (
                    <div className="flex items-center justify-between gap-3">
                      <span>Est. price impact</span>
                      <span className="tabular">
                        {point.priceImpactPct.toFixed(1)}%
                      </span>
                    </div>
                  )}
                  {(Object.keys(point.soldByType).length > 0 ||
                    point.soldFromEmission > 0) && (
                    <div
                      className="mt-1.5 space-y-0.5 border-t pt-1.5"
                      style={{ borderColor: 'hsl(var(--border))' }}
                    >
                      {Object.entries(point.soldByType)
                        .sort(([, a], [, b]) => b - a)
                        .map(([segmentType, tokens]) => (
                          <div
                            key={segmentType}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{
                                  backgroundColor:
                                    getSegmentChartColor(segmentType),
                                }}
                              />
                              {formatSegmentTypeLabel(segmentType)}
                            </span>
                            <span className="font-mono">
                              {formatSold(tokens)}
                            </span>
                          </div>
                        ))}
                      {point.soldFromEmission > 0 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{
                                backgroundColor: 'hsl(var(--data-emission))',
                              }}
                            />
                            Emission
                          </span>
                          <span className="font-mono">
                            {formatSold(point.soldFromEmission)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {exceeds(point) && (
                    <p
                      className="pt-1 font-medium"
                      style={{ color: 'hsl(var(--warning))' }}
                    >
                      Exceeds the 2% market depth
                    </p>
                  )}
                </div>
              </div>
            )
          }}
        />
        {hasPrice && marketDepthUsd !== null && (
          <ReferenceLine
            y={marketDepthUsd}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{
              value: `2% depth: $${formatCompactNumber(marketDepthUsd)}`,
              position: 'right',
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 10,
            }}
          />
        )}
        {typeOrder.map((segmentType) => (
          <Bar
            key={segmentType}
            dataKey={segmentType}
            stackId="pressure"
            fill={getSegmentChartColor(segmentType)}
            fillOpacity={0.8}
            isAnimationActive={false}
          />
        ))}
        {hasEmission && (
          <Bar
            dataKey={EMISSION_STACK_KEY}
            stackId="pressure"
            fill="hsl(var(--data-emission))"
            fillOpacity={0.55}
            isAnimationActive={false}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}
