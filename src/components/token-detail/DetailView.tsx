'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  formatCategoryLabel,
  formatSectorLabel,
  formatSegmentTypeLabel,
  formatRiskFlagTypeLabel,
  getRiskFlagTypeDescription,
} from '@/types/form'
import { TokenPriceCard } from '@/components/token-price-card'
import { PublishPanel } from '@/components/intuition/publish-panel'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import { SectionCard } from '@/components/composite/section-card'
import {
  DataBadge,
  StatusPill,
  RiskPill,
  type TokenStatus,
} from '@/components/composite/data-badge'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import { EmptyState } from '@/components/composite/empty-state'
import { LiveGraph, type LiveGraphData } from '@/components/brand/live-graph'
import { AllocationDonutChart } from '@/components/charts/allocation-donut-chart'
import { UnlockTimelineChart } from '@/components/charts/unlock-timeline-chart'
import type { VestingTimelineResult } from '@/lib/utils/vesting-timeline'
import {
  formatNumber,
  formatDate,
  segmentColor,
  riskSeverity,
} from './detail-helpers'
import {
  getSourceClaims,
  getClaimLabel,
  ClaimSourceBadges,
} from './claim-sources'
import { StatusManager } from './StatusManager'
import type { TokenData } from './types'
import { StakeChip } from '@/features/claims/stake-chip'
import type { ChallengeAnchor } from '@/features/claims/challenge-target'
import type { ChallengeableClaimType } from '@/lib/claims/field-registry'

/** Per-field challenge chip (1:1 claim types: identity, supply, emission). */
function FieldChip({
  token,
  claimType,
  fieldKey,
  label,
  value,
}: {
  token: TokenData
  claimType: ChallengeableClaimType
  fieldKey: string
  label: string
  value: unknown
}) {
  const anchor: ChallengeAnchor = {
    claimType,
    claimId: null,
    anchorMode: 'field',
    fieldKey,
    label,
    currentValues: { [fieldKey]: value },
  }
  return <StakeChip anchor={anchor} token={token} />
}

/** Per-row challenge chip (allocation segments, vesting schedules). The exact
 * field is picked inside the Resolve Box drawer (design A6). */
function RowChip({
  token,
  claimType,
  claimId,
  label,
  currentValues,
}: {
  token: TokenData
  claimType: ChallengeableClaimType
  claimId: string
  label: string
  currentValues: Record<string, unknown>
}) {
  const anchor: ChallengeAnchor = {
    claimType,
    claimId,
    anchorMode: 'row',
    label,
    currentValues,
  }
  return <StakeChip anchor={anchor} token={token} />
}

interface DetailViewProps {
  token: TokenData
  setToken: (token: TokenData) => void
  graphData: LiveGraphData | null
  vestingResult: VestingTimelineResult | null
  vestingSegmentInfos: Array<{ label: string; segment_type: string }>
  maxSupplyNum: number
}

/**
 * Read-only token detail view: identity header, local knowledge graph,
 * publish panel, and the core/enrichment data cards. Owns only
 * presentation-local state (allocation hover, enrich-section toggle). See
 * docs/refactor-plan-token-routes-20260620.md — Part B step 4.
 */
