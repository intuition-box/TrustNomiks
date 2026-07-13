'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { backingSize, paintRow } from '@/components/dither-kit/dither-paint'
import type { AreaVariant } from '@/components/dither-kit/chart-context'
import type { Rgb } from '@/lib/design/color-space'
import { lighten } from '@/lib/design/color-space'

export interface BarRowSegment {
  key: string
  value: number
  color: Rgb
  variant?: AreaVariant
}

interface DitherBarRowProps {
  segments: BarRowSegment[]
  /** The value the row is full at. Segments beyond it are clipped. */
  total: number
  height?: number
  /** Index of the segment to lift; the rest dim. */
  activeIndex?: number | null
  className?: string
}

/**
 * One horizontal, dithered, stacked proportion bar.
 *
 * The kit's bar engine only grows bars upward — it paints column by column, so
 * horizontal is not a layout flag away. This is the smallest thing that gives
 * us the other axis: a canvas over the kit's own {@link paintRow} dither, which
 * is why it reads as the same material as the charts around it rather than a
 * flat CSS div.
 *
 * It is the shared body of all three data-room bars: the allocation breakdown
 * (one row per segment), circulating-vs-locked, and the supply allocation
 * (one row, many segments).
 */
export function DitherBarRow({
  segments,
  total,
  height = 24,
  activeIndex = null,
  className,
}: DitherBarRowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()

  // The canvas is painted imperatively, so it must be repainted whenever the
  // data, the emphasis, the size or the theme-resolved colours change.
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!(canvas && wrap)) return

    const paint = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (w <= 0 || h <= 0) return
      const { cols, rows } = backingSize(w, h)
      canvas.width = cols
      canvas.height = rows
      const c = canvas.getContext('2d')
      if (!c) return
      c.clearRect(0, 0, cols, rows)
      if (total <= 0) return

      let cursor = 0
      segments.forEach((seg, i) => {
        const span = (Math.max(seg.value, 0) / total) * cols
        const left = cursor
        const right = Math.min(cols, cursor + span)
        cursor = right
        if (right - left < 0.5) return

        const seed = {
          fill: seg.color,
          line: lighten(seg.color, 0.45),
          star: lighten(seg.color, 0.68),
        }
        const dim = activeIndex !== null && activeIndex !== i ? 0.45 : 1
        for (let y = 0; y < rows; y++) {
          paintRow(c, y, left, right, seed, {
            variant: seg.variant ?? 'gradient',
            intensity: activeIndex === i ? 0.6 : 0,
            dim,
            stacked: true,
          })
        }
      })
    }

    paint()
    const ro = new ResizeObserver(paint)
    ro.observe(wrap)
    return () => ro.disconnect()
    // resolvedTheme intentionally in deps: the colours are resolved by the
    // caller from CSS tokens, so a theme flip hands us new ones.
  }, [segments, total, activeIndex, resolvedTheme])

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ height, position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full rounded-md"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  )
}
