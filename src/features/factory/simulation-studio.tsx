'use client'

import { useState } from 'react'
import {
  AlertCircle,
  Clock,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PriceEnvelopeChart } from '@/components/charts/price-envelope-chart'
import {
  MAX_CRISES,
  SCENARIO_MAX_MONTH,
  type CrisisType,
  type SimulationResult,
} from '@/lib/tokenomics'
import { useFactoryForm } from './factory-form-context'
import {
  DEFAULT_PHASES,
  ScenarioTimelineEditor,
  phasesToWindows,
  type MacroPhase,
} from './scenario-timeline-editor'
import {
  LiquidityEventsEditor,
  parseLiquidityEvents,
  type LiquidityEventDraft,
} from './liquidity-events-editor'
import { SimulationKpiTable } from './simulation-kpi-table'

const CRISIS_OPTIONS: Array<{ value: CrisisType; label: string }> = [
  { value: 'covid', label: 'Pandemic shock (2020-style)' },
  { value: 'ftx', label: 'Exchange collapse (2022-style)' },
  { value: 'terra', label: 'Stablecoin implosion (2022-style)' },
]

interface CrisisDraft {
  month: string
  type: CrisisType
}

/** The scenario being composed; everything else about a run derives. */
export interface ScenarioDraft {
  phases: MacroPhase[]
  liquidityEvents: LiquidityEventDraft[]
  crises: CrisisDraft[]
  seed: string
}

const defaultDraft = (): ScenarioDraft => ({
  phases: DEFAULT_PHASES,
  liquidityEvents: [],
  crises: [],
  seed: '42',
})

interface SimulationStudioProps {
  projectId: string | null
  /** Scenario assumptions shared with the deterministic projections. */
  refPriceUsd: number | null
  marketDepthUsd: number | null
  pctSoldByType: Record<string, number>
  pctSoldEmission: number
  /** Design horizon, in months (the last market phase runs to it). */
  horizonMonths: number
}

/**
 * The Monte-Carlo half of the simulation studio: compose a scenario
 * (market phases, liquidity events, crises, seed) and run it. The design
 * itself is reloaded server-side from its SAVED state; only the scenario
 * travels. Results are hypothetical stress outcomes, not predictions.
 */
