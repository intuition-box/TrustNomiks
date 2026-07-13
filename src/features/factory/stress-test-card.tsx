'use client'

import { useState } from 'react'
import { FlaskConical, Loader2, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PriceEnvelopeChart } from '@/components/charts/price-envelope-chart'
import type {
  CrisisType,
  MacroCondition,
  SimulationKpis,
  SimulationResult,
} from '@/lib/tokenomics'

interface StressTestCardProps {
  projectId: string | null
  /** Scenario assumptions shared with the deterministic projections. */
  refPriceUsd: number | null
  marketDepthUsd: number | null
  pctSoldByType: Record<string, number>
  pctSoldEmission: number
  /** Design horizon, in months: the single macro window spans it. */
  horizonMonths: number
}

const CRISIS_OPTIONS: Array<{ value: CrisisType; label: string }> = [
  { value: 'covid', label: 'Pandemic shock (2020-style)' },
  { value: 'ftx', label: 'Exchange collapse (2022-style)' },
  { value: 'terra', label: 'Stablecoin implosion (2022-style)' },
]

const formatPrice = (value: number): string => {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  if (value >= 1) return value.toFixed(2)
  if (value === 0) return '0'
  return value.toPrecision(3)
}

const KPI_ROWS: Array<{
  key: keyof SimulationKpis
  label: string
  format: (value: number) => string
}> = [
  {
    key: 'finalPrice',
    label: 'Final price',
    format: (v) => `$${formatPrice(v)}`,
  },
  { key: 'cagr', label: 'CAGR', format: (v) => `${(v * 100).toFixed(1)}%` },
  {
    key: 'annualizedVolatility',
    label: 'Volatility (ann.)',
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
  { key: 'sharpe', label: 'Sharpe', format: (v) => v.toFixed(2) },
  {
    key: 'maxDrawdown',
    label: 'Max drawdown',
    format: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: 'pctTimeBelowInitial',
    label: 'Time below start',
    format: (v) => `${v.toFixed(0)}%`,
  },
]

/**
 * Monte-Carlo stress test over the panel's shared assumptions. The design
 * itself is reloaded server-side; only the scenario travels. Results are
 * hypothetical stress outcomes, not predictions, and are not persisted
 * (a later iteration snapshots them).
 */
export function StressTestCard({
  projectId,
  refPriceUsd,
  marketDepthUsd,
  pctSoldByType,
  pctSoldEmission,
  horizonMonths,
}: StressTestCardProps) {
  const [macroCondition, setMacroCondition] = useState<MacroCondition>('bear')
  const [crisisEnabled, setCrisisEnabled] = useState(false)
  const [crisisType, setCrisisType] = useState<CrisisType>('ftx')
  const [crisisMonth, setCrisisMonth] = useState('3')
  const [seedInput, setSeedInput] = useState('42')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SimulationResult | null>(null)

  const canRun = projectId !== null && refPriceUsd !== null && !running

  const run = async () => {
    if (!projectId || refPriceUsd === null) return
    setRunning(true)
    try {
      const parsedSeed = parseInt(seedInput, 10)
      const seed = Number.isFinite(parsedSeed) ? parsedSeed : 42
      const parsedMonth = parseInt(crisisMonth, 10)
      const crises = crisisEnabled
        ? [
            {
              month: Number.isFinite(parsedMonth)
                ? Math.min(120, Math.max(0, parsedMonth))
                : 0,
              type: crisisType,
            },
          ]
        : []
      const response = await fetch('/api/factory/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          scenario: {
            seed,
            nPaths: 1000,
            initialPriceUsd: refPriceUsd,
            marketDepthUsd,
            pctSoldByType,
            pctSoldEmission,
            macroWindows: [
              {
                fromMonth: 0,
                toMonth: horizonMonths,
                condition: macroCondition,
              },
            ],
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
    <div className="space-y-4 rounded-xl border bg-surface-1 px-5 py-4">
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <FlaskConical className="h-4 w-4 text-primary" aria-hidden />
          Stress test (Monte-Carlo)
        </h3>
        <p className="text-xs text-muted-foreground">
          1,000 simulated price paths over your assumptions: a hypothetical
          stress scenario, not a prediction.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="stress-macro" className="text-sm font-medium">
            Market regime
          </label>
          <Select
            value={macroCondition}
            onValueChange={(value) =>
              setMacroCondition(value as MacroCondition)
            }
          >
            <SelectTrigger id="stress-macro">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bear">Bear market</SelectItem>
              <SelectItem value="bull">Bull market</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="stress-seed" className="text-sm font-medium">
            Seed
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="stress-seed"
              type="number"
              step="1"
              className="tabular"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Draw a new seed"
              onClick={() =>
                setSeedInput(String(Math.floor(Math.random() * 1_000_000)))
              }
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={crisisEnabled} onCheckedChange={setCrisisEnabled} />
          Replay a historical crisis
        </label>
        {crisisEnabled && (
          <div className="flex flex-1 items-center gap-2">
            <Select
              value={crisisType}
              onValueChange={(value) => setCrisisType(value as CrisisType)}
            >
              <SelectTrigger className="flex-1" aria-label="Crisis type">
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
            <span className="text-sm text-muted-foreground">at month</span>
            <Input
              type="number"
              min="0"
              max="120"
              step="1"
              className="tabular w-20"
              aria-label="Crisis month"
              value={crisisMonth}
              onChange={(e) => setCrisisMonth(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
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
      </div>

      {result && (
        <div className="space-y-4">
          <PriceEnvelopeChart
            envelope={result.envelope}
            initialPriceUsd={refPriceUsd as number}
            height={380}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 text-left font-medium">Metric</th>
                  <th className="py-1.5 px-3 text-right font-medium">
                    Pessimistic (p20)
                  </th>
                  <th className="py-1.5 px-3 text-right font-medium">Median</th>
                  <th className="py-1.5 px-3 text-right font-medium">
                    Optimistic (p80)
                  </th>
                  <th className="py-1.5 pl-3 text-right font-medium">Mean</th>
                </tr>
              </thead>
              <tbody>
                {KPI_ROWS.map((row) => {
                  const aggregate = result.kpis[row.key]
                  return (
                    <tr key={row.key} className="border-b last:border-b-0">
                      <td className="py-1.5 pr-3">{row.label}</td>
                      <td className="tabular py-1.5 px-3 text-right">
                        {row.format(aggregate.p20)}
                      </td>
                      <td className="tabular py-1.5 px-3 text-right font-medium">
                        {row.format(aggregate.p50)}
                      </td>
                      <td className="tabular py-1.5 px-3 text-right">
                        {row.format(aggregate.p80)}
                      </td>
                      <td className="tabular py-1.5 pl-3 text-right">
                        {row.format(aggregate.mean)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            seed {result.meta.seed} · {result.meta.nPaths} paths ·{' '}
            {result.meta.durationMs}ms · engine v{result.meta.engineVersion}
          </p>
        </div>
      )}
    </div>
  )
}
