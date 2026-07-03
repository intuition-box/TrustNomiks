'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface HashTextProps {
  value: string
  /** chars kept before the ellipsis (after any 0x prefix) */
  prefix?: number
  /** chars kept after the ellipsis */
  suffix?: number
  /** explorer / external link for the value */
  href?: string
  withCopy?: boolean
  className?: string
}

/**
 * Mono, middle-truncated rendering for addresses, tx hashes and term ids,
 * with one-tap copy. The full value stays available to screen readers and
 * on hover via title.
 */
export function HashText({
  value,
  prefix = 6,
  suffix = 4,
  href,
  withCopy = true,
  className,
}: HashTextProps) {
  const [copied, setCopied] = useState(false)

  const truncated =
    value.length > prefix + suffix + 3
      ? `${value.slice(0, prefix)}…${value.slice(-suffix)}`
      : value

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable (permissions/insecure context): leave silently
    }
  }

  return (
    <span className={cn('inline-flex items-center gap-1 align-middle', className)}>
      <span className="font-mono text-sm" title={value} aria-label={value}>
        {truncated}
      </span>
      {withCopy && (
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
          className="rounded-xs p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in explorer"
          className="rounded-xs p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </span>
  )
}
