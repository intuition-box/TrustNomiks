'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { BarChart2, ExternalLink, AlertCircle, Lock, Coins, PieChart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AllocationBreakdownChart } from '@/components/charts/allocation-breakdown-chart'
import { AllocationDonutChart } from '@/components/charts/allocation-donut-chart'
import { UnlockTimelineChart } from '@/components/charts/unlock-timeline-chart'
import { SupplyBarChart } from '@/components/charts/supply-bar-chart'
import { computeAssetReadiness, isAssetReady } from '@/lib/utils/asset-readiness'
import {
  computeVestingTimeline,
  formatCompactNumber,
  type AllocationWithVesting,
} from '@/lib/utils/vesting-timeline'
import { getSegmentChartColor } from '@/lib/utils/chart-colors'
import { formatSegmentTypeLabel, EMISSION_TYPE_OPTIONS } from '@/types/form'
import type { ClusterScores } from '@/lib/utils/completeness'

export interface TokenWorkspaceData {
  id: string
  name: string
  ticker: string
  chain: string | null
  coingecko_id: string | null
  coingecko_image: string | null
  tge_date: string | null
  status: string
  cluster_scores: ClusterScores | null
  supply_metrics: {
    max_supply: string | null
    initial_supply: string | null
    tge_supply: string | null
    circulating_supply: string | null
  } | null
  allocation_segments: Array<{
    id: string
    segment_type: string
    label: string
    percentage: number
    token_amount: string | null
  }>
  vesting_schedules: Array<{
    allocation_id: string
    cliff_months: number
    duration_months: number
    frequency: string
    tge_percentage: number
    cliff_unlock_percentage: number
  }>
  emission_models: {
    type: string
    annual_inflation_rate: number | null
    has_burn: boolean
    has_buyback: boolean
  } | null
}

interface TokenWorkspaceProps {
  token: TokenWorkspaceData
}

function parseSupply(value: string | null | undefined): number {
  if (!value) return 0
  return Number(value.toString().replace(/,/g, '')) || 0
}

function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const num = Number(value.toString().replace(/,/g, ''))
  if (isNaN(num)) return '—'
  return formatCompactNumber(num)
}

