'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

interface TierEmblemProps {
  /** 0 = Observer … 4 = Architect */
  level: number
  /** Rendered square size in px. */
  size?: number
  /** 0..1 progress toward the next tier, drawn as a ring around the emblem. */
  progress?: number
  className?: string
}

/**
 * The five contribution-tier emblems, drawn in the graph language: the
 * constellation grows with the tier (a lone observer node → the full
 * observatory). Brand gradient on the strokes; optional progress ring
 * toward the next tier.
 */
export function TierEmblem({
  level,
  size = 48,
  progress,
  className,
}: TierEmblemProps) {
  const gradId = useId()
  const c = 24 // viewBox center
  const grad = `url(#${gradId})`

  // Satellites per level: angles on a ring around the hub
  const SATS = [0, 1, 3, 5, 6][Math.min(Math.max(level, 0), 4)]
  const ringR = 13
  const satellites = Array.from({ length: SATS }, (_, i) => {
    const a = (i / SATS) * Math.PI * 2 - Math.PI / 2
    return { x: c + ringR * Math.cos(a), y: c + ringR * Math.sin(a) }
  })

  // Progress ring geometry (drawn just inside the viewBox edge)
  const pr = 22
  const circumference = 2 * Math.PI * pr
  const clamped =
    progress === undefined ? undefined : Math.min(1, Math.max(0, progress))

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="0"
          y1="48"
          x2="48"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--secondary))" />
        </linearGradient>
      </defs>

      {clamped !== undefined && (
        <>
          <circle
            cx={c}
            cy={c}
            r={pr}
            fill="none"
            stroke="hsl(var(--surface-2))"
            strokeWidth="2"
          />
          <circle
            cx={c}
            cy={c}
            r={pr}
            fill="none"
            stroke={grad}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped)}
            transform={`rotate(-90 ${c} ${c})`}
          />
        </>
      )}

      {/* edges hub → satellites */}
      {satellites.map((s, i) => (
        <line
          key={`e${i}`}
          x1={c}
          y1={c}
          x2={s.x}
          y2={s.y}
          stroke={grad}
          strokeWidth="1.1"
          opacity="0.45"
        />
      ))}

      {/* Architect: an outer orbit binding the constellation together */}
      {level >= 4 && (
        <circle
          cx={c}
          cy={c}
          r={ringR}
          fill="none"
          stroke={grad}
          strokeWidth="1"
          opacity="0.5"
        />
      )}

      {/* hub: hollow for the Observer (watching), filled once contributing */}
      {level === 0 ? (
        <circle
          cx={c}
          cy={c}
          r="5"
          fill="none"
          stroke={grad}
          strokeWidth="2.4"
        />
      ) : (
        <>
          <circle
            cx={c}
            cy={c}
            r="5.5"
            fill="none"
            stroke={grad}
            strokeWidth="1.6"
          />
          <circle cx={c} cy={c} r="2.6" fill={grad} />
        </>
      )}

      {satellites.map((s, i) => (
        <circle key={`s${i}`} cx={s.x} cy={s.y} r="2.2" fill={grad} />
      ))}
    </svg>
  )
}
