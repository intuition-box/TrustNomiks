'use client'

import { cn } from '@/lib/utils'
import { NODE_FAMILY_MAP, type NodeType } from '@/lib/knowledge-graph/graph-types'
import { FAMILY_GLYPH, DATA_TEXT_CLASS, type GlyphShape } from '@/lib/design/tokens'

interface NodeGlyphProps {
  type: NodeType
  /** px size of the glyph box */
  size?: number
  /** add a luminous halo (the "data glows" cue) */
  withGlow?: boolean
  className?: string
  'aria-hidden'?: boolean
}

/**
 * The taxonomy glyph: ◎ hub (ring) · ● atom (circle) · ◆ triple (diamond) · ▪ source (square).
 * Color comes from the data-* token; shape comes from the node family — so meaning
 * survives color-blindness and grayscale (AA non-color cue).
 */
export function NodeGlyph({
  type,
  size = 12,
  withGlow = false,
  className,
  ...rest
}: NodeGlyphProps) {
  const family = NODE_FAMILY_MAP[type]
  const shape = FAMILY_GLYPH[family]
  const colorClass = DATA_TEXT_CLASS[type]
  const s = size
  const c = s / 2

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', colorClass, className)}
      style={{ width: s, height: s }}
      {...rest}
    >
      <svg
        width={s}
        height={s}
        viewBox={`0 0 ${s} ${s}`}
        fill="none"
        style={withGlow ? { filter: 'drop-shadow(0 0 4px currentColor)' } : undefined}
      >
        {renderShape(shape, c, s)}
      </svg>
    </span>
  )
}

function renderShape(shape: GlyphShape, c: number, s: number) {
  const r = s * 0.36
  switch (shape) {
    case 'ring':
      return <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth={s * 0.16} />
    case 'circle':
      return <circle cx={c} cy={c} r={r} fill="currentColor" />
    case 'diamond':
      return (
        <rect
          x={c - r}
          y={c - r}
          width={r * 2}
          height={r * 2}
          fill="currentColor"
          transform={`rotate(45 ${c} ${c})`}
          rx={s * 0.06}
        />
      )
    case 'square':
      return <rect x={c - r} y={c - r} width={r * 2} height={r * 2} fill="currentColor" rx={s * 0.12} />
  }
}
