'use client'

import Link from 'next/link'
import { ExternalLink, X } from 'lucide-react'
import { StatusPill } from '@/components/composite/data-badge'
import { AllocationDonutChart } from '@/components/charts/allocation-donut-chart'
import { formatCompactNumber } from '@/lib/utils/vesting-timeline'
import { getSegmentChartColor } from '@/lib/utils/chart-colors'
import { formatSegmentTypeLabel } from '@/types/form'
import { cn } from '@/lib/utils'
import type { TokenStatus } from '@/types/token'
import type { TokenWorkspaceData } from './token-workspace'

interface CompareBoardProps {
  tokens: TokenWorkspaceData[]
  onRemove: (id: string) => void
}

function parseSupply(value: string | null | undefined): number {
  if (!value) return 0
  return Number(value.toString().replace(/,/g, '')) || 0
}

/**
 * Side-by-side tokenomics comparison (docs/redesign/08 §8): 2-4 tokens as
 * synced small multiples, allocation profile first since distribution is the
 * question people compare on. Reached from the Registry's CompareTray.
 */
export function CompareBoard({ tokens, onRemove }: CompareBoardProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        tokens.length === 2 && 'md:grid-cols-2',
        tokens.length === 3 && 'md:grid-cols-2 xl:grid-cols-3',
        tokens.length >= 4 && 'md:grid-cols-2 xl:grid-cols-4',
      )}
    >
      {tokens.map((token) => {
        const maxSupply = parseSupply(token.supply_metrics?.max_supply)
        const circulating = parseSupply(
          token.supply_metrics?.circulating_supply,
        )
        const circulatingShare =
          maxSupply > 0 && circulating > 0
            ? (circulating / maxSupply) * 100
            : null
        const segments = [...token.allocation_segments].sort(
          (a, b) => b.percentage - a.percentage,
        )

        return (
          <section
            key={token.id}
            className="overflow-hidden rounded-xl border bg-surface-1"
          >
            {/* Column header */}
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-sm font-semibold">
                    {token.name}
                  </h2>
                  <span className="font-mono text-xs text-muted-foreground">
                    {token.ticker}
                  </span>
                </div>
                <StatusPill
                  status={token.status as TokenStatus}
                  className="mt-1"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/tokens/${token.id}`}
                  aria-label={`Open ${token.name}`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </Link>
                <button
                  type="button"
                  onClick={() => onRemove(token.id)}
                  aria-label={`Remove ${token.name} from comparison`}
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* Allocation donut */}
            <div className="flex justify-center border-b px-4 py-4">
              {segments.length > 0 ? (
                <AllocationDonutChart
                  segments={token.allocation_segments}
                  maxSupply={token.supply_metrics?.max_supply ?? null}
                  size="sm"
                />
              ) : (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No allocation data yet.{' '}
                  <Link
                    className="underline hover:text-foreground"
                    href={`/tokens/new?id=${token.id}&section=allocation`}
                  >
                    Add it
                  </Link>
                </p>
              )}
            </div>

            {/* Allocation profile */}
            {segments.length > 0 && (
              <ul className="space-y-1 border-b px-4 py-3">
                {segments.slice(0, 6).map((seg) => (
                  <li
                    key={seg.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: getSegmentChartColor(
                            seg.segment_type,
                          ),
                        }}
                      />
                      <span className="truncate text-muted-foreground">
                        {formatSegmentTypeLabel(seg.segment_type)}
                      </span>
                    </span>
                    <span className="tabular font-mono">
                      {seg.percentage.toFixed(1)}%
                    </span>
                  </li>
                ))}
                {segments.length > 6 && (
                  <li className="tabular text-[11px] text-faint-foreground">
                    +{segments.length - 6} more segments
                  </li>
                )}
              </ul>
            )}

            {/* Supply figures */}
            <dl className="space-y-1 px-4 py-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Max supply</dt>
                <dd className="tabular font-mono">
                  {maxSupply > 0 ? formatCompactNumber(maxSupply) : 'Not set'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Circulating</dt>
                <dd className="tabular font-mono">
                  {circulating > 0
                    ? formatCompactNumber(circulating)
                    : 'Not set'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Circulating share</dt>
                <dd className="tabular font-mono">
                  {circulatingShare !== null
                    ? `${circulatingShare.toFixed(1)}%`
                    : 'Not set'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">Emission</dt>
                <dd className="truncate">
                  {token.emission_models?.type
                    ? token.emission_models.type.replaceAll('_', ' ')
                    : 'Not set'}
                </dd>
              </div>
            </dl>
          </section>
        )
      })}
    </div>
  )
}
