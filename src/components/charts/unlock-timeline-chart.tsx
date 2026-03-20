'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { getSegmentChartColor } from '@/lib/utils/chart-colors'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'
import type { VestingTimelinePoint } from '@/lib/utils/vesting-timeline'
import { Badge } from '@/components/ui/badge'

interface SegmentInfo {
  label: string
  segment_type: string
}

interface UnlockTimelineChartProps {
  data: VestingTimelinePoint[]
  segments: SegmentInfo[]
  maxSupply: number
  customSegments?: string[]
  height?: number
}

export function UnlockTimelineChart({
  data,
  segments,
  maxSupply,
  customSegments = [],
  height = 350,
}: UnlockTimelineChartProps) {
  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
          <XAxis
            dataKey={data[0]?.date ? 'date' : 'month'}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tickFormatter={(v) => {
              if (typeof v === 'number') return `M${v}`
              return v
            }}
          />
          <YAxis
            tickFormatter={(v) => formatCompactNumber(v)}
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
            wrapperStyle={{ outline: 'none', background: 'transparent', border: 'none', boxShadow: 'none' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const total = payload.reduce(
                (sum, p) => sum + (typeof p.value === 'number' ? p.value : 0),
                0
              )
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
                  <p className="text-xs mb-2" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    Total: {formatCompactNumber(total)} ({((total / maxSupply) * 100).toFixed(1)}%)
                  </p>
                  {payload
                    .filter((p) => typeof p.value === 'number' && p.value > 0)
                    .reverse()
                    .map((p) => (
                      <div
                        key={p.dataKey as string}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="truncate max-w-32">{p.dataKey as string}</span>
                        </div>
                        <span className="font-mono">
                          {formatCompactNumber(p.value as number)}
                        </span>
                      </div>
                    ))}
                </div>
              )
            }}
          />
          <ReferenceLine
            y={maxSupply}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{
              value: `Max: ${formatCompactNumber(maxSupply)}`,
              position: 'right',
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 10,
            }}
          />
          {segments.map((seg) => (
            <Area
              key={seg.label}
              type="stepAfter"
              dataKey={seg.label}
              stackId="1"
              fill={getSegmentChartColor(seg.segment_type)}
              stroke={getSegmentChartColor(seg.segment_type)}
              fillOpacity={0.6}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      {customSegments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {customSegments.map((label) => (
            <Badge
              key={label}
              variant="outline"
              className="text-xs text-muted-foreground"
            >
              {label} — manual schedule, not plotted
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
