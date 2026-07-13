'use client'

import { Plus, TrendingDown, TrendingUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  MAX_MACRO_WINDOWS,
  type MacroCondition,
  type MacroWindowInput,
} from '@/lib/tokenomics'

/**
 * One market phase of the scenario timeline. Phases store only their
 * condition and END month; each phase starts where the previous one ends
 * and the last phase always runs "to end". Tiling from month 0 is thereby
 * valid BY CONSTRUCTION: no gap or overlap can even be expressed.
 */
export interface MacroPhase {
  condition: MacroCondition
  /** Exclusive end month; null marks the last phase (to the horizon). */
  endMonth: number | null
}

export const DEFAULT_PHASES: MacroPhase[] = [
  { condition: 'bear', endMonth: null },
]

/** Start month of phase i (derived: the previous phase's end). */
const phaseStart = (phases: MacroPhase[], index: number): number =>
  index === 0 ? 0 : (phases[index - 1].endMonth ?? 0)

/** Materialize the phases into the engine's tiling window list. */
export function phasesToWindows(
  phases: MacroPhase[],
  horizonMonths: number,
): MacroWindowInput[] {
  const windows: MacroWindowInput[] = []
  let cursor = 0
  for (const phase of phases) {
    const toMonth = Math.max(
      cursor + 1,
      phase.endMonth ?? Math.max(cursor + 1, horizonMonths),
    )
    windows.push({ fromMonth: cursor, toMonth, condition: phase.condition })
    cursor = toMonth
  }
  return windows
}

/** Re-fit saved windows into phases (the last one is pinned to "to end"). */
export function windowsToPhases(windows: MacroWindowInput[]): MacroPhase[] {
  if (windows.length === 0) return DEFAULT_PHASES
  const sorted = [...windows].sort((a, b) => a.fromMonth - b.fromMonth)
  return sorted.map((window, index) => ({
    condition: window.condition,
    endMonth: index === sorted.length - 1 ? null : window.toMonth,
  }))
}

const CONDITION_META: Record<
  MacroCondition,
  { label: string; icon: typeof TrendingUp; tint: string }
> = {
  bull: {
    label: 'Bull',
    icon: TrendingUp,
    tint: 'hsl(var(--success) / 0.22)',
  },
  bear: {
    label: 'Bear',
    icon: TrendingDown,
    tint: 'hsl(var(--destructive) / 0.22)',
  },
}

interface ScenarioTimelineEditorProps {
  phases: MacroPhase[]
  horizonMonths: number
  onChange: (phases: MacroPhase[]) => void
}

/**
 * Market-phase timeline: a proportional bar visualizing the horizon tiled
 * by regime, and one row per phase (condition + end month; the last phase
 * is pinned to the end so the tiling always closes).
 */
export function ScenarioTimelineEditor({
  phases,
  horizonMonths,
  onChange,
}: ScenarioTimelineEditorProps) {
  const lastStart = phaseStart(phases, phases.length - 1)
  const canSplit =
    phases.length < MAX_MACRO_WINDOWS && horizonMonths - lastStart >= 2

  const setCondition = (index: number, condition: MacroCondition) => {
    onChange(
      phases.map((phase, i) => (i === index ? { ...phase, condition } : phase)),
    )
  }

  const setEndMonth = (index: number, raw: string) => {
    const parsed = parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return
    const min = phaseStart(phases, index) + 1
    const nextEnd = phases[index + 1]?.endMonth ?? horizonMonths
    const max = Math.max(min, nextEnd - 1)
    const clamped = Math.min(max, Math.max(min, parsed))
    onChange(
      phases.map((phase, i) =>
        i === index ? { ...phase, endMonth: clamped } : phase,
      ),
    )
  }

  const addPhase = () => {
    if (!canSplit) return
    const split =
      lastStart + Math.max(1, Math.floor((horizonMonths - lastStart) / 2))
    const last = phases[phases.length - 1]
    onChange([
      ...phases.slice(0, -1),
      { condition: last.condition, endMonth: split },
      {
        condition: last.condition === 'bull' ? 'bear' : 'bull',
        endMonth: null,
      },
    ])
  }

  const removePhase = (index: number) => {
    if (phases.length === 1) return
    const next = phases.filter((_, i) => i !== index)
    // Dropping the last phase promotes its predecessor to "to end".
    next[next.length - 1] = { ...next[next.length - 1], endMonth: null }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Market phases</p>
        <p className="text-xs text-muted-foreground">
          The regime drives drift, volatility and how fast unlocks get sold.
        </p>
      </div>

      {/* Proportional regime bar: color is backed by a glyph + label. */}
      <div
        className="flex h-9 w-full overflow-hidden rounded-md border"
        role="img"
        aria-label={phases
          .map((phase, i) => {
            const from = phaseStart(phases, i)
            const to = phase.endMonth ?? horizonMonths
            return `${CONDITION_META[phase.condition].label} from month ${from} to ${to}`
          })
          .join(', ')}
      >
        {phases.map((phase, i) => {
          const from = phaseStart(phases, i)
          const to = Math.min(phase.endMonth ?? horizonMonths, horizonMonths)
          const span = Math.max(0, to - from)
          const meta = CONDITION_META[phase.condition]
          const Icon = meta.icon
          return (
            <div
              key={i}
              className="flex min-w-8 items-center justify-center gap-1 border-r px-1 text-xs last:border-r-0"
              style={{
                width: `${(span / Math.max(1, horizonMonths)) * 100}%`,
                backgroundColor: meta.tint,
              }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="tabular truncate">
                {meta.label} M{from}-
                {phase.endMonth === null ? horizonMonths : to}
              </span>
            </div>
          )
        })}
      </div>

      <div className="space-y-2">
        {phases.map((phase, i) => {
          const from = phaseStart(phases, i)
          const isLast = i === phases.length - 1
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="tabular w-16 shrink-0 text-xs text-muted-foreground">
                M{from} to
              </span>
              {isLast ? (
                <span className="tabular w-24 shrink-0 text-sm">
                  end (M{horizonMonths})
                </span>
              ) : (
                <Input
                  type="number"
                  min={from + 1}
                  step="1"
                  className="tabular w-24 shrink-0"
                  aria-label={`End month of phase ${i + 1}`}
                  value={String(phase.endMonth ?? '')}
                  onChange={(e) => setEndMonth(i, e.target.value)}
                />
              )}
              <Select
                value={phase.condition}
                onValueChange={(value) =>
                  setCondition(i, value as MacroCondition)
                }
              >
                <SelectTrigger
                  className="flex-1"
                  aria-label={`Regime of phase ${i + 1}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bear">Bear market</SelectItem>
                  <SelectItem value="bull">Bull market</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove phase ${i + 1}`}
                disabled={phases.length === 1}
                onClick={() => removePhase(i)}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canSplit}
        onClick={addPhase}
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add phase
      </Button>
    </div>
  )
}
