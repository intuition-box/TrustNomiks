'use client'

import { useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { DitherBarRow } from '@/components/charts/dither-bar-row'
import { chartRgbFor } from '@/lib/design/tokens'
import { formatSegmentTypeLabel } from '@/types/form'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'

interface Segment {
  label: string
  segment_type: string
  percentage: number
  token_amount: string | null
}

interface AllocationBreakdownChartDitherProps {
  segments: Segment[]
  height?: number
}

const MAX_LABEL_CHARS = 15
const ROW_HEIGHT = 20

/**
 * The dithered twin of allocation-breakdown-chart.tsx: one horizontal bar per
 * allocation, sorted by share.
 *
 * The kit has no horizontal bar — its painter only grows bars upward — so this
 * composes {@link DitherBarRow} per segment rather than going through the
 * cartesian root. The axis is a fixed 0-100%: these are shares of the supply,
 * and a share only means something against the whole.
 */
export function AllocationBreakdownChartDither({
  segments,
  height = 300,
}: AllocationBreakdownChartDitherProps) {
  const { resolvedTheme } = useTheme()
  const [hovered, setHovered] = useState<number | null>(null)

  // Colours are assigned in the ORIGINAL list order (canonical), so a segment
  // keeps its colour across every chart whatever each chart's sort.
  const rows = useMemo(() => {
    const colors = chartRgbFor(segments.map((s) => s.segment_type))
    return segments
      .map((seg, i) => ({ ...seg, color: colors[i] }))
      .sort((a, b) => b.percentage - a.percentage)
    // resolvedTheme intentionally in deps to re-resolve on dark/light switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, resolvedTheme])

  const truncate = (label: string) =>
    label.length > MAX_LABEL_CHARS
      ? `${label.slice(0, MAX_LABEL_CHARS)}…`
      : label

  const longest = Math.max(
    ...rows.map((r) => Math.min(r.label.length, MAX_LABEL_CHARS)),
    4,
  )
  const labelWidth = Math.max(48, longest * 7 + 12)

  return (
    <div className="space-y-1.5" style={{ minHeight: height }}>
      {rows.map((row, i) => (
        <div
          key={row.label}
          className="relative flex items-center gap-3"
          onPointerEnter={() => setHovered(i)}
          onPointerLeave={() => setHovered(null)}
        >
          <span
            className="shrink-0 truncate text-right text-foreground text-xs"
            style={{ width: labelWidth }}
            title={row.label}
          >
            {truncate(row.label)}
          </span>
          <div className="relative flex-1">
            <DitherBarRow
              segments={[
                { key: row.label, value: row.percentage, color: row.color },
              ]}
              total={100}
              height={ROW_HEIGHT}
              activeIndex={0}
            />
            {hovered === i && (
              <div className="pointer-events-none absolute bottom-full left-2 z-10 mb-1 w-max max-w-64 rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground text-sm shadow-lg">
                <p className="font-medium">{row.label}</p>
                <p className="text-muted-foreground text-xs">
                  {formatSegmentTypeLabel(row.segment_type)}
                </p>
                <p className="mt-1 font-mono">{row.percentage.toFixed(1)}%</p>
                {row.token_amount && (
                  <p className="text-muted-foreground text-xs">
                    {formatCompactNumber(
                      Number(row.token_amount.toString().replace(/,/g, '')),
                    )}{' '}
                    tokens
                  </p>
                )}
              </div>
            )}
          </div>
          <span className="w-12 shrink-0 text-right font-mono text-muted-foreground text-xs tabular-nums">
            {row.percentage.toFixed(1)}%
          </span>
        </div>
      ))}
      {/* The axis is the whole point: a share reads against the supply. Ticks
          are placed at their true fraction of the track and centred on it —
          spacing them evenly with justify-between would put 25% wherever the
          label widths happened to leave room, which is an axis that lies. */}
      <div
        className="relative h-4"
        style={{ marginLeft: labelWidth + 12, marginRight: 48 + 12 }}
      >
        {[0, 25, 50, 75, 100].map((tick) => (
          <span
            key={tick}
            className="-translate-x-1/2 absolute top-0 font-mono text-muted-foreground text-xs"
            style={{ left: `${tick}%` }}
          >
            {tick}%
          </span>
        ))}
      </div>
    </div>
  )
}