export function DetailView({
  token,
  setToken,
  graphData,
  vestingResult,
  vestingSegmentInfos,
  maxSupplyNum,
}: DetailViewProps) {
  const [hoveredAllocationIndex, setHoveredAllocationIndex] = useState<
    number | null
  >(null)
  const [enrichOpen, setEnrichOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-16">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </button>

      {/* ── Identity header ─────────────────────────────────────────────── */}
      <header className="overflow-hidden rounded-xl border bg-surface-1">
        <div className="flex flex-col gap-5 p-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {token.coingecko_image ? (
                <img
                  src={token.coingecko_image}
                  alt={token.name}
                  className="h-9 w-9 rounded-full"
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <NodeGlyph type="token" size={20} withGlow />
              )}
              <h1 className="text-3xl font-bold tracking-tight">
                {token.name}
              </h1>
              <span className="font-mono text-2xl text-data-token">
                {token.ticker}
              </span>
              <StatusPill status={token.status as TokenStatus} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {token.chain && <DataBadge type="chain" label={token.chain} />}
              {token.category && (
                <DataBadge
                  type="category"
                  label={formatCategoryLabel(token.category)}
                />
              )}
              {token.sector && (
                <DataBadge
                  type="sector"
                  label={formatSectorLabel(token.sector)}
                />
              )}
            </div>

            {/* Completeness bar */}
            <div className="max-w-md space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">
                  Completeness
                </span>
                <span className="tabular font-semibold">
                  {token.completeness}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, token.completeness)}%`,
                    background: 'var(--gradient-brand)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <StatusManager token={token} setToken={setToken} />
        </div>
      </header>

      {/* ── Two-column body ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* LEFT, sticky graph + publish */}
        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          {/* Local knowledge graph */}
          <div className="overflow-hidden rounded-xl border bg-surface-1">
            <div className="flex items-center gap-2.5 border-b px-5 py-4">
              <NodeGlyph type="token" size={14} />
              <div>
                <h2 className="text-base font-semibold leading-tight">
                  Knowledge graph
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {token.ticker} and its sourced sub-entities
                </p>
              </div>
            </div>
            <div className="h-[360px] w-full bg-surface-2/40">
              {graphData && <LiveGraph mode="local" data={graphData} />}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t px-5 py-3">
              {(
                [
                  ['token', 'Token'],
                  ['allocation', 'Allocation'],
                  ['vesting', 'Vesting'],
                  ['emission', 'Emission'],
                  ['data_source', 'Source'],
                  ['risk_flag', 'Risk'],
                  ['chain', 'Chain'],
                ] as Array<[NodeType, string]>
              ).map(([type, label]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <NodeGlyph type={type} size={10} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Publish, first-class card */}
          {(token.status === 'validated' || token.status === 'in_review') && (
            <PublishPanel tokenId={token.id} tokenStatus={token.status} />
          )}
        </div>

        {/* RIGHT, data sections */}
        <div className="space-y-6">
          {/* Market data */}
          <TokenPriceCard coingeckoId={token.coingecko_id} tokenId={token.id} />

          {/* Identity details */}
          <SectionCard
            title="Identity"
            accent="token"
            description="Core token information"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Contract address
                  </p>
                  <FieldChip
                    token={token}
                    claimType="token_identity"
                    fieldKey="contract_address"
                    label="Contract address"
                    value={token.contract_address}
                  />
                </div>
                <p className="mt-1 break-all font-mono text-sm">
                  {token.contract_address || 'Not set'}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    TGE date
                  </p>
                  <FieldChip
                    token={token}
                    claimType="token_identity"
                    fieldKey="tge_date"
                    label="TGE date"
                    value={token.tge_date}
                  />
                </div>
                <p className="mt-1 text-sm">{formatDate(token.tge_date)}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Category
                  </p>
                  <FieldChip
                    token={token}
                    claimType="token_identity"
                    fieldKey="category"
                    label="Category"
                    value={token.category}
                  />
                </div>
                <p className="mt-1 text-sm">
                  {token.category
                    ? formatCategoryLabel(token.category)
                    : 'Not set'}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Sector
                  </p>
                  <FieldChip
                    token={token}
                    claimType="token_identity"
                    fieldKey="sector"
                    label="Sector"
                    value={token.sector}
                  />
                </div>
                <p className="mt-1 text-sm">
                  {token.sector ? formatSectorLabel(token.sector) : 'Not set'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Created
                </p>
                <p className="mt-1 text-sm">{formatDate(token.created_at)}</p>
              </div>
            </div>
            {token.notes && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground">
                  Notes
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {token.notes}
                </p>
              </div>
            )}
            <ClaimSourceBadges token={token} claimType="token_identity" />
          </SectionCard>

          {/* Supply, core */}
          <SectionCard
            title="Supply"
            accent="token"
            description="Token supply and circulation data"
          >
            {token.supply_metrics ? (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Max supply
                      </p>
                      <FieldChip
                        token={token}
                        claimType="supply_metrics"
                        fieldKey="max_supply"
                        label="Max supply"
                        value={token.supply_metrics.max_supply}
                      />
                    </div>
                    <p className="tabular mt-1 font-mono text-2xl font-semibold">
                      {formatNumber(token.supply_metrics.max_supply)}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Initial supply
                      </p>
                      <FieldChip
                        token={token}
                        claimType="supply_metrics"
                        fieldKey="initial_supply"
                        label="Initial supply"
                        value={token.supply_metrics.initial_supply}
                      />
                    </div>
                    <p className="tabular mt-1 font-mono text-2xl font-semibold">
                      {formatNumber(token.supply_metrics.initial_supply)}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        TGE supply
                      </p>
                      <FieldChip
                        token={token}
                        claimType="supply_metrics"
                        fieldKey="tge_supply"
                        label="TGE supply"
                        value={token.supply_metrics.tge_supply}
                      />
                    </div>
                    <p className="tabular mt-1 font-mono text-2xl font-semibold">
                      {formatNumber(token.supply_metrics.tge_supply)}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        Circulating supply
                      </p>
                      <FieldChip
                        token={token}
                        claimType="supply_metrics"
                        fieldKey="circulating_supply"
                        label="Circulating supply"
                        value={token.supply_metrics.circulating_supply}
                      />
                    </div>
                    <p className="tabular mt-1 font-mono text-2xl font-semibold">
                      {formatNumber(token.supply_metrics.circulating_supply)}
                    </p>
                    {token.supply_metrics.circulating_date && (
                      <p className="mt-1 text-xs text-faint-foreground">
                        As of{' '}
                        {formatDate(token.supply_metrics.circulating_date)}
                      </p>
                    )}
                  </div>
                </div>
                <ClaimSourceBadges token={token} claimType="supply_metrics" />
              </>
            ) : (
              <EmptyState
                title="No supply data yet"
                description="Max supply, initial supply and circulation are missing for this token."
                onboardingHint="Contribute it in the studio, Supply section."
                actions={
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(`/tokens/new?id=${token.id}&section=supply`)
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Contribute it
                  </Button>
                }
              />
            )}
          </SectionCard>

          {/* Allocation, core */}
          <SectionCard
            title="Allocation"
            accent="allocation"
            description="Distribution breakdown across segments"
          >
            {token.allocation_segments.length > 0 ? (
              <div className="space-y-6">
                {/* Donut + interactive stacked bar */}
                <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
                  <div className="shrink-0">
                    <AllocationDonutChart
                      segments={token.allocation_segments}
                      maxSupply={token.supply_metrics?.max_supply ?? null}
                      size="sm"
                    />
                  </div>

                  <div className="w-full space-y-1">
                    {/* Stacked bar */}
                    <div className="flex h-6 w-full overflow-hidden rounded-lg border">
                      {token.allocation_segments.map((segment, index) => (
                        <div
                          key={segment.id}
                          className={cn(
                            'cursor-pointer transition-opacity duration-75',
                            hoveredAllocationIndex !== null &&
                              hoveredAllocationIndex !== index
                              ? 'opacity-25'
                              : 'opacity-100',
                          )}
                          style={{
                            width: `${segment.percentage}%`,
                            backgroundColor: segmentColor(segment, index),
                          }}
                          onMouseEnter={() => setHoveredAllocationIndex(index)}
                          onMouseLeave={() => setHoveredAllocationIndex(null)}
                        />
                      ))}
                    </div>

                    {/* Percentage labels below bar */}
                    <div className="flex w-full">
                      {token.allocation_segments.map((segment, index) => (
                        <div
                          key={segment.id}
                          style={{ width: `${segment.percentage}%` }}
                          className={cn(
                            'text-center cursor-pointer transition-opacity duration-75',
                            hoveredAllocationIndex !== null &&
                              hoveredAllocationIndex !== index
                              ? 'opacity-25'
                              : 'opacity-100',
                          )}
                          onMouseEnter={() => setHoveredAllocationIndex(index)}
                          onMouseLeave={() => setHoveredAllocationIndex(null)}
                        >
                          {segment.percentage >= 4 && (
                            <span
                              className="tabular text-xs font-semibold"
                              style={{ color: segmentColor(segment, index) }}
                            >
                              {segment.percentage}%
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Info strip */}
                    <div className="flex h-6 items-center pl-0.5">
                      {hoveredAllocationIndex !== null && (
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: segmentColor(
                                token.allocation_segments[
                                  hoveredAllocationIndex
                                ],
                                hoveredAllocationIndex,
                              ),
                            }}
                          />
                          <span className="text-sm font-medium">
                            {
                              token.allocation_segments[hoveredAllocationIndex]
                                .label
                            }
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {
                              token.allocation_segments[hoveredAllocationIndex]
                                .percentage
                            }
                            %
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Segments table */}
                <div className="space-y-2">
                  {token.allocation_segments.map((segment, index) => (
                    <div
                      key={segment.id}
                      className={cn(
                        'flex flex-col gap-3 rounded-lg bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between',
                        'cursor-default transition-all duration-75',
                        hoveredAllocationIndex === index &&
                          'ring-1 ring-border-strong',
                        hoveredAllocationIndex !== null &&
                          hoveredAllocationIndex !== index &&
                          'opacity-40',
                      )}
                      onMouseEnter={() => setHoveredAllocationIndex(index)}
                      onMouseLeave={() => setHoveredAllocationIndex(null)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor: segmentColor(segment, index),
                          }}
                        />
                        <div>
                          <p className="font-medium">{segment.label}</p>
                          <p className="text-xs capitalize text-muted-foreground">
                            {formatSegmentTypeLabel(segment.segment_type)}
                          </p>
                          <ClaimSourceBadges
                            token={token}
                            claimType="allocation_segment"
                            claimId={segment.id}
                          />
                          <RowChip
                            token={token}
                            claimType="allocation_segment"
                            claimId={segment.id}
                            label={segment.label}
                            currentValues={{
                              segment_type: segment.segment_type,
                              label: segment.label,
                              percentage: segment.percentage,
                              token_amount: segment.token_amount,
                              wallet_address: segment.wallet_address,
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="tabular font-semibold">
                          {segment.percentage}%
                        </p>
                        <p className="tabular font-mono text-xs text-muted-foreground">
                          {formatNumber(segment.token_amount)} tokens
                        </p>
                        {segment.wallet_address && (
                          <p className="mt-1 font-mono text-xs text-faint-foreground">
                            {segment.wallet_address.slice(0, 6)}...
                            {segment.wallet_address.slice(-4)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                title="No allocation data yet"
                description="The distribution breakdown across segments has not been recorded."
                onboardingHint="Contribute it in the studio, Allocation section."
                actions={
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(
                        `/tokens/new?id=${token.id}&section=allocation`,
                      )
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Contribute it
                  </Button>
                }
              />
            )}
          </SectionCard>

          {/* ── Enrich toggle ────────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setEnrichOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed bg-surface-1 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            aria-expanded={enrichOpen}
          >
            {enrichOpen ? 'Hide enrichment' : 'Enrich'}
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                enrichOpen && 'rotate-180',
              )}
            />
          </button>

          {enrichOpen && (
            <div className="space-y-6">
              {/* Vesting */}
              <SectionCard
                title="Vesting"
                accent="vesting"
                description="Unlock schedules for each allocation"
              >
                {token.vesting_schedules.length > 0 ? (
                  <div className="space-y-5">
                    {vestingResult &&
                      vestingSegmentInfos.length > 0 &&
                      maxSupplyNum > 0 && (
                        <UnlockTimelineChart
                          data={vestingResult.timeline}
                          segments={vestingSegmentInfos}
                          maxSupply={maxSupplyNum}
                          customSegments={vestingResult.customSegments}
                          height={280}
                        />
                      )}
                    <div className="space-y-3">
                      {token.vesting_schedules.map((schedule, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 rounded-lg bg-surface-2 p-3"
                        >
                          <NodeGlyph
                            type="vesting"
                            size={16}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <p className="font-medium">
                              {schedule.allocation.label}
                            </p>
                            <ClaimSourceBadges
                              token={token}
                              claimType="vesting_schedule"
                              claimId={schedule.allocation_id}
                            />
                            <RowChip
                              token={token}
                              claimType="vesting_schedule"
                              claimId={schedule.allocation_id}
                              label={schedule.allocation.label}
                              currentValues={{
                                cliff_months: schedule.cliff_months,
                                duration_months: schedule.duration_months,
                                frequency: schedule.frequency,
                                tge_percentage: schedule.tge_percentage,
                                cliff_unlock_percentage:
                                  schedule.cliff_unlock_percentage,
                              }}
                            />
                            {schedule.frequency === 'immediate' ? (
                              <p className="mt-1 text-sm text-muted-foreground">
                                100% unlocked immediately at TGE
                              </p>
                            ) : (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {schedule.tge_percentage > 0 &&
                                  `${schedule.tge_percentage}% at TGE`}
                                {schedule.cliff_months > 0 &&
                                  `${schedule.tge_percentage > 0 ? ', then ' : ''}${schedule.cliff_months}m cliff`}
                                {schedule.cliff_unlock_percentage > 0 &&
                                  ` (${schedule.cliff_unlock_percentage}% released at cliff end)`}
                                {schedule.duration_months > 0 &&
                                  ` → ${schedule.duration_months}m ${schedule.frequency} vesting`}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No vesting schedules yet"
                    description="Unlock schedules per allocation segment have not been recorded."
                    onboardingHint="Contribute it in the studio, Vesting section."
                    actions={
                      <Button
                        variant="outline"
                        onClick={() =>
                          router.push(
                            `/tokens/new?id=${token.id}&section=vesting`,
                          )
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Contribute it
                      </Button>
                    }
                  />
                )}
              </SectionCard>

              {/* Emission */}
              <SectionCard
                title="Emission"
                accent="emission"
                description="Token economics and inflation mechanics"
              >
                {token.emission_models ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-medium text-muted-foreground">
                            Emission type
                          </p>
                          <FieldChip
                            token={token}
                            claimType="emission_model"
                            fieldKey="type"
                            label="Emission type"
                            value={token.emission_models.type}
                          />
                        </div>
                        <p className="mt-1 text-lg font-semibold capitalize">
                          {token.emission_models.type.replace('_', ' ')}
                        </p>
                      </div>
                      {token.emission_models.annual_inflation_rate != null && (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium text-muted-foreground">
                              Annual inflation rate
                            </p>
                            <FieldChip
                              token={token}
                              claimType="emission_model"
                              fieldKey="annual_inflation_rate"
                              label="Annual inflation rate"
                              value={
                                token.emission_models.annual_inflation_rate
                              }
                            />
                          </div>
                          <p className="tabular mt-1 text-lg font-semibold">
                            {token.emission_models.annual_inflation_rate}%
                          </p>
                        </div>
                      )}
                    </div>

                    {token.emission_models.has_burn && (
                      <div className="rounded-lg border border-warning/25 bg-warning/10 p-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="mt-0.5 h-5 w-5 text-warning" />
                          <div>
                            <p className="font-medium text-warning">
                              Burn mechanism active
                            </p>
                            {token.emission_models.burn_details && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {token.emission_models.burn_details}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {token.emission_models.has_buyback && (
                      <div className="rounded-lg border border-info/25 bg-info/10 p-3">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 text-info" />
                          <div>
                            <p className="font-medium text-info">
                              Buyback program active
                            </p>
                            {token.emission_models.buyback_details && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {token.emission_models.buyback_details}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <ClaimSourceBadges
                      token={token}
                      claimType="emission_model"
                    />
                  </div>
                ) : (
                  <EmptyState
                    title="No emission model yet"
                    description="Inflation, burn and buyback mechanics have not been recorded."
                    onboardingHint="Contribute it in the studio, Emission section."
                    actions={
                      <Button
                        variant="outline"
                        onClick={() =>
                          router.push(
                            `/tokens/new?id=${token.id}&section=emission`,
                          )
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Contribute it
                      </Button>
                    }
                  />
                )}
              </SectionCard>

              {/* Sources / Provenance */}
              <SectionCard
                title="Sources"
                accent="data_source"
                description="References and provenance"
              >
                {token.data_sources.length > 0 ? (
                  <div className="space-y-3">
                    {token.data_sources.map((source, index) => {
                      const claims = getSourceClaims(token, source.id)
                      return (
                        <div
                          key={index}
                          className="space-y-2 rounded-lg bg-surface-2 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <DataBadge
                              type="data_source"
                              label={source.source_type.replace('_', ' ')}
                              emphasis="outline"
                            />
                            <p className="font-medium">
                              {source.document_name}
                            </p>
                            {source.version && (
                              <span className="text-xs text-faint-foreground">
                                v{source.version}
                              </span>
                            )}
                          </div>

                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 break-all font-mono text-sm text-primary hover:underline"
                          >
                            {source.url.length > 60
                              ? `${source.url.slice(0, 60)}...`
                              : source.url}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>

                          {(source.verified_at || claims.length > 0) && (
                            <div className="space-y-2 border-t border-border/40 pt-2">
                              {source.verified_at && (
                                <p className="text-xs text-faint-foreground">
                                  Verified {formatDate(source.verified_at)}
                                </p>
                              )}
                              {claims.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="shrink-0 text-xs text-muted-foreground">
                                    Used for:
                                  </span>
                                  {claims.map((cs, i) => (
                                    <span
                                      key={i}
                                      className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary"
                                    >
                                      {getClaimLabel(
                                        token,
                                        cs.claim_type,
                                        cs.claim_id,
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No sources yet"
                    description="No reference documents have been attached to this token."
                    onboardingHint="Contribute it in the studio, Sources section."
                    actions={
                      <Button
                        variant="outline"
                        onClick={() =>
                          router.push(
                            `/tokens/new?id=${token.id}&section=sources`,
                          )
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Contribute it
                      </Button>
                    }
                  />
                )}
              </SectionCard>

              {/* Risk flags */}
              <SectionCard
                title="Risk flags"
                accent="risk_flag"
                description="Risk signals identified for this token"
              >
                {token.risk_flags.length > 0 ? (
                  <div className="space-y-3">
                    {token.risk_flags.map((flag) => {
                      const description = getRiskFlagTypeDescription(
                        flag.flag_type,
                      )
                      return (
                        <div
                          key={flag.id}
                          className="space-y-2 rounded-lg bg-surface-2 p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <RiskPill severity={riskSeverity(flag.severity)} />
                            <p className="font-medium">
                              {formatRiskFlagTypeLabel(flag.flag_type)}
                            </p>
                            {!flag.is_flagged && (
                              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                                Cleared
                              </span>
                            )}
                          </div>
                          {description && (
                            <p className="text-xs text-muted-foreground">
                              {description}
                            </p>
                          )}
                          {flag.justification && (
                            <div className="border-t border-border/40 pt-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Justification
                              </p>
                              <p className="mt-0.5 text-sm">
                                {flag.justification}
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No risk flags recorded"
                    description="No risk signals have been identified for this token."
                    onboardingHint="Add a flag in the studio to surface a risk."
                    actions={
                      <Button
                        variant="outline"
                        onClick={() =>
                          router.push(`/tokens/new?id=${token.id}&section=risk`)
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Contribute it
                      </Button>
                    }
                  />
                )}
              </SectionCard>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
