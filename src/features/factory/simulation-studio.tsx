'use client'

import { useRef, useState } from 'react'
import {
  AlertCircle,
  Clock,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PriceEnvelopeChartDither } from '@/components/charts/price-envelope-chart-dither'
import {
  MAX_CRISES,
  MAX_SAVED_SCENARIOS,
  SCENARIO_MAX_MONTH,
  type CrisisType,
  type FactorySimulationScenarioInput,
  type SimulationResult,
} from '@/lib/tokenomics'
import type { FactorySimulationSnapshot } from '@/types/factory'
import { useFactoryForm } from './factory-form-context'
import {
  DEFAULT_PHASES,
  ScenarioTimelineEditor,
  phasesToWindows,
  windowsToPhases,
  type MacroPhase,
} from './scenario-timeline-editor'
import {
  LiquidityEventsEditor,
  parseLiquidityEvents,
  type LiquidityEventDraft,
} from './liquidity-events-editor'
import { ScenarioLibrary } from './scenario-library'
import { SimulationKpiTable } from './simulation-kpi-table'
import { useSimulationSnapshots } from './use-simulation-snapshots'

const CRISIS_OPTIONS: Array<{ value: CrisisType; label: string }> = [
  { value: 'covid', label: 'Pandemic shock (2020-style)' },
  { value: 'ftx', label: 'Exchange collapse (2022-style)' },
  { value: 'terra', label: 'Stablecoin implosion (2022-style)' },
]

interface CrisisDraft {
  month: string
  type: CrisisType
}

/** The path counts the studio offers; the engine clamps to [100, 2000]. */
const PATH_COUNT_OPTIONS = [500, 1000, 2000]

/** Snap an arbitrary saved count onto the closest offered option. */
const closestPathCount = (value: number | undefined): number => {
  const target = value ?? 1000
  return PATH_COUNT_OPTIONS.reduce((best, option) =>
    Math.abs(option - target) < Math.abs(best - target) ? option : best,
  )
}

/** The scenario being composed; everything else about a run derives. */
export interface ScenarioDraft {
  phases: MacroPhase[]
  liquidityEvents: LiquidityEventDraft[]
  crises: CrisisDraft[]
  seed: string
  nPaths: number
}

const defaultDraft = (): ScenarioDraft => ({
  phases: DEFAULT_PHASES,
  liquidityEvents: [],
  crises: [],
  seed: '42',
  nPaths: 1000,
})

