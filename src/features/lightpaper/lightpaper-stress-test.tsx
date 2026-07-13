'use client'

import { PriceEnvelopeChart } from '@/components/charts/price-envelope-chart'
import {
  SIMULATION_KPI_ROWS,
  SimulationKpiTable,
} from '@/features/factory/simulation-kpi-table'
import { formatUsd, type CrisisType } from '@/lib/tokenomics'
import type { FactorySharedDesign } from '@/types/factory'

type SharedSnapshot = FactorySharedDesign['snapshots'][number]

const CRISIS_LABELS: Record<CrisisType, string> = {
  covid: 'Pandemic shock (2020-style)',
  ftx: 'Exchange collapse (2022-style)',
  terra: 'Stablecoin implosion (2022-style)',
}

const COMPARE_KEYS = [
  'finalPrice',
  'cagr',
  'maxDrawdown',
  'pctTimeBelowInitial',
] as const

/** The saved scenario's assumptions, in words. */
function describeScenario(scenario: SharedSnapshot['scenario']): string[] {
  const phases = [...scenario.macroWindows]
    .sort((a, b) => a.fromMonth - b.fromMonth)
    .map(
      (window) =>
        `${window.condition === 'bull' ? 'bull' : 'bear'} M${window.fromMonth} to M${window.toMonth}`,
    )
    .join(', then ')
  const lines = [`Market regime: ${phases}.`]

  const depth =
    scenario.marketDepthUsd !== null
      ? `2% market depth $${formatUsd(scenario.marketDepthUsd)}`
      : 'no market depth (price impact disabled)'
  lines.push(`Reference price $${scenario.initialPriceUsd}, ${depth}.`)

  if (scenario.liquidityEvents && scenario.liquidityEvents.length > 0) {
    lines.push(
      `Liquidity changes: ${scenario.liquidityEvents
        .map((event) => `$${formatUsd(event.depthUsd)} from M${event.month}`)
        .join(', ')}.`,
    )
  }
  if (scenario.crises.length > 0) {
    lines.push(
      `Crises replayed: ${scenario.crises
        .map((crisis) => `${CRISIS_LABELS[crisis.type]} at M${crisis.month}`)
        .join(', ')}.`,
    )
  }
  return lines
}

/**
 * The stress-test section of a shared lightpaper: the latest saved run's
 * envelope and KPIs, its scenario in words, and a median compare when the
 * design carries several saved scenarios. Client component because the
 * KPI row formatters live in a client module.
 */
export function LightpaperStressTest({
  snapshots,
}: {
  snapshots: SharedSnapshot[]
}) {
  if (snapshots.length === 0) return null
  const latest = snapshots[0]

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Saved scenario &quot;{latest.name}&quot; · {latest.result.meta.nPaths}{' '}
        simulated price paths · seed {latest.result.meta.seed} · engine v
        {latest.engine_version}
      </p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {describeScenario(latest.scenario).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <PriceEnvelopeChart
        envelope={latest.result.envelope}
        initialPriceUsd={latest.scenario.initialPriceUsd}
        height={360}
      />
      <SimulationKpiTable kpis={latest.result.kpis} />

      {snapshots.length >= 2 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Across saved scenarios (median)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 text-left font-medium">
                    Median of
                  </th>
                  {snapshots.map((snapshot) => (
                    <th
                      key={snapshot.name}
                      className="max-w-32 truncate py-1.5 px-3 text-right font-medium"
                    >
                      {snapshot.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SIMULATION_KPI_ROWS.filter((row) =>
                  (COMPARE_KEYS as readonly string[]).includes(row.key),
                ).map((row) => (
                  <tr key={row.key} className="border-b last:border-b-0">
                    <td className="py-1.5 pr-3">{row.label}</td>
                    {snapshots.map((snapshot) => (
                      <td
                        key={snapshot.name}
                        className="tabular py-1.5 px-3 text-right"
                      >
                        {row.format(snapshot.result.kpis[row.key].p50)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
