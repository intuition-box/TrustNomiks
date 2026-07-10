'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'

interface LogoMarkProps {
  /** Rendered square size in px. */
  size?: number
  className?: string
}

/**
 * The TrustNomiks mark: two atoms joined by a claim edge, drawn on the brand
 * gradient (primary → secondary, theme-aware). SVG reconstruction of the
 * raster logo; `public/trustnomiks_logo_final.png` remains as the fallback
 * asset for contexts that need a bitmap.
 */
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  const gradId = useId()
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
      </defs>
      <circle
        cx="10"
        cy="23.5"
        r="4.4"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="3.4"
      />
      <path
        d="M10 19.1 C10 13.4 14.6 10.4 20.4 10.4"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle
        cx="24"
        cy="10.4"
        r="3.6"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="3.2"
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