export function TokenWorkspace({ token }: TokenWorkspaceProps) {
  const hasAllocation = isAssetReady('allocation_breakdown', token.cluster_scores, token.coingecko_id)
  const hasSupplyComposition = isAssetReady('supply_composition', token.cluster_scores, token.coingecko_id)
  const hasUnlockTimeline = isAssetReady('unlock_timeline', token.cluster_scores, token.coingecko_id)
  const hasCirculatingVsMax = isAssetReady('circulating_vs_max', token.cluster_scores, token.coingecko_id)

  // Only show Phase 1 missing assets in the CTA
  const assets = computeAssetReadiness(token.cluster_scores, token.coingecko_id)
  const missingAssets = assets.filter((a) => !a.ready && a.phase === 1)

  const maxSupply = parseSupply(token.supply_metrics?.max_supply)
  const circulatingSupply = parseSupply(token.supply_metrics?.circulating_supply)
  const locked = maxSupply > 0 && circulatingSupply > 0 ? maxSupply - circulatingSupply : 0

  const emissionLabel = token.emission_models
    ? EMISSION_TYPE_OPTIONS.find((o) => o.value === token.emission_models!.type)?.label ??
      token.emission_models.type
    : null

  // Build vesting timeline data (with deduplicated labels)
  const vestingResult = useMemo(() => {
    if (!hasUnlockTimeline) return null

    const allocationsWithVesting: AllocationWithVesting[] = token.allocation_segments.map(
      (alloc) => {
        const vesting = token.vesting_schedules.find(
          (v) => v.allocation_id === alloc.id
        )
        return {
          label: alloc.label,
          segment_type: alloc.segment_type,
          percentage: alloc.percentage,
          token_amount: parseSupply(alloc.token_amount) || (alloc.percentage / 100) * maxSupply,
          vesting: vesting
            ? {
                cliff_months: vesting.cliff_months,
                duration_months: vesting.duration_months,
                frequency: vesting.frequency,
                tge_percentage: vesting.tge_percentage,
                cliff_unlock_percentage: vesting.cliff_unlock_percentage,
              }
            : null,
        }
      }
    )

    return computeVestingTimeline({
      allocations: allocationsWithVesting,
      maxSupply,
      tgeDate: token.tge_date,
    })
  }, [hasUnlockTimeline, token.allocation_segments, token.vesting_schedules, maxSupply, token.tge_date])

  // Segment info for the unlock chart — derived from the timeline's deduplicated keys
  const segmentInfos = useMemo(() => {
    if (!vestingResult) return []
    return vestingResult.segmentKeys
      .filter((sk) => !vestingResult.customSegments.includes(sk.key))
      .map((sk) => ({ label: sk.key, segment_type: sk.segment_type }))
  }, [vestingResult])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {token.coingecko_image ? (
            <img
              src={token.coingecko_image}
              alt={token.name}
              className="h-10 w-10 rounded-full"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Coins className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{token.name}</h2>
              <span className="text-lg font-mono text-primary">{token.ticker}</span>
            </div>
            {token.chain && (
              <span className="text-xs text-muted-foreground">{token.chain}</span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/tokens/${token.id}`}>
            View full details
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {/* KPI Strip */}
      <Card>
        <CardContent className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <KpiItem label="Max Supply" value={formatNumber(token.supply_metrics?.max_supply)} />
            <KpiItem label="TGE Supply" value={formatNumber(token.supply_metrics?.tge_supply)} />
            <KpiItem
              label="Circulating"
              value={formatNumber(token.supply_metrics?.circulating_supply)}
            />
            <KpiItem
              label="Locked"
              value={locked > 0 ? formatCompactNumber(locked) : '—'}
              icon={<Lock className="h-3 w-3 text-muted-foreground" />}
            />
            <KpiItem
              label="Emission"
              value={emissionLabel ?? '—'}
              small
            />
          </div>
        </CardContent>
      </Card>

      {/* Circulating vs Max — explicit visualization for circulating_vs_max asset */}
      {hasCirculatingVsMax && maxSupply > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Circulating vs Max Supply
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SupplyBarChart
              maxSupply={maxSupply}
              circulatingSupply={circulatingSupply}
            />
          </CardContent>
        </Card>
      )}

      {/* Allocation Breakdown */}
      {hasAllocation && token.allocation_segments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Allocation Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
              <AllocationBreakdownChart
                segments={token.allocation_segments}
                height={Math.max(200, token.allocation_segments.length * 40)}
              />
              <div className="flex justify-center">
                <AllocationDonutChart
                  segments={token.allocation_segments}
                  maxSupply={token.supply_metrics?.max_supply ?? null}
                  size={hasSupplyComposition ? 'lg' : 'sm'}
                />
              </div>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-4 border-t">
              {[...token.allocation_segments]
                .sort((a, b) => b.percentage - a.percentage)
                .map((seg) => (
                  <div key={seg.id} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getSegmentChartColor(seg.segment_type) }}
                    />
                    <span className="text-muted-foreground">
                      {formatSegmentTypeLabel(seg.segment_type)}
                    </span>
                    <span className="font-medium">{seg.label}</span>
                    <span className="font-mono">{seg.percentage.toFixed(1)}%</span>
                    {/* Show token amount when supply composition is available */}
                    {hasSupplyComposition && seg.token_amount && (
                      <span className="font-mono text-muted-foreground">
                        ({formatCompactNumber(parseSupply(seg.token_amount))})
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Supply Composition — explicit stacked bar showing max supply by segment */}
      {hasSupplyComposition && token.allocation_segments.length > 0 && maxSupply > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              Supply Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Single stacked bar showing supply distribution by segment */}
              <div className="h-8 rounded-lg overflow-hidden flex">
                {[...token.allocation_segments]
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((seg) => (
                    <div
                      key={seg.id}
                      className="h-full transition-all duration-300 flex items-center justify-center"
                      style={{
                        width: `${Math.max(seg.percentage, 1)}%`,
                        backgroundColor: getSegmentChartColor(seg.segment_type),
                      }}
                    >
                      {seg.percentage >= 8 && (
                        <span className="text-[10px] font-medium text-white truncate px-1">
                          {seg.label}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
              {/* Amount breakdown table */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {[...token.allocation_segments]
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((seg) => {
                    const amount = parseSupply(seg.token_amount) || (seg.percentage / 100) * maxSupply
                    return (
                      <div key={seg.id} className="flex items-center justify-between text-xs py-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: getSegmentChartColor(seg.segment_type) }}
                          />
                          <span className="truncate">{seg.label}</span>
                        </div>
                        <span className="font-mono text-muted-foreground ml-2 shrink-0">
                          {formatCompactNumber(amount)}
                        </span>
                      </div>
                    )
                  })}
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t font-medium">
                <span>Total (Max Supply)</span>
                <span className="font-mono">{formatCompactNumber(maxSupply)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unlock Timeline */}
      {hasUnlockTimeline && vestingResult && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              Token Unlock Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UnlockTimelineChart
              data={vestingResult.timeline}
              segments={segmentInfos}
              maxSupply={maxSupply}
              customSegments={vestingResult.customSegments}
            />
          </CardContent>
        </Card>
      )}

      {/* Missing assets CTA — Phase 1 only */}
      {missingAssets.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-sm text-muted-foreground">
                  Some visualizations are not available yet. Complete the missing data to unlock
                  them:
                </p>
                <div className="flex flex-wrap gap-2">
                  {missingAssets.map((a) => (
                    <Badge key={a.asset} variant="outline" className="text-xs">
                      {a.label} — missing:{' '}
                      {a.missingClusters.join(', ')}
                    </Badge>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2" asChild>
                  <Link href={`/tokens/new?id=${token.id}`}>Complete token data</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function KpiItem({
  label,
  value,
  icon,
  small,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  small?: boolean
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={small ? 'text-sm font-medium truncate' : 'text-lg font-bold font-mono'}>
        {value}
      </div>
    </div>
  )
}
