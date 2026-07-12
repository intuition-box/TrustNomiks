'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

interface LogoMarkProps {
  /** Rendered square size in px. */
  size?: number
  className?: string
}

/**
 * The TrustNomiks mark, "Orbit": hub + core (the graph root) with a data
 * satellite in orbit, drawn on the brand gradient (primary → secondary,
 * theme-aware). The orbit ring is masked out behind the satellite so the
 * mark stays transparent and works on any surface (background, surface-1…).
 */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  const gradId = useId()
  const maskId = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="0"
          y1="32"
          x2="32"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="hsl(var(--primary))" />
          <stop offset="1" stopColor="hsl(var(--secondary))" />
        </linearGradient>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect width="32" height="32" fill="white" />
          <circle cx="24.6" cy="9.6" r="4" fill="black" />
        </mask>
      </defs>
      <circle
        cx="16"
        cy="16"
        r="10.5"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2.8"
        mask={`url(#${maskId})`}
      />
      <circle cx="16" cy="16" r="3.4" fill={`url(#${gradId})`} />
      <circle
        cx="24.6"
        cy="9.6"
        r="2.8"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="2.4"
      />
    </svg>
  )
}

interface LogoProps {
  /** Mark size in px; the wordmark scales via wordmarkClassName. */
  size?: number
  withWordmark?: boolean
  wordmarkClassName?: string
  className?: string
}

/** Mark + "TrustNomiks" wordmark (Trust = primary, Nomiks = brand gradient). */
export function Logo({
  size = 26,
  withWordmark = true,
  wordmarkClassName,
  className,
}: LogoProps) {
  return (
    <span
      className={cn('inline-flex select-none items-center gap-2', className)}
    >
      <LogoMark size={size} />
      {withWordmark && (
        <span
          className={cn(
            'text-lg font-semibold leading-none tracking-tight',
            wordmarkClassName,
          )}
        >
          <span className="text-primary">Trust</span>
          <span className="text-gradient-brand">Nomiks</span>
        </span>
      )}
    </span>
  )
}
