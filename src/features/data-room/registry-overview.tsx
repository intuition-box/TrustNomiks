'use client'

import { ArrowRight, BarChart2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TokenFace } from '@/components/composite/token-face'
import { StatusPill } from '@/components/composite/data-badge'
import { hasAnyVisualAsset } from '@/lib/utils/asset-readiness'
import { CATEGORY_OPTIONS } from '@/types/form'
import type { DataRoomTokenListItem } from '@/features/data-room/fetch-workspace'
import type { TokenStatus } from '@/types/token'

interface RegistryOverviewProps {
  tokens: DataRoomTokenListItem[]
  onSelect: (tokenId: string) => void
  onCompare: (ids: string[]) => void
}

function countBy(values: Array<string | null>): Array<[string, number]> {
  const map = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

function categoryLabel(value: string): string {
  return CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value
}

function DistributionCard({
  title,
  entries,
  total,
  accentVar,
}: {
  title: string
  entries: Array<[string, number]>
  total: number
  accentVar: string
}) {
  return (
    <div className="rounded-xl border bg-surface-1 p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {entries.slice(0, 6).map(([label, count]) => (
          <li key={label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">
                {label}
              </span>
              <span className="tabular shrink-0 font-medium">{count}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((count / total) * 100)}%`,
                  backgroundColor: `hsl(var(${accentVar}))`,
                }}
              />
            </div>
          </li>
        ))}
        {entries.length === 0 && (
          <li className="text-xs text-faint-foreground">Not set yet</li>
        )}
      </ul>
    </div>
  )
}

/**
 * The data room's opening view: the registry at a glance, before any
 * drill-down. Everything derives from the already-fetched token list,
 * zero extra queries.
 */
export function RegistryOverview({
  tokens,
  onSelect,
  onCompare,
}: RegistryOverviewProps) {
  const byCategory = countBy(tokens.map((t) => t.category)).map(
    ([v, n]) => [categoryLabel(v), n] as [string, number],
  )
  const byChain = countBy(tokens.map((t) => t.chain))

  const deepest = [...tokens]
    .sort((a, b) => (b.completeness ?? 0) - (a.completeness ?? 0))
    .slice(0, 5)

  const compareCandidates = tokens
    .filter((t) => hasAnyVisualAsset(t.cluster_scores, t.coingecko_id))
    .sort((a, b) => (b.completeness ?? 0) - (a.completeness ?? 0))
    .slice(0, 3)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <DistributionCard
          title="Registry by category"
          entries={byCategory}
          total={tokens.length}
          accentVar="--data-category"
        />
        <DistributionCard
          title="Registry by chain"
          entries={byChain}
          total={tokens.length}
          accentVar="--data-chain"
        />
      </div>

      {/* Deepest dossiers: the drill-down invitation */}
      <div className="overflow-hidden rounded-xl border bg-surface-1">
        <div className="border-b px-5 py-3.5">
          <h3 className="text-sm font-semibold">Deepest dossiers</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The most complete tokenomics in the graph. Click one to open its
            charts.
          </p>
        </div>
        <ul className="divide-y">
          {deepest.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <TokenFace
                  name={t.name}
                  ticker={t.ticker}
                  imageUrl={t.coingecko_image}
                  size={24}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {t.name}{' '}
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {t.ticker}
                  </span>
                </span>
                <StatusPill status={t.status as TokenStatus} />
                <span className="tabular w-10 shrink-0 text-right text-xs text-muted-foreground">
                  {t.completeness ?? 0}%
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {compareCandidates.length >= 2 && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border bg-surface-1 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{
                backgroundColor:
                  'color-mix(in oklab, hsl(var(--data-hub)) 14%, transparent)',
                color: 'hsl(var(--data-hub))',
              }}
            >
              <BarChart2 className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium">
                Compare the top dossiers side by side
              </p>
              <p className="text-xs text-muted-foreground">
                {compareCandidates.map((t) => t.name).join(' · ')}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCompare(compareCandidates.map((t) => t.id))}
          >
            Compare
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  )
}
