'use client'

/**
 * ADDED (fork) — not upstream. A horizontal threshold drawn across the plot:
 * the hard cap a supply curve must never cross, the market depth a sell wall
 * would blow through, the price a token launched at. Without it those charts
 * are just shapes; the line is what makes them a judgement.
 *
 * Pure SVG on the front layer, reading the same `ctx.y` scale the canvas
 * paints against — the pattern <Grid /> already uses, so it stays in register
 * with the dithered fill.
 */

import { useChartPart } from './chart-context'

export type ReferenceLineProps = {
  /** Where to draw it, in data units. */
  y: number
  label?: string
  /** Defaults to the muted border tone; pass a token-derived colour to carry
   *  meaning (e.g. `hsl(var(--warning))` for a threshold being crossed). */
  stroke?: string
  strokeDasharray?: string
  labelPosition?: 'left' | 'right'
}

export function ReferenceLine({
  y,
  label,
  stroke,
  strokeDasharray = '4 4',
  labelPosition = 'right',
}: ReferenceLineProps) {
  const ctx = useChartPart('ReferenceLine')
  if (!ctx.ready) return null

  const py = ctx.y(y)
  // A threshold outside the visible domain is a lie by omission — better to
  // drop it than to pin it to an edge and imply the series is touching it.
  const [lo, hi] = ctx.y.range()
  if (py < Math.min(lo, hi) - 0.5 || py > Math.max(lo, hi) + 0.5) return null

  const { width } = ctx.plot
  const atRight = labelPosition === 'right'

  return (
    <g>
      <line
        x1={0}
        x2={width}
        y1={py}
        y2={py}
        strokeDasharray={strokeDasharray}
        className={stroke ? undefined : 'stroke-muted-foreground'}
        stroke={stroke}
        strokeWidth={1}
      />
      {label && (
        <text
          x={atRight ? width - 4 : 4}
          y={py - 4}
          textAnchor={atRight ? 'end' : 'start'}
          className="fill-muted-foreground font-mono text-[10px]"
        >
          {label}
        </text>
      )}
    </g>
  )
}
