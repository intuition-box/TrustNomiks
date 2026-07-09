'use client'

import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { StudioSectionKey } from '@/features/studio/studio-spine'
import { useTokenForm } from './token-form-context'

/**
 * Shared chrome for each studio section (header + score chip, and the
 * "not ready yet" gate). Stands in for the refactor plan's "FormSidebar":
 * the actual sidebar/progress role is already owned by the pre-existing
 * StudioSpine component (features/studio/studio-spine.tsx) — what's local
 * to each section here is this header and gate, not navigation.
 */
export function SectionHeader({
  accentVar,
  label,
  desc,
  liveScore,
  maxScore,
  saved,
}: {
  accentVar: string
  label: string
  desc: string
  liveScore: number
  maxScore: number
  saved: boolean
}) {
  const color = `hsl(var(${accentVar}))`
  return (
    <div className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <div>
          <h2
            className="inline text-xs font-bold uppercase tracking-widest"
            style={{ color }}
          >
            {label}
          </h2>
          <span className="ml-2 text-xs text-muted-foreground">{desc}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {saved && (
          <CheckCircle2
            className="h-3.5 w-3.5 opacity-70"
            style={{ color }}
            aria-hidden
          />
        )}
        <span
          className={cn(
            'tabular font-mono text-xs font-semibold',
            liveScore === 0 && maxScore > 0 && 'text-muted-foreground/40',
          )}
          style={liveScore > 0 ? { color } : undefined}
        >
          {maxScore > 0 ? `${liveScore} / ${maxScore} pts` : 'optional'}
        </span>
      </div>
    </div>
  )
}

// Guidance instead of a padlock: sections are never locked, they explain
// what they need and offer the shortcut (docs/redesign/08 §6).
export function NotReadySection({
  message,
  action,
}: {
  message: string
  action?: { label: string; section: StudioSectionKey }
}) {
  const { goSection } = useTokenForm()
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {action && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goSection(action.section)}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
