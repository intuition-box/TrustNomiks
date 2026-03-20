'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from 'recharts'
import { getSegmentChartColor } from '@/lib/utils/chart-colors'
import { formatSegmentTypeLabel } from '@/types/form'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'

interface Segment {
  label: string
  segment_type: string
  percentage: number
  token_amount: string | null
}

interface AllocationDonutChartProps {
  segments: Segment[]
  maxSupply: string | null
  size?: 'sm' | 'lg'
}

const SIZES = {
  sm: { width: 160, height: 160, outerRadius: 65, innerRadius: 42 },
  lg: { width: 280, height: 280, outerRadius: 120, innerRadius: 75 },
}

export function AllocationDonutChart({
  segments,
  maxSupply,
  size = 'sm',
}: AllocationDonutChartProps) {
  const { width, height, outerRadius, innerRadius } = SIZES[size]

  const data = segments.map((seg) => ({
    name: seg.label,
    segment_type: seg.segment_type,
    value: seg.percentage,
    token_amount: seg.token_amount,
  }))

  const formattedSupply = maxSupply
    ? formatCompactNumber(Number(maxSupply.toString().replace(/,/g, '')))
    : null

  return (
    <ResponsiveContainer width={width} height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          dataKey="value"
          strokeWidth={2}
          stroke="hsl(var(--background))"
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={getSegmentChartColor(entry.segment_type, index)}
            />
          ))}
          {formattedSupply && (
            <Label
              position="center"
              content={() => (
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-foreground"
                >
                  <tspan x="50%" dy="-0.5em" fontSize={size === 'sm' ? 11 : 14} fontWeight={600}>
                    {formattedSupply}
                  </tspan>
                  <tspan x="50%" dy="1.4em" fontSize={size === 'sm' ? 9 : 11} className="fill-muted-foreground">
                    Max Supply
                  </tspan>
                </text>
              )}
            />
          )}
        </Pie>
        {size === 'lg' && (
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
                  <p className="mt-1 font-mono">{d.value.toFixed(1)}%</p>
                  {d.token_amount && (
                    <p className="text-xs" style={{ color: 'hsl(var(--muted-foreground))' }}>
                      {formatCompactNumber(Number(d.token_amount.toString().replace(/,/g, '')))} tokens
                    </p>
                  )}
                </div>
              )
            }}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  )
}
