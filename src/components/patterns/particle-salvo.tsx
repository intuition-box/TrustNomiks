'use client'

import { cn } from '@/lib/utils'

interface ParticleSalvoProps {
  /** number of particles in the burst */
  count?: number
  className?: string
}

// Taxonomy hues carried by the burst — a validation is the graph celebrating
const SALVO_VARS = [
  '--data-token',
  '--data-allocation',
  '--data-vesting',
  '--data-source',
  '--data-hub',
  '--data-chain',
]

/** Deterministic pseudo-random (render-pure, SSR-stable). */
function prand(i: number, salt: number): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * One celebratory burst: taxonomy-colored particles fired from the center,
 * fading as they travel. Mount it at the moment worth celebrating (publish
 * complete, validation). Under prefers-reduced-motion the global kill-switch
 * jumps particles to their final (invisible) state: no motion, no residue.
 */
export function ParticleSalvo({ count = 32, className }: ParticleSalvoProps) {
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = prand(i, 1) * Math.PI * 2
    const dist = 80 + prand(i, 2) * 160
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      size: 4 + prand(i, 3) * 5,
      delay: prand(i, 4) * 150,
      cssVar: SALVO_VARS[i % SALVO_VARS.length],
    }
  })

  return (
    // The PARENT must be `relative overflow-hidden` and large enough for the
    // burst to breathe (a whole panel, not a one-line notice) — particles fly
    // up to ~240px from its center.
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 z-10', className)}
    >
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: `hsl(var(${p.cssVar}))`,
            boxShadow: `0 0 6px hsl(var(${p.cssVar}) / 0.8)`,
            ['--dx' as string]: `${p.dx}px`,
            ['--dy' as string]: `${p.dy}px`,
            animation: 'particle-burst 900ms var(--ease-out) both',
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  )
}
