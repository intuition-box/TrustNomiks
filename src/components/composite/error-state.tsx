'use client'

import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ErrorStateProps {
  title?: string
  /** plain-language explanation; never a raw error.message */
  message?: React.ReactNode
  /** short technical reference (Next.js error digest) for support */
  digest?: string
  onRetry?: () => void
  retryLabel?: string
  homeHref?: string
  /** page = full-screen boundary; pane = inside a card/section */
  variant?: 'page' | 'pane'
  className?: string
}

/**
 * The error contract (docs/redesign/08 §1 + §11): a fractured-edge graph motif,
 * plain copy, a way forward. Raw error messages never reach this component.
 */
export function ErrorState({
  title = 'Something broke on our side',
  message = 'Your data is safe. Retry, or come back in a moment.',
  digest,
  onRetry,
  retryLabel = 'Try again',
  homeHref,
  variant = 'pane',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-surface-1 px-6 text-center',
        variant === 'page' ? 'min-h-[60vh] py-16' : 'py-12',
        className,
      )}
    >
      <FracturedEdge />
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {message}
        </p>
      </div>
      {(onRetry || homeHref) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button onClick={onRetry} variant="default" size="sm">
              <RotateCcw className="h-4 w-4" aria-hidden />
              {retryLabel}
            </Button>
          )}
          {homeHref && (
            <Button asChild variant="outline" size="sm">
              <Link href={homeHref}>Go to dashboard</Link>
            </Button>
          )}
        </div>
      )}
      {digest && (
        <p className="font-mono text-xs text-faint-foreground">ref: {digest}</p>
      )}
    </div>
  )
}

/** Two nodes, one broken edge: the graph motif for "a connection failed". */
function FracturedEdge() {
  return (
    <svg
      width={96}
      height={56}
      viewBox="0 0 96 56"
      aria-hidden
      className="opacity-80"
    >
      <line
        x1={22}
        y1={28}
        x2={40}
        y2={28}
        stroke="hsl(var(--graph-edge))"
        strokeWidth={1.5}
      />
      <line
        x1={56}
        y1={28}
        x2={74}
        y2={28}
        stroke="hsl(var(--graph-edge))"
        strokeWidth={1.5}
      />
      {/* the break */}
      <path
        d="M44 22 L48 28 L44 34"
        fill="none"
        stroke="hsl(var(--destructive))"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M52 22 L48 28 L52 34"
        fill="none"
        stroke="hsl(var(--destructive))"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle
        cx={16}
        cy={28}
        r={5.5}
        fill="none"
        stroke="hsl(var(--data-hub))"
        strokeWidth={2}
      />
      <circle cx={16} cy={28} r={1.8} fill="hsl(var(--data-hub))" />
      <circle
        cx={80}
        cy={28}
        r={4.5}
        fill="hsl(var(--data-token))"
        opacity={0.9}
      />
    </svg>
  )
}
