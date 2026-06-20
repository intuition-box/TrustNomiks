'use client'

import * as React from 'react'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatTileProps {
  label: string
  value: React.ReactNode
  /** small caption under the value */
  hint?: React.ReactNode
  icon?: LucideIcon
  /** taxonomy accent CSS var name, e.g. "--data-token". Drives icon + glow tint. */
  accentVar?: string
  /** 0–100 progress; renders a thin meter under the value */
  progress?: number
  /** render the progress bar with the brand gradient (north-star tiles) */
  brandProgress?: boolean
  /** a short trend chip, e.g. "+12%" */
  delta?: string
  onClick?: () => void
  href?: string
  className?: string
}

/**
 * KPI tile (Tremor pattern on our tokens). Big tabular value + caption.
 * Optional accent tints the icon chip; optional progress meter for goal tiles.
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  accentVar = '--primary',
  progress,
  brandProgress = false,
  delta,
  onClick,
  href,
  className,
}: StatTileProps) {
  const accent = `hsl(var(${accentVar}))`
  const interactive = Boolean(onClick || href)

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon && (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{ backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="tabular text-3xl font-semibold leading-none tracking-tight">{value}</span>
        {delta && (
          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-[hsl(var(--success))]">
            <ArrowUpRight className="h-3 w-3" aria-hidden />
            {delta}
          </span>
        )}
      </div>
      {typeof progress === 'number' && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500', !brandProgress && 'bg-[var(--bar)]')}
            style={
              brandProgress
                ? { width: `${Math.min(100, progress)}%`, background: 'var(--gradient-brand)' }
                : ({ width: `${Math.min(100, progress)}%`, ['--bar' as string]: accent } as React.CSSProperties)
            }
          />
        </div>
      )}
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </>
  )

  const base = cn(
    'group rounded-xl border bg-surface-1 p-4 text-left transition-colors',
    interactive && 'hover:bg-surface-2 hover:border-border-strong focus-visible:border-border-strong',
    className,
  )

  if (href) {
    return (
      <a href={href} className={base}>
        {body}
      </a>
    )
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base}>
        {body}
      </button>
    )
  }
  return <div className={base}>{body}</div>
}
