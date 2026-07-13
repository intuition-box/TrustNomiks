'use client'

import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MAX_LIQUIDITY_EVENTS,
  SCENARIO_MAX_MONTH,
  formatUsd,
} from '@/lib/tokenomics'

/** Raw input rows; parsing and validation happen in parseLiquidityEvents. */
export interface LiquidityEventDraft {
  month: string
  depthUsd: string
}

export type ParsedLiquidityEvents =
  | { events: Array<{ month: number; depthUsd: number }>; error: null }
  | { events: null; error: string }

/**
 * Parse the draft rows into engine events. Every row must be complete and
 * valid: an half-filled row is a mistake worth surfacing, not skipping.
 */
export function parseLiquidityEvents(
  drafts: LiquidityEventDraft[],
): ParsedLiquidityEvents {
  const events: Array<{ month: number; depthUsd: number }> = []
  const seen = new Set<number>()
  for (const draft of drafts) {
    const month = parseInt(draft.month, 10)
    const depthUsd = Number(draft.depthUsd)
    if (
      !Number.isInteger(month) ||
      month < 0 ||
      month > SCENARIO_MAX_MONTH ||
      draft.month.trim() === ''
    ) {
      return {
        events: null,
        error: 'Each liquidity event needs a month between 0 and 120',
      }
    }
    if (
      !Number.isFinite(depthUsd) ||
      depthUsd < 0 ||
      draft.depthUsd.trim() === ''
    ) {
      return {
        events: null,
        error: 'Each liquidity event needs a depth of 0 or more',
      }
    }
    if (seen.has(month)) {
      return {
        events: null,
        error: `Two liquidity events share month ${month}`,
      }
    }
    seen.add(month)
    events.push({ month, depthUsd })
  }
  events.sort((a, b) => a.month - b.month)
  return { events, error: null }
}

interface LiquidityEventsEditorProps {
  events: LiquidityEventDraft[]
  baselineDepthUsd: number | null
  onChange: (events: LiquidityEventDraft[]) => void
  /** Validation of the current rows, computed by the parent via parse. */
  error: string | null
}

/**
 * Dated market-depth changes: the scenario's liquidity step function. The
 * baseline comes from the panel's depth input; each row overrides it from
 * its month on.
 */
export function LiquidityEventsEditor({
  events,
  baselineDepthUsd,
  onChange,
  error,
}: LiquidityEventsEditorProps) {
  const setField = (
    index: number,
    field: keyof LiquidityEventDraft,
    value: string,
  ) => {
    onChange(
      events.map((event, i) =>
        i === index ? { ...event, [field]: value } : event,
      ),
    )
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Liquidity over time</p>
        <p className="text-xs text-muted-foreground">
          {baselineDepthUsd !== null
            ? `Baseline 2% depth: $${formatUsd(baselineDepthUsd)} from month 0.`
            : 'No depth yet: price impact is disabled until the first event.'}
        </p>
      </div>

      {events.map((event, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">From month</span>
          <Input
            type="number"
            min="0"
            max={SCENARIO_MAX_MONTH}
            step="1"
            className="tabular w-20"
            aria-label={`Liquidity event ${i + 1} month`}
            value={event.month}
            onChange={(e) => setField(i, 'month', e.target.value)}
          />
          <span className="text-xs text-muted-foreground">depth $</span>
          <Input
            type="number"
            min="0"
            step="1000"
            className="tabular flex-1"
            aria-label={`Liquidity event ${i + 1} depth in USD`}
            placeholder="e.g. 250000"
            value={event.depthUsd}
            onChange={(e) => setField(i, 'depthUsd', e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Remove liquidity event ${i + 1}`}
            onClick={() => onChange(events.filter((_, idx) => idx !== i))}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}

      {error && (
        <p className="text-xs" style={{ color: 'hsl(var(--warning))' }}>
          {error}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={events.length >= MAX_LIQUIDITY_EVENTS}
        onClick={() => onChange([...events, { month: '', depthUsd: '' }])}
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add liquidity event
      </Button>
      {events.length > 0 && (
        <p className="text-xs text-muted-foreground">
          A depth of 0 disables price impact from that month on.
        </p>
      )}
    </div>
  )
}
