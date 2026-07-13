'use client'

import type { SimulationKpis } from '@/lib/tokenomics'

/** Compact price display for sub-cent and large values alike. */
export const formatKpiPrice = (value: number): string => {
  if (!Number.isFinite(value)) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  if (value >= 1) return value.toFixed(2)
  if (value === 0) return '0'
  return value.toPrecision(3)
}

export interface SimulationKpiRow {
  key: keyof SimulationKpis
  label: string
  format: (value: number) => string
}

/** The studio's headline metrics, shared by the run table and the compare. */
export const SIMULATION_KPI_ROWS: SimulationKpiRow[] = [
  {
    key: 'finalPrice',
    label: 'Final price',
    format: (v) => `$${formatKpiPrice(v)}`,
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

/** Pessimistic / median / optimistic / mean table for one run's KPIs. */
export function SimulationKpiTable({ kpis }: { kpis: SimulationKpis }) {
  return (
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
          {SIMULATION_KPI_ROWS.map((row) => {
            const aggregate = kpis[row.key]
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
  )
}
