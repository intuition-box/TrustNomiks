'use client'

import { cn } from '@/lib/utils'

export type StudioSectionKey =
  | 'identity'
  | 'supply'
  | 'allocation'
  | 'vesting'
  | 'emission'
  | 'sources'
  | 'risk'

export interface StudioSectionMeta {
  key: StudioSectionKey
  label: string
  /** taxonomy CSS var, e.g. "--data-token" */
  accentVar: string
  tier: 'core' | 'enrich'
  /** live points earned / max points */
  live: number
  max: number
  optional?: boolean
}

interface StudioSpineProps {
  sections: StudioSectionMeta[]
  active: StudioSectionKey
  onSelect: (key: StudioSectionKey) => void
  score: number
  flash?: { pts: number; key: number; show: boolean }
  orientation?: 'vertical' | 'horizontal'
  className?: string
}

/** ○ empty / ◐ started / ● complete, in the section's taxonomy color. */
function StateDot({ live, max, accentVar }: { live: number; max: number; accentVar: string }) {
  const color = `hsl(var(${accentVar}))`
  const complete = max > 0 && live >= max
  const started = live > 0
  return (
    <span
      aria-hidden
      className="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px]"
      style={
        complete
          ? { backgroundColor: color, borderColor: color }
          : started
            ? {
                borderColor: color,
                background: `linear-gradient(90deg, ${color} 50%, transparent 50%)`,
              }
            : { borderColor: 'hsl(var(--border-strong))' }
      }
    />
  )
}

/**
 * The studio's section spine (docs/redesign/08 §6): CORE unlocks the graph,
 * ENRICH deepens it. Every section stays reachable; state is shown, never
 * locked behind a padlock.
 */
export function StudioSpine({
  sections,
  active,
  onSelect,
  score,
  flash,
  orientation = 'vertical',
  className,
}: StudioSpineProps) {
  if (orientation === 'horizontal') {
    return (
      <div className={cn('flex items-center gap-1.5 overflow-x-auto pb-1', className)} role="tablist" aria-label="Form sections">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={active === s.key}
            onClick={() => onSelect(s.key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              active === s.key
                ? 'border-border-strong bg-surface-2 text-foreground'
                : 'text-muted-foreground hover:bg-surface-2/60 hover:text-foreground',
            )}
          >
            <StateDot live={s.live} max={s.max} accentVar={s.accentVar} />
            {s.label}
          </button>
        ))}
      </div>
    )
  }

  const core = sections.filter((s) => s.tier === 'core')
  const enrich = sections.filter((s) => s.tier === 'enrich')

  const renderGroup = (label: string, hint: string, items: StudioSectionMeta[]) => (
    <div>
      <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-faint-foreground">
        {label} <span className="normal-case tracking-normal">· {hint}</span>
      </p>
      <div className="space-y-0.5">
        {items.map((s) => {
          const isActive = active === s.key
          return (
            <button
              key={s.key}
              type="button"
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onSelect(s.key)}
              className={cn(
                'relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-surface-2 font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-surface-2/60 hover:text-foreground',
              )}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-y-1.5 left-0 w-0.5 rounded-full"
                  style={{ backgroundColor: `hsl(var(${s.accentVar}))` }}
                />
              )}
              <StateDot live={s.live} max={s.max} accentVar={s.accentVar} />
              <span className="flex-1 text-left">{s.label}</span>
              <span className="tabular text-[11px] text-faint-foreground">
                {s.optional && s.max === 0 ? 'opt.' : `${s.live}/${s.max}`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className={cn('space-y-4', className)}>
      {/* Score block */}
      <div className="rounded-xl border bg-surface-1 p-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-faint-foreground">
          Completeness
        </p>
        <div className="relative mb-3 flex items-end gap-1.5">
          <span className="tabular text-4xl font-semibold leading-none tracking-tight">{score}</span>
          <span className="text-sm text-muted-foreground">/ 100</span>
          {flash?.show && (
            <span
              key={flash.key}
              className="absolute -top-5 left-0 select-none whitespace-nowrap text-xs font-semibold text-success"
              style={{ animation: 'score-flash 1.4s ease-out forwards' }}
            >
              +{flash.pts} pts
            </span>
          )}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${score}%`, background: 'var(--gradient-brand)' }}
          />
        </div>
      </div>

      {/* Section nav */}
      <nav className="space-y-4 rounded-xl border bg-surface-1 p-3" aria-label="Form sections">
        {renderGroup('Core', 'unlocks the graph', core)}
        {renderGroup('Enrich', 'deepens it', enrich)}
      </nav>
    </div>
  )
}
