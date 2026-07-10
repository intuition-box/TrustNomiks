'use client'

import Link from 'next/link'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InsightCardProps {
  title: string
  body: React.ReactNode
  icon: LucideIcon
  /** taxonomy accent CSS var name, e.g. "--data-vesting" */
  accentVar: string
  href?: string
  className?: string
}

/**
 * One sentence the platform learned from its data: icon chip in the concept's
 * color, a headline fact, a quiet supporting line. Link optional.
 */
export function InsightCard({
  title,
  body,
  icon: Icon,
  accentVar,
  href,
  className,
}: InsightCardProps) {
  const accent = `hsl(var(${accentVar}))`
  const content = (
    <>
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{
          backgroundColor: `color-mix(in oklab, ${accent} 14%, transparent)`,
          color: accent,
        }}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {body}
        </span>
      </span>
      {href && (
        <ArrowRight
          className="mt-1 h-3.5 w-3.5 shrink-0 text-faint-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      )}
    </>
  )

  const base = cn(
    'flex items-start gap-3 rounded-xl border bg-surface-1 p-4',
    href && 'group transition-colors hover:bg-surface-2',
    className,
  )

  return href ? (
    <Link href={href} className={base}>
      {content}
    </Link>
  ) : (
    <div className={base}>{content}</div>
  )
}
