'use client'

import { useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface TokenFaceProps {
  name: string
  ticker: string
  /** CoinGecko logo URL (tokens.coingecko_image); identicon fallback when absent or broken. */
  imageUrl?: string | null
  /** Rendered square size in px. */
  size?: number
  className?: string
}

/** Deterministic seed so a token's identicon is stable across sessions. */
function hashSeed(input: string): number {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * The face of a token everywhere it appears in a list: its logo when we have
 * one, otherwise a deterministic mini-constellation identicon seeded by the
 * ticker. The identicon stays in the token family (violet, `--data-token`)
 * with the ticker initial as the non-color cue, so color = concept holds.
 */
export function TokenFace({
  name,
  ticker,
  imageUrl,
  size = 28,
  className,
}: TokenFaceProps) {
  const [broken, setBroken] = useState(false)

  if (imageUrl && !broken) {
    return (
      <Image
        src={imageUrl}
        alt=""
        aria-hidden
        width={size}
        height={size}
        className={cn(
          'shrink-0 rounded-full bg-surface-2 object-cover',
          className,
        )}
        onError={() => setBroken(true)}
      />
    )
  }

  const seed = hashSeed(ticker || name)
  const c = size / 2
  // Two satellite atoms on the rim, angles derived from the seed
  const a1 = ((seed % 360) * Math.PI) / 180
  const a2 = (((seed >> 5) % 360) * Math.PI) / 180
  const rim = c - size * 0.12
  const dot = (a: number) => ({
    x: c + rim * Math.cos(a),
    y: c + rim * Math.sin(a),
  })
  const d1 = dot(a1)
  const d2 = dot(a2)
  const initial = (ticker || name || '?').charAt(0).toUpperCase()

  return (
    <span
      className={cn('inline-flex shrink-0', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={c}
          cy={c}
          r={c - 0.5}
          fill="hsl(var(--data-token) / 0.12)"
          stroke="hsl(var(--data-token) / 0.35)"
          strokeWidth="1"
        />
        <circle
          cx={d1.x}
          cy={d1.y}
          r={size * 0.07}
          fill="hsl(var(--data-token) / 0.9)"
        />
        <circle
          cx={d2.x}
          cy={d2.y}
          r={size * 0.055}
          fill="hsl(var(--data-token) / 0.55)"
        />
        <text
          x={c}
          y={c}
          textAnchor="middle"
          dominantBaseline="central"
          fill="hsl(var(--data-token))"
          fontFamily="var(--font-mono)"
          fontWeight="600"
          fontSize={size * 0.46}
        >
          {initial}
        </text>
      </svg>
    </span>
  )
}
