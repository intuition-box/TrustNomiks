'use client'

import { useMemo } from 'react'
import { useTheme } from 'next-themes'
import { AreaChart } from '@/components/dither-kit/area-chart'
import { Area } from '@/components/dither-kit/area'
import { Grid } from '@/components/dither-kit/grid'
import { XAxis } from '@/components/dither-kit/x-axis'
import { YAxis } from '@/components/dither-kit/y-axis'
import { ReferenceLine } from '@/components/dither-kit/reference-line'
import type { ChartConfig } from '@/components/dither-kit/chart-context'
import { useChart } from '@/components/dither-kit/chart-context'
import { useCommonChart } from '@/components/dither-kit/common-context'
import { Badge } from '@/components/ui/badge'
import { chartRgbFor, getDataRgb } from '@/lib/design/tokens'
import { rgb } from '@/components/dither-kit/palette'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'
import type { VestingTimelinePoint } from '@/lib/utils/vesting-timeline'

interface SegmentInfo {
  label: string
  segment_type: string
}

interface UnlockTimelineChartDitherProps {
  data: VestingTimelinePoint[]
  segments: SegmentInfo[]
  maxSupply: number
  customSegments?: string[]
  height?: number
  /** Data key of an emission (minted supply) series stacked on top. */
  emissionSeriesKey?: string
}

/**
 * The dithered twin of unlock-timeline-chart.tsx: circulating supply by
 * allocation over time, against the hard cap.
 *
 * Every series is drawn with `curve="step"`. This is not a style choice — a
 * vesting cliff releases its tokens on one day and nothing on the days before
 * it. Interpolated as a ramp, the chart would draw circulating supply that does
 * not exist, weeks before it unlocks.
 *
 * Emission is a concept, not an allocation, so it carries the emission taxonomy
 * colour AND a hatched fill: a texture, not a shade, so it stays tellable apart
 * without relying on colour. (Upstream's `strokeVariant="dashed"` is dead code —
 * registered by the series parts, never read by the painter.)
 */
export function UnlockTimelineChartDither({
  data,
  segments,
  maxSupply,
  customSegments = [],
  height = 350,
  emissionSeriesKey,
}: UnlockTimelineChartDitherProps) {
  const { resolvedTheme } = useTheme()

  const { config, seriesKeys } = useMemo(() => {
    const colors = chartRgbFor(segments.map((s) => s.segment_type))
    const cfg: ChartConfig = {}
    segments.forEach((seg, i) => {
      cfg[seg.label] = { label: seg.label, color: colors[i] }
    })
    if (emissionSeriesKey) {
      cfg[emissionSeriesKey] = {
        label: 'Emission',
        color: getDataRgb('emission'),
      }
    }
    // Stack order: allocations first, emission on top — minted supply sits
    // above what was already promised.
    const keys = segments.map((s) => s.label)
    if (emissionSeriesKey) keys.push(emissionSeriesKey)
    return { config: cfg, seriesKeys: keys }
    // resolvedTheme intentionally in deps to re-resolve on dark/light switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, emissionSeriesKey, resolvedTheme])

  return (
    <div className="space-y-3">
      <div style={{ height }}>
        <AreaChart
          data={data}
          config={config}
          stackType="stacked"
          margins={{ top: 10, right: 20, bottom: 22, left: 60 }}
        >
          <Grid />
          <XAxis
            dataKey={data[0]?.date ? 'date' : 'month'}
            tickFormatter={(v) => (typeof v === 'number' ? `M${v}` : String(v))}
          />
          <YAxis tickFormatter={(v) => formatCompactNumber(v)} />
          {segments.map((seg) => (
            <Area key={seg.label} dataKey={seg.label} curve="step" />
          ))}
          {emissionSeriesKey && (
            <Area dataKey={emissionSeriesKey} curve="step" variant="hatched" />
          )}
          <ReferenceLine
            y={maxSupply}
            label={`Max: ${formatCompactNumber(maxSupply)}`}
          />
          <UnlockTooltip
            data={data}
            seriesKeys={seriesKeys}
            maxSupply={maxSupply}
          />
        </AreaChart>
      </div>
      {customSegments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {customSegments.map((label) => (
            <Badge
              key={label}
              variant="outline"
              className="text-muted-foreground text-xs"
            >
              {label}: manual schedule, not plotted
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

/** Ours, on the kit's DOM layer: the kit's own tooltip cannot show the stack
 *  total, which is the number that says whether the cap is being approached. */
function UnlockTooltip({
  data,
  seriesKeys,
  maxSupply,
}: {
  data: VestingTimelinePoint[]
  seriesKeys: string[]
  maxSupply: number
}) {
  const ctx = useChart()
  const common = useCommonChart()

  const index = ctx.hoverIndex
  if (!ctx.ready || index === null) return null
  const point = data[index] as unknown as Record<string, unknown> | undefined
  if (!point) return null

  const valueOf = (key: string) => {
    const v = point[key]
    return typeof v === 'number' ? v : 0
  }
  const total = seriesKeys.reduce((sum, key) => sum + valueOf(key), 0)
  const heading =
    typeof point.date === 'string' ? point.date : `Month ${point.month}`

  return (
    <div
      className="pointer-events-none absolute z-10 max-w-64 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground text-sm shadow-lg"
      style={{ left: common.tooltipLeft, top: 8 }}
    >
      <p className="mb-1 font-medium">{heading}</p>
      <p className="mb-2 text-muted-foreground text-xs">
        Total: {formatCompactNumber(total)} (
        {maxSupply > 0 ? ((total / maxSupply) * 100).toFixed(1) : '0.0'}%)
      </p>
      {/* Reversed: the top of the stack reads first, as it does on the chart. */}
      {[...seriesKeys]
        .reverse()
        .filter((key) => valueOf(key) > 0)
        .map((key) => (
          <div
            key={key}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: rgb(ctx.seedOf(key).fill) }}
              />
              <span className="max-w-32 truncate">
                {ctx.config[key]?.label ?? key}
              </span>
            </div>
            <span className="font-mono">
              {formatCompactNumber(valueOf(key))}
            </span>
          </div>
        ))}
    </div>
  )
}

UnlockTooltip.chartLayer = 'dom' as const