export function SimulationStudio({
  projectId,
  refPriceUsd,
  marketDepthUsd,
  pctSoldByType,
  pctSoldEmission,
  horizonMonths,
}: SimulationStudioProps) {
  const { autosave } = useFactoryForm()

  // Derived-state pattern (no syncing effects): null means "untouched",
  // and the rendered draft falls back to the default until the user edits.
  const [draftState, setDraftState] = useState<ScenarioDraft | null>(null)
  const draft = draftState ?? defaultDraft()
  const updateDraft = (patch: Partial<ScenarioDraft>) =>
    setDraftState({ ...draft, ...patch })

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)

  const liquidity = parseLiquidityEvents(draft.liquidityEvents)
  const canRun =
    projectId !== null &&
    refPriceUsd !== null &&
    !running &&
    liquidity.error === null

  // The route simulates the design as SAVED in the database, while the
  // charts above follow the live form: surface the gap whenever edits are
  // still in flight (or failed to save).
  const unsavedStatus =
    autosave.status !== 'idle' && autosave.status !== 'saved'
      ? autosave.status
      : null

  const run = async () => {
    if (!projectId || refPriceUsd === null || liquidity.error !== null) return
    setRunning(true)
    try {
      const parsedSeed = parseInt(draft.seed, 10)
      const crises = draft.crises.map((crisis) => {
        const month = parseInt(crisis.month, 10)
        return {
          month: Number.isFinite(month)
            ? Math.min(SCENARIO_MAX_MONTH, Math.max(0, month))
            : 0,
          type: crisis.type,
        }
      })
      const response = await fetch('/api/factory/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          scenario: {
            seed: Number.isFinite(parsedSeed) ? parsedSeed : 42,
            nPaths: 1000,
            initialPriceUsd: refPriceUsd,
            marketDepthUsd,
            pctSoldByType,
            pctSoldEmission,
            macroWindows: phasesToWindows(draft.phases, horizonMonths),
            liquidityEvents: liquidity.events ?? [],
            crises,
          },
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        toast.error(json.error ?? 'The simulation failed')
        return
      }
      if (json.reason) {
        toast.error(
          json.reason === 'no-category'
            ? 'Pick a category in Identity first: the scenario is calibrated per category.'
            : 'Save a max supply and allocations before running a stress test.',
        )
        return
      }
      setResult(json.result as SimulationResult)
    } catch {
      toast.error('The simulation failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-5 rounded-xl border bg-surface-1 px-5 py-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <FlaskConical className="h-4 w-4 text-primary" aria-hidden />
          Monte-Carlo stress test
        </h3>
        <p className="text-xs text-muted-foreground">
          Compose a scenario and simulate 1,000 price paths over the saved
          design: hypothetical stress outcomes, not predictions.
        </p>
      </div>

      <ScenarioTimelineEditor
        phases={draft.phases}
        horizonMonths={horizonMonths}
        onChange={(phases) => updateDraft({ phases })}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <LiquidityEventsEditor
          events={draft.liquidityEvents}
          baselineDepthUsd={marketDepthUsd}
          error={liquidity.error}
          onChange={(liquidityEvents) => updateDraft({ liquidityEvents })}
        />

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">Crises and seed</p>
            <p className="text-xs text-muted-foreground">
              Replay historical shocks; the seed makes runs reproducible.
            </p>
          </div>
          {draft.crises.map((crisis, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={crisis.type}
                onValueChange={(value) =>
                  updateDraft({
                    crises: draft.crises.map((c, idx) =>
                      idx === i ? { ...c, type: value as CrisisType } : c,
                    ),
                  })
                }
              >
                <SelectTrigger
                  className="flex-1"
                  aria-label={`Crisis ${i + 1} type`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRISIS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">at month</span>
              <Input
                type="number"
                min="0"
                max={SCENARIO_MAX_MONTH}
                step="1"
                className="tabular w-20"
                aria-label={`Crisis ${i + 1} month`}
                value={crisis.month}
                onChange={(e) =>
                  updateDraft({
                    crises: draft.crises.map((c, idx) =>
                      idx === i ? { ...c, month: e.target.value } : c,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove crisis ${i + 1}`}
                onClick={() =>
                  updateDraft({
                    crises: draft.crises.filter((_, idx) => idx !== i),
                  })
                }
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft.crises.length >= MAX_CRISES}
            onClick={() =>
              updateDraft({
                crises: [...draft.crises, { month: '3', type: 'ftx' }],
              })
            }
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add crisis
          </Button>

          <div className="space-y-1.5">
            <label htmlFor="studio-seed" className="text-sm font-medium">
              Seed
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="studio-seed"
                type="number"
                step="1"
                className="tabular"
                value={draft.seed}
                onChange={(e) => updateDraft({ seed: e.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Draw a new seed"
                onClick={() =>
                  updateDraft({
                    seed: String(Math.floor(Math.random() * 1_000_000)),
                  })
                }
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={run} disabled={!canRun}>
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          {running ? 'Simulating' : 'Run stress test'}
        </Button>
        {refPriceUsd === null && (
          <p className="text-xs text-muted-foreground">
            Set a reference price above to run the stress test.
          </p>
        )}
        {unsavedStatus && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {unsavedStatus === 'invalid' || unsavedStatus === 'error' ? (
              <AlertCircle
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: 'hsl(var(--warning))' }}
                aria-hidden
              />
            ) : (
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            Runs the last saved design. Your unsaved edits are not included yet.
          </p>
        )}
      </div>

      {result && (
        <div className="space-y-4">
          <PriceEnvelopeChart
            envelope={result.envelope}
            initialPriceUsd={refPriceUsd as number}
            height={380}
          />
          <SimulationKpiTable kpis={result.kpis} />
          <p className="font-mono text-xs text-muted-foreground">
            seed {result.meta.seed} · {result.meta.nPaths} paths ·{' '}
            {result.meta.durationMs}ms · engine v{result.meta.engineVersion}
          </p>
        </div>
      )}
    </div>
  )
}
