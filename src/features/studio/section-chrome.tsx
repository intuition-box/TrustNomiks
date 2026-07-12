'use client'

import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { StudioSectionKey } from '@/features/studio/studio-spine'

/**
 * Shared chrome for each studio section (header + score chip, and the
 * "not ready yet" gate), used by every studio-shaped surface (the screener
 * form and Factory's builder). Navigation itself is owned by StudioSpine;
 * what's local to a section is this header and gate.
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
// what they need and offer the shortcut (docs/redesign/08 §6). Generic over
// the section-key union (same reasoning as StudioSpine); each product binds
// `onGo` to its own form context in a thin wrapper.
export function NotReadySection<K extends string = StudioSectionKey>({
  message,
  action,
  onGo,
}: {
  message: string
  action?: { label: string; section: K }
  onGo: (key: K) => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {action && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onGo(action.section)}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
