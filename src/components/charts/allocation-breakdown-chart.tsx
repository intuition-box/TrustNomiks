'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { getSegmentChartColor } from '@/lib/utils/chart-colors'
import { formatSegmentTypeLabel } from '@/types/form'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'

interface Segment {
  label: string
  segment_type: string
  percentage: number
  token_amount: string | null
}

interface AllocationBreakdownChartProps {
  segments: Segment[]
  height?: number
}

const MAX_LABEL_CHARS = 15

function CustomYAxisTick({
  x,
  y,
  payload,
}: {
  x?: number
  y?: number
  payload?: { value: string }
}) {
  if (!payload) return null
  const label =
    payload.value.length > MAX_LABEL_CHARS
      ? payload.value.slice(0, MAX_LABEL_CHARS) + '…'
      : payload.value
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fill="hsl(var(--foreground))" fontSize={12}>
        {label}
      </text>
    </g>
  )
}

function CustomXAxisTick({
  x,
  y,
  payload,
}: {
  x?: number
  y?: number
  payload?: { value: number }
}) {
  if (!payload) return null
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fill="hsl(var(--muted-foreground))"
        fontSize={12}
      >
        {payload.value}%
      </text>
    </g>
  )
}

export function AllocationBreakdownChart({
  segments,
  height = 300,
}: AllocationBreakdownChartProps) {
  const sorted = [...segments].sort((a, b) => b.percentage - a.percentage)

  const data = sorted.map((seg) => ({
    name: seg.label,
    segment_type: seg.segment_type,
    percentage: seg.percentage,
    token_amount: seg.token_amount,
  }))

  const longestLabel = Math.max(...data.map((d) => Math.min(d.name.length, MAX_LABEL_CHARS)))
  const yAxisWidth = Math.max(48, longestLabel * 7 + 12)

  return (
    <div className="[&_svg:focus]:outline-none [&_svg_*:focus]:outline-none">
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={<CustomXAxisTick />}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={yAxisWidth}
          tick={<CustomYAxisTick />}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          wrapperStyle={{ outline: 'none', background: 'transparent', border: 'none', boxShadow: 'none' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload
            return (
              <div
                className="rounded-lg px-3 py-2 text-sm shadow-lg"
                style={{
                  backgroundColor: 'hsl(var(--popover))',
                  color: 'hsl(var(--popover-foreground))',
                  border: '1px solid hsl(var(--border))',
                }}
              >
                <p className="font-medium">{d.name}</p>
                <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {formatSegmentTypeLabel(d.segment_type)}
                </p>
                <p className="mt-1 font-mono">{d.percentage.toFixed(1)}%</p>
                {d.token_amount && (
                  <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                    {formatCompactNumber(Number(d.token_amount.toString().replace(/,/g, '')))} tokens
                  </p>
                )}
              </div>
            )
          }}
        />
        <Bar dataKey="percentage" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={getSegmentChartColor(entry.segment_type, index)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  )
}
