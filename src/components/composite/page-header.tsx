import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: React.ReactNode
  /** one line stating the screen's job, in the user's vocabulary */
  description?: React.ReactNode
  /** the screen's single primary action (plus quiet secondaries) */
  actions?: React.ReactNode
  backHref?: string
  backLabel?: string
  /** small chips/meta row under the description (counts, status) */
  meta?: React.ReactNode
  className?: string
}

/**
 * Band ① of the Observatory grammar (docs/redesign/08 §1): identify the screen.
 * One h1, one job line, one primary action. No gradient banners.
 */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = 'Back',
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('space-y-1.5', className)}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div>}
    </header>
  )
}
