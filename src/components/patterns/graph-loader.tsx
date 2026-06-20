'use client'

import { cn } from '@/lib/utils'

interface GraphLoaderProps {
  /** px size of the square canvas */
  size?: number
  label?: string
  className?: string
}

// Six satellites around a hub. Colors map to the data taxonomy.
const SATELLITES = [
  { angle: -90, color: '--data-token', delay: 0 },
  { angle: -30, color: '--data-allocation', delay: 0.12 },
  { angle: 30, color: '--data-vesting', delay: 0.24 },
  { angle: 90, color: '--data-emission', delay: 0.36 },
  { angle: 150, color: '--data-source', delay: 0.48 },
  { angle: 210, color: '--data-chain', delay: 0.6 },
]

/**
 * The signature loader: a mini-graph assembling from the hub outward.
 * Replaces bare spinners. Honors prefers-reduced-motion (globals.css freezes animation).
 */
export function GraphLoader({ size = 96, label, className }: GraphLoaderProps) {
  const c = size / 2
  const orbit = size * 0.34
  const hubR = size * 0.09
  const nodeR = size * 0.055

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)} role="status" aria-live="polite">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {SATELLITES.map((s, i) => {
          const rad = (s.angle * Math.PI) / 180
          const x = c + orbit * Math.cos(rad)
          const y = c + orbit * Math.sin(rad)
          const col = `hsl(var(${s.color}))`
          return (
            <g key={i}>
              <line
                x1={c}
                y1={c}
                x2={x}
                y2={y}
                stroke={col}
                strokeWidth={size * 0.012}
                opacity={0.28}
                style={{ animation: `graph-breathe 2.4s ease-in-out ${s.delay}s infinite` }}
              />
              <circle
                cx={x}
                cy={y}
                r={nodeR}
                fill={col}
                style={{
                  transformOrigin: `${x}px ${y}px`,
                  animation: `node-spawn 1.6s var(--ease-spring) ${s.delay}s infinite alternate`,
                }}
              />
            </g>
          )
        })}
        {/* hub */}
        <circle cx={c} cy={c} r={hubR} fill="none" stroke="hsl(var(--data-hub))" strokeWidth={size * 0.03} />
        <circle cx={c} cy={c} r={hubR * 0.35} fill="hsl(var(--data-hub))" />
      </svg>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  )
}
