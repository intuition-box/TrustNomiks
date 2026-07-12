'use client'

import { useState } from 'react'
import {
  Compass,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  buildVestingSeed,
  calculateTokenAmount,
  formatSegmentTypeLabel,
  getSegmentChartColor,
  largestRemainderTo100,
  type CohortBasis,
  type FactoryBenchmarkSnapshot,
  type VestingSeed,
} from '@/lib/tokenomics'
import { useFactoryForm } from './factory-form-context'

const BASIS_LABEL: Record<CohortBasis, string> = {
  sector: 'Sector cohort',
  category: 'Category cohort',
  'all-attested': 'All attested tokens',
  none: 'No cohort',
}

/**
 * The assist: benchmark medians from the validated, attested registry
 * (docs: tasks/factory-plan.md, Phase 2). The panel renders from the design's
 * PERSISTED snapshot so a design always shows the numbers it was built
 * against; "Refresh from market" replaces the snapshot explicitly.
 */
export function BenchmarkPanel({ className }: { className?: string }) {
  const {
    projectId,
    supabase,
    liveSector,
    benchmarkSnapshot,
    setBenchmarkSnapshot,
    goSection,
    step3Form,
    maxSupply,
    queueAutosave,
    pendingVestingSeedsRef,
  } = useFactoryForm()

  const [loading, setLoading] = useState(false)

  const fetchAndPersist = async (bust: boolean) => {
    if (!projectId || !liveSector) return
    try {
      setLoading(true)
      const res = await fetch(
        `/api/factory/benchmarks?sector=${encodeURIComponent(liveSector)}${
          bust ? '&bust=true' : ''
        }`,
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error || 'Failed to load benchmarks')
      }
      const snapshot = (await res.json()) as
        FactoryBenchmarkSnapshot | { cohort: null; reason: string }
      if (snapshot.cohort === null) {
        toast.error('Pick a sector in Identity first.')
        return
      }
      // Persist so the design keeps rendering the numbers it was built
      // against. A direct owner-gated UPDATE that deliberately does NOT touch
      // updated_at: the optimistic lock guards the design's form data, not
      // this advisory cache, and bumping it would CONFLICT open editors.
      const { error } = await supabase
        .from('factory_projects')
        .update({
          benchmark_snapshot: snapshot,
          benchmark_snapshot_at: snapshot.generatedAt,
        })
        .eq('id', projectId)
      if (error) throw error
      setBenchmarkSnapshot(snapshot)
      toast.success(
        bust ? 'Benchmark refreshed from market' : 'Benchmark loaded',
      )
    } catch (error: unknown) {
      console.error('Benchmark fetch failed:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to load benchmarks',
      )
    } finally {
      setLoading(false)
    }
  }

  /** Seed the allocation form from the medians (normalized to exactly 100)
   *  and queue vesting seeds for once the saved rows carry DB ids. */
  const applyBenchmark = () => {
    if (!benchmarkSnapshot) return
    const medians = Object.fromEntries(
      Object.entries(benchmarkSnapshot.allocation).map(([type, stat]) => [
        type,
        stat.medianPct,
      ]),
    )
    const normalized = largestRemainderTo100(medians)
    const entries = Object.entries(normalized)
    if (entries.length === 0) {
      toast.error('This cohort has no allocation medians to apply.')
      return
    }
    const segments = entries.map(([type, pct]) => ({
      id: crypto.randomUUID(),
      segment_type: type,
      label: formatSegmentTypeLabel(type),
      percentage: String(pct),
      token_amount: calculateTokenAmount(String(pct), maxSupply),
      wallet_address: '',
    }))
    step3Form.setValue('segments', segments, {
      shouldDirty: true,
      shouldValidate: true,
    })

    // Vesting schedules are keyed by allocation row ids, which only exist
    // once the allocation save round-trips. Queue the seeds on the shared
    // ref; onSubmitStep3 overlays them right after its step4Form.reset.
    const seeds: Record<string, VestingSeed> = {}
    for (const [type] of entries) {
      const v = benchmarkSnapshot.vesting[type]
      if (v) seeds[type] = buildVestingSeed(v)
    }
    pendingVestingSeedsRef.current = Object.keys(seeds).length ? seeds : null

    queueAutosave()
    goSection('allocation')
    toast.success('Benchmark applied. Review each section and save as you go.')
  }

  if (!projectId) return null

  const snapshot = benchmarkSnapshot
  const allocationEntries = snapshot
    ? Object.entries(snapshot.allocation).sort(
        (a, b) => b[1].medianPct - a[1].medianPct,
      )
    : []

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-1',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <TrendingUp
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden
          />
          Market benchmark
        </h2>
        {snapshot && (
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Users className="h-3 w-3" aria-hidden />
            <span className="tabular">{snapshot.cohort.tokenCount}</span>
          </Badge>
        )}
      </div>

      {!liveSector ? (
        <div className="space-y-3 px-4 py-4 text-xs text-muted-foreground">
          <p>
            Benchmarks compare your design to validated, attested tokens of the
            same sector. Pick a sector to unlock them.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => goSection('identity')}
          >
            <Compass className="h-3.5 w-3.5" aria-hidden />
            Pick a sector in Identity
          </Button>
        </div>
      ) : !snapshot ? (
        <div className="space-y-3 px-4 py-4 text-xs text-muted-foreground">
          <p>
            Pull allocation, vesting and emission medians from the validated
            registry for this sector.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={loading}
            onClick={() => fetchAndPersist(false)}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            )}
            Use benchmark
          </Button>
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          {/* Cohort provenance: basis + confidence, color never alone */}
          <p className="text-xs text-muted-foreground">
            {BASIS_LABEL[snapshot.cohort.basis]}
            {snapshot.cohort.key ? ` · ${snapshot.cohort.key}` : ''} ·{' '}
            <span className="tabular">{snapshot.cohort.tokenCount}</span> tokens
            · {snapshot.cohort.confidence} confidence
          </p>

          {snapshot.cohort.basis === 'none' ? (
            <p className="text-xs text-muted-foreground">
              Not enough attested tokens in this sector yet. Benchmarks unlock
              as the validated registry grows.
            </p>
          ) : (
            <>
              {/* Allocation medians (chart space: segment colors + labels) */}
              {allocationEntries.length > 0 && (
                <ul className="space-y-1.5">
                  {allocationEntries.map(([type, stat]) => (
                    <li
                      key={type}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: getSegmentChartColor(type),
                          }}
                        />
                        <span className="truncate">
                          {formatSegmentTypeLabel(type)}
                        </span>
                      </span>
                      <span className="tabular shrink-0 font-medium">
                        {stat.medianPct}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Vesting + emission medians, compact */}
              {(() => {
                const team =
                  snapshot.vesting['team-founders'] ??
                  Object.values(snapshot.vesting)[0]
                return team ? (
                  <p className="text-xs text-muted-foreground">
                    Typical vesting:{' '}
                    <span className="tabular">{team.cliffMonths ?? 0}</span>m
                    cliff,{' '}
                    <span className="tabular">{team.durationMonths ?? 0}</span>m{' '}
                    {team.frequency ?? 'monthly'},{' '}
                    <span className="tabular">{team.tgePct ?? 0}</span>% at TGE
                  </p>
                ) : null
              })()}
              {snapshot.emission.annualInflationRate && (
                <p className="text-xs text-muted-foreground">
                  Median annual inflation:{' '}
                  <span className="tabular">
                    {snapshot.emission.annualInflationRate.median}
                  </span>
                  %
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="brand"
                  onClick={applyBenchmark}
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Apply benchmark
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={loading}
                  onClick={() => fetchAndPersist(true)}
                  title="Refresh from market"
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  )}
                  <span className="sr-only">Refresh from market</span>
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