/** Re-fit a saved scenario into the composer's editable draft. */
const draftFromSnapshot = (
  snapshot: FactorySimulationSnapshot,
): ScenarioDraft => ({
  phases: windowsToPhases(snapshot.scenario.macroWindows),
  liquidityEvents: (snapshot.scenario.liquidityEvents ?? []).map((event) => ({
    month: String(event.month),
    depthUsd: String(event.depthUsd),
  })),
  crises: snapshot.scenario.crises.map((crisis) => ({
    month: String(crisis.month),
    type: crisis.type,
  })),
  seed: String(snapshot.scenario.seed),
  nPaths: closestPathCount(snapshot.scenario.nPaths),
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
  /** Pushes a loaded scenario's assumptions back into the panel's knobs. */
  applyScenarioAssumptions: (scenario: FactorySimulationScenarioInput) => void
}

/**
 * The Monte-Carlo half of the simulation studio: compose a scenario
 * (market phases, liquidity events, crises, seed), run it against the
 * SAVED design, and keep the keepers in a per-design library. On mount the
 * latest saved run pre-hydrates the composer and the results, so state
 * survives the completion screen and reloads. Results are hypothetical
 * stress outcomes, not predictions.
 */
export function SimulationStudio({
  projectId,
  refPriceUsd,
  marketDepthUsd,
  pctSoldByType,
  pctSoldEmission,
  horizonMonths,
  applyScenarioAssumptions,
}: SimulationStudioProps) {
  const { autosave } = useFactoryForm()
  const { snapshots, loading, addLocal, rename, remove } =
    useSimulationSnapshots(projectId)

  // Derived-state pattern (no syncing effects): null means "untouched".
  // The rendered draft falls back to the displayed snapshot (loaded or
  // latest), then to the default, until the user edits.
  const [draftState, setDraftState] = useState<ScenarioDraft | null>(null)
  const [runResult, setRunResult] = useState<SimulationResult | null>(null)
  const [loadedSnapshotId, setLoadedSnapshotId] = useState<string | null>(null)
  /** The exact scenario behind runResult; what "Save to library" persists. */
  const lastRunScenario = useRef<FactorySimulationScenarioInput | null>(null)

  const [running, setRunning] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const latestSnapshot = snapshots[0] ?? null
  const loadedSnapshot = loadedSnapshotId
    ? (snapshots.find((snapshot) => snapshot.id === loadedSnapshotId) ?? null)
    : null
  // A fresh run always wins the display; otherwise show the loaded or the
  // most recent saved run (that is the completion-screen survival path).
  const displaySnapshot = runResult ? null : (loadedSnapshot ?? latestSnapshot)
  const displayResult = runResult ?? displaySnapshot?.result ?? null
  const displayScenario = runResult
    ? lastRunScenario.current
    : (displaySnapshot?.scenario ?? null)

  const draft =
    draftState ??
    (displaySnapshot ? draftFromSnapshot(displaySnapshot) : defaultDraft())
  const updateDraft = (patch: Partial<ScenarioDraft>) =>
    setDraftState({ ...draft, ...patch })

  const liquidity = parseLiquidityEvents(draft.liquidityEvents)
  const canRun =
    projectId !== null &&
    refPriceUsd !== null &&
    !running &&
    liquidity.error === null
  const capReached = snapshots.length >= MAX_SAVED_SCENARIOS
  const canSave = runResult !== null && !capReached && !saving

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
      const scenario: FactorySimulationScenarioInput = {
        seed: Number.isFinite(parsedSeed) ? parsedSeed : 42,
        nPaths: draft.nPaths,
        initialPriceUsd: refPriceUsd,
        marketDepthUsd,
        pctSoldByType,
        pctSoldEmission,
        macroWindows: phasesToWindows(draft.phases, horizonMonths),
        liquidityEvents: liquidity.events ?? [],
        crises: draft.crises.map((crisis) => {
          const month = parseInt(crisis.month, 10)
          return {
            month: Number.isFinite(month)
              ? Math.min(SCENARIO_MAX_MONTH, Math.max(0, month))
              : 0,
            type: crisis.type,
          }
        }),
      }
      const response = await fetch('/api/factory/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, scenario }),
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
      lastRunScenario.current = scenario
      setRunResult(json.result as SimulationResult)
      setLoadedSnapshotId(null)
    } catch {
      toast.error('The simulation failed')
    } finally {
      setRunning(false)
    }
  }

  const saveToLibrary = async () => {
    if (!projectId || !lastRunScenario.current) return
    const name = saveName.trim()
    if (!name) {
      setSaveError('Give the scenario a name')
      return
    }
    setSaving(true)
    try {
      // Re-POST the exact scenario behind the displayed result: the engine
      // is seed-deterministic, so the server recomputes the same numbers
      // and the stored result stays server-computed.
      const response = await fetch('/api/factory/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          scenario: lastRunScenario.current,
          persist: { name },
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        setSaveError(json.error ?? 'Saving the scenario failed')
        return
      }
      if (json.persistError || !json.snapshot) {
        setSaveError(
          json.persistError === 'duplicate-name'
            ? 'A scenario with that name already exists'
            : json.persistError === 'cap-reached'
              ? `Scenario library is full (${MAX_SAVED_SCENARIOS} saved)`
              : 'Saving the scenario failed',
        )
        return
      }
      const snapshot = json.snapshot as FactorySimulationSnapshot
      addLocal(snapshot)
      setRunResult(null)
      setLoadedSnapshotId(snapshot.id)
      setSaveOpen(false)
      setSaveName('')
      toast.success(`Scenario "${name}" saved`)
    } catch {
      setSaveError('Saving the scenario failed')
    } finally {
      setSaving(false)
    }
  }

  const loadSnapshot = (snapshot: FactorySimulationSnapshot) => {
    setDraftState(draftFromSnapshot(snapshot))
    setRunResult(null)
    setLoadedSnapshotId(snapshot.id)
    applyScenarioAssumptions(snapshot.scenario)
  }

  return (
    <>
      <div className="space-y-5 rounded-xl border bg-surface-1 px-5 py-4">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <FlaskConical className="h-4 w-4 text-primary" aria-hidden />
            Monte-Carlo stress test
          </h3>
          <p className="text-xs text-muted-foreground">
            Compose a scenario and simulate its price paths over the saved
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
              <p className="text-sm font-medium">Crises, seed and paths</p>
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

            <div className="space-y-1.5">
              <label htmlFor="studio-paths" className="text-sm font-medium">
                Simulated paths
              </label>
              <Select
                value={String(draft.nPaths)}
                onValueChange={(value) =>
                  updateDraft({ nPaths: Number(value) })
                }
              >
                <SelectTrigger id="studio-paths" className="tabular">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="500">500 (fast preview)</SelectItem>
                  <SelectItem value="1000">1,000 (default)</SelectItem>
                  <SelectItem value="2000">
                    2,000 (steadier percentiles)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                More paths smooth the envelope and KPIs; runs take longer.
              </p>
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
          <Button
            type="button"
            variant="outline"
            disabled={!canSave}
            onClick={() => {
              setSaveName('')
              setSaveError(null)
              setSaveOpen(true)
            }}
          >
            <Save className="h-4 w-4" aria-hidden />
            Save to library
          </Button>
          {refPriceUsd === null && (
            <p className="text-xs text-muted-foreground">
              Set a reference price above to run the stress test.
            </p>
          )}
          {capReached && (
            <p className="text-xs text-muted-foreground">
              {MAX_SAVED_SCENARIOS} of {MAX_SAVED_SCENARIOS} scenarios saved.
              Delete one first.
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
              Runs the last saved design. Your unsaved edits are not included
              yet.
            </p>
          )}
        </div>

        {displayResult && displayScenario && (
          <div className="space-y-4">
            {displaySnapshot && (
              <p className="text-xs text-muted-foreground">
                Saved run &quot;{displaySnapshot.name}&quot;, stored results
                shown. Run again for fresh numbers.
              </p>
            )}
            <PriceEnvelopeChartDither
              envelope={displayResult.envelope}
              initialPriceUsd={displayScenario.initialPriceUsd}
              height={380}
            />
            <SimulationKpiTable kpis={displayResult.kpis} />
            <p className="font-mono text-xs text-muted-foreground">
              seed {displayResult.meta.seed} · {displayResult.meta.nPaths} paths
              · {displayResult.meta.durationMs}ms · engine v
              {displayResult.meta.engineVersion}
            </p>
          </div>
        )}
      </div>

      <ScenarioLibrary
        snapshots={snapshots}
        loading={loading}
        activeId={displaySnapshot?.id ?? null}
        onLoad={loadSnapshot}
        onRename={rename}
        onRemove={remove}
      />

      <Dialog
        open={saveOpen}
        onOpenChange={(open) => {
          if (!open) setSaveOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save scenario to library</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Scenario name"
            placeholder="e.g. Bear then recovery"
            value={saveName}
            maxLength={80}
            onChange={(e) => {
              setSaveName(e.target.value)
              setSaveError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveToLibrary()
            }}
          />
          {saveError && (
            <p className="text-xs" style={{ color: 'hsl(var(--warning))' }}>
              {saveError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void saveToLibrary()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
