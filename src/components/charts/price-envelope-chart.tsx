'use client'

import {
  Area,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EnvelopePoint } from '@/lib/tokenomics'

interface PriceEnvelopeChartProps {
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

const BANDS = [
  { key: 'p05p95', label: 'p5 to p95', opacity: 0.1 },
  { key: 'p10p90', label: 'p10 to p90', opacity: 0.14 },
  { key: 'p20p80', label: 'p20 to p80', opacity: 0.2 },
  { key: 'p35p65', label: 'p35 to p65', opacity: 0.28 },
] as const

/**
 * Monte-Carlo price envelope: nested percentile bands around the median
 * path. Bands share one hue at increasing opacity (they are one concept,
 * "simulated dispersion"); the tooltip names every band, so meaning never
 * rides on color alone.
 */
export function PriceEnvelopeChart({
  envelope,
  initialPriceUsd,
  height = 280,
}: PriceEnvelopeChartProps) {
  const data = envelope.map((point) => ({
    ...point,
    p05p95: [point.p05, point.p95],
    p10p90: [point.p10, point.p90],
    p20p80: [point.p20, point.p80],
    p35p65: [point.p35, point.p65],
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
      >
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          tickFormatter={(day: number) => `M${Math.floor(day / 30)}`}
        />
        <YAxis
          tickFormatter={(v: number) => `$${formatPrice(v)}`}
          tick={{ fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={64}
        />
        <Tooltip
          wrapperStyle={{
            outline: 'none',
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
          }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const point = payload[0].payload as EnvelopePoint
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
                  Month {Math.floor(point.day / 30)}, day {point.day}
                </p>
                <div className="space-y-0.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">Median</span>
                    <span className="font-mono">
                      ${formatPrice(point.median)}
                    </span>
                  </div>
                  {(
                    [
                      ['p5 to p95', point.p05, point.p95],
                      ['p20 to p80', point.p20, point.p80],
                    ] as const
                  ).map(([label, low, high]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3"
                    >
                      <span>{label}</span>
                      <span className="font-mono">
                        ${formatPrice(low)} to ${formatPrice(high)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }}
        />
        <ReferenceLine
          y={initialPriceUsd}
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="4 4"
          strokeOpacity={0.5}
          label={{
            value: `Start: $${formatPrice(initialPriceUsd)}`,
            position: 'right',
            fill: 'hsl(var(--muted-foreground))',
            fontSize: 10,
          }}
        />
        {BANDS.map((band) => (
          <Area
            key={band.key}
            dataKey={band.key}
            stroke="none"
            fill="hsl(var(--primary))"
            fillOpacity={band.opacity}
            isAnimationActive={false}
          />
        ))}
        <Line
          dataKey="median"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
