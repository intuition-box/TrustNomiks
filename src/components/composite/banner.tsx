'use client'

import Link from 'next/link'
import {
  ArrowRight,
  Info,
  Sparkles,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type BannerKind = 'info' | 'milestone' | 'warning'

interface BannerProps {
  kind: BannerKind
  title: string
  /** Plain text by contract (rendered as text, never HTML). */
  body?: string | null
  href?: string | null
  /** Custom trailing action (e.g. a CTA button); rendered before dismiss. */
  action?: React.ReactNode
  /** Icon override for special slots (e.g. the read-only wallet strip). */
  icon?: LucideIcon
  onDismiss?: () => void
  className?: string
}

const KIND_STYLE: Record<BannerKind, { icon: LucideIcon; accentVar: string }> =
  {
    info: { icon: Info, accentVar: '--info' },
    milestone: { icon: Sparkles, accentVar: '--primary' },
    warning: { icon: TriangleAlert, accentVar: '--warning' },
  }

/**
 * The shell's announcement strip: color + icon carry the kind (never color
 * alone), copy stays plain text, one quiet line under the top bar.
 */
export function Banner({
  kind,
  title,
  body,
  href,
  action,
  icon,
  onDismiss,
  className,
}: BannerProps) {
  const style = KIND_STYLE[kind]
  const IconCmp = icon ?? style.icon
  const accent = `hsl(var(${style.accentVar}))`
  const isExternal = href?.startsWith('http')

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-3 border-b bg-surface-2 px-4 py-2.5 sm:px-6 lg:px-8',
        className,
      )}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{
          backgroundColor: `color-mix(in oklab, ${accent} 15%, transparent)`,
          color: accent,
        }}
      >
        <IconCmp className="h-3.5 w-3.5" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{title}</span>
        {body && <span className="text-muted-foreground"> · {body}</span>}
      </p>
      {href &&
        (isExternal ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm text-primary hover:underline"
          >
            Learn more
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-primary hover:underline"
          >
            Learn more
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ))}
      {action}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss announcement: ${title}`}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
