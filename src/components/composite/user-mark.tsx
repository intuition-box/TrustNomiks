'use client'

import { cn } from '@/lib/utils'

interface UserMarkProps {
  /** Stable identity seed (user id). */
  seed: string
  /** Rendered square size in px. */
  size?: number
  className?: string
}

/** Deterministic hash so a contributor's mark is stable across sessions. */
function hashSeed(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * A contributor's mark: a tiny personal constellation seeded by the user id.
 * Brand primary only (people are not a data-taxonomy concept, so identity
 * varies by GEOMETRY, never by hue). Rounded-square tile so it can't be
 * mistaken for a TokenFace.
 */
export function UserMark({ seed, size = 28, className }: UserMarkProps) {
  const h = hashSeed(seed)
  const c = size / 2
  const r = size * 0.31
  // Three stars at seed-derived angles, plus the hub offset a touch
  const angles = [h % 360, (h >> 4) % 360, (h >> 9) % 360].map(
    (deg) => (deg * Math.PI) / 180,
  )
  const stars = angles.map((a, i) => ({
    x: c + r * (0.72 + 0.28 * ((h >> (i * 3)) % 2)) * Math.cos(a),
    y: c + r * (0.72 + 0.28 * ((h >> (i * 3 + 1)) % 2)) * Math.sin(a),
  }))
  const hub = {
    x: c + ((h % 5) - 2) * size * 0.02,
    y: c + (((h >> 3) % 5) - 2) * size * 0.02,
  }

  return (
    <span
      className={cn('inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect
          x="0.5"
          y="0.5"
          width={size - 1}
          height={size - 1}
          rx={size * 0.24}
          fill="hsl(var(--primary) / 0.1)"
          stroke="hsl(var(--primary) / 0.3)"
        />
        {stars.map((s, i) => (
          <line
            key={`e${i}`}
            x1={hub.x}
            y1={hub.y}
            x2={s.x}
            y2={s.y}
            stroke="hsl(var(--primary) / 0.4)"
            strokeWidth={Math.max(0.8, size * 0.03)}
          />
        ))}
        <circle
          cx={hub.x}
          cy={hub.y}
          r={size * 0.09}
          fill="hsl(var(--primary))"
        />
        {stars.map((s, i) => (
          <circle
            key={`s${i}`}
            cx={s.x}
            cy={s.y}
            r={size * (0.05 + 0.02 * (i % 2))}
            fill={`hsl(var(--primary) / ${0.55 + 0.15 * (i % 3)})`}
          />
        ))}
      </svg>
    </span>
  )
}
