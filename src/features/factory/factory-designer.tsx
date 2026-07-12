'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { GraphLoader } from '@/components/patterns/graph-loader'
import {
  StudioSpine,
  type StudioSectionMeta,
} from '@/features/studio/studio-spine'
import { StudioGraphPane } from '@/features/studio/studio-graph-pane'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/composite/empty-state'
import {
  FACTORY_CLUSTER_MAX,
  formatCategoryLabel,
  formatSectorLabel,
} from '@/lib/tokenomics'
import { FACTORY_SECTION_LABELS, type FactorySectionKey } from './sections'
import { BenchmarkPanel } from './benchmark-panel'
import { useFactoryForm } from './factory-form-context'
import { COMPLETION_STEP } from './use-factory-form-state'
import { FactoryCompletionScreen } from './FactoryCompletionScreen'
import { FactoryRemovalConfirmDialog } from './FactoryRemovalConfirmDialog'
import { IdentityStep } from './steps/IdentityStep'
import { SupplyStep } from './steps/SupplyStep'
import { AllocationStep } from './steps/AllocationStep'
import { VestingStep } from './steps/VestingStep'
import { EmissionStep } from './steps/EmissionStep'
import { FundingStep } from './steps/FundingStep'

/** The Factory builder: same studio grammar as the screener form (spine ·
 *  active section · living graph), over the five tokenomics-core sections. */
export function FactoryDesigner() {
  const {
    router,
    isEditMode,
    currentStep,
    projectId,
    allocations,
    loading,
    loadingProjectData,
    ownershipDenied,
    completedSteps,
    flashPts,
    flashKey,
    showFlash,
    activeSection,
    autosave,
    liveTokenName,
    liveTokenTicker,
    liveCategory,
    liveSector,
    _lw3segs,
    _lw5type,
    _lw6rounds,
    liveIdentityScore,
    liveSupplyScore,
    liveAllocationScore,
    liveVestingScore,
    liveEmissionScore,
    liveTotalScore,
    goSection,
    prevSectionKey,
    nextSectionKey,
    handleContinue,
    handleFinish,
  } = useFactoryForm()

  // Show loading state while loading design data
  if (loadingProjectData) {
    return <GraphLoader className="mx-auto mt-24" label="Loading design…" />
  }

  // Ownership guard: the loaded design belongs to another contributor.
  if (ownershipDenied) {
    return (
      <div className="mx-auto mt-16 max-w-xl">
        <EmptyState
          title="You can only edit designs you created"
          description="This design belongs to another contributor. Designs are private to their creator."
          actions={
            <Button variant="brand" size="sm" asChild>
              <Link href="/factory">Back to Factory</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const spineSections: StudioSectionMeta<FactorySectionKey>[] = [
    {
      key: 'identity',
      label: 'Identity',
      accentVar: '--data-token',
      tier: 'core',
      live: liveIdentityScore,
      max: FACTORY_CLUSTER_MAX.identity,
    },
    {
      key: 'supply',
      label: 'Supply',
      accentVar: '--data-supply',
      tier: 'core',
      live: liveSupplyScore,
      max: FACTORY_CLUSTER_MAX.supply,
    },
    {
      key: 'allocation',
      label: 'Allocation',
      accentVar: '--data-allocation',
      tier: 'core',
      live: liveAllocationScore,
      max: FACTORY_CLUSTER_MAX.allocation,
    },
    {
      key: 'vesting',
      label: 'Vesting',
      accentVar: '--data-vesting',
      tier: 'enrich',
      live: liveVestingScore,
      max: FACTORY_CLUSTER_MAX.vesting,
    },
    {
      key: 'emission',
      label: 'Emission',
      accentVar: '--data-emission',
      tier: 'enrich',
      live: liveEmissionScore,
      max: FACTORY_CLUSTER_MAX.emission,
    },
    {
      key: 'funding',
      label: 'Funding',
      accentVar: '--data-wallet',
      tier: 'enrich',
      live: _lw6rounds.length > 0 ? 1 : 0,
      max: 0,
      optional: true,
    },
  ]

  const savedAgoLabel = (() => {
    if (!autosave.at) return ''
    // eslint-disable-next-line react-hooks/purity -- intentional wall-clock read for a "Saved Xs ago" label; refreshed by the chipTick interval, not a correctness concern
    const seconds = Math.max(0, Math.round((Date.now() - autosave.at) / 1000))
    if (seconds < 30) return 'just now'
    if (seconds < 90) return 'a minute ago'
    return `${Math.round(seconds / 60)}m ago`
  })()

  const autosaveChip = (
    <span
      aria-live="polite"
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
    >
      {autosave.status === 'saving' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
        </>
      )}
      {autosave.status === 'saved' && (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
          <span className="truncate">Saved {savedAgoLabel}</span>
        </>
      )}
      {autosave.status === 'pending' && (
        <>
          <Clock className="h-3.5 w-3.5" aria-hidden /> Unsaved changes
        </>
      )}
      {autosave.status === 'invalid' && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-warning" aria-hidden /> Fix
          the errors to save
        </>
      )}
      {autosave.status === 'error' && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />{' '}
          Save failed
        </>
      )}
      {autosave.status === 'idle' &&
        (projectId ? 'Autosave is on' : 'Name + ticker create the draft')}
    </span>
  )

  // ── Completion screen (after the final section is saved) ───────────────────
  if (currentStep === COMPLETION_STEP) {
    return <FactoryCompletionScreen />
  }

  return (
    <div className="mx-auto max-w-6xl pb-16">
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => router.push('/factory')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Factory
          </button>

          {liveTokenName ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold tracking-tight">
                  {liveTokenName}
                </h1>
                {liveTokenTicker && (
                  <Badge
                    variant="secondary"
                    className="font-mono text-base px-3 py-0.5 h-auto"
                  >
                    {liveTokenTicker}
                  </Badge>
                )}
              </div>
              {liveCategory && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">
                    {formatCategoryLabel(liveCategory)}
                    {liveSector && ` · ${formatSectorLabel(liveSector)}`}
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {isEditMode ? 'Edit design' : 'New design'}
              </h1>
              <p className="text-muted-foreground text-sm">
                Design the token cluster by cluster. The graph grows as your
                choices land.
              </p>
            </>
          )}
        </div>

        {/* Mobile score (compact) */}
        <div className="flex-shrink-0 rounded-xl border bg-surface-1 px-4 py-2.5 text-center lg:hidden">
          <div className="relative inline-block">
            <span className="tabular text-xl font-semibold">
              {liveTotalScore}
            </span>
            {showFlash && (
              <span
                key={flashKey}
                className="absolute -top-5 left-1/2 -translate-x-1/2 select-none whitespace-nowrap text-xs font-semibold text-success"
                style={{ animation: 'score-flash 1.4s ease-out forwards' }}
              >
                +{flashPts}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">/ 100</p>
        </div>
      </div>

      {/* Mobile section rail */}
      <div className="mb-4 lg:hidden">
        <StudioSpine
          orientation="horizontal"
          sections={spineSections}
          active={activeSection}
          onSelect={goSection}
          score={liveTotalScore}
        />
      </div>

      {/* ── Studio layout: spine · active section · living graph ─────────────── */}
      <div className="flex items-start gap-6">
        {/* Spine (desktop) */}
        <aside className="sticky top-20 hidden w-60 shrink-0 lg:block">
          <StudioSpine
            sections={spineSections}
            active={activeSection}
            onSelect={goSection}
            score={liveTotalScore}
            flash={{ pts: flashPts, key: flashKey, show: showFlash }}
          />
        </aside>

        {/* ── Active section ──────────────────────────────────────────────────── */}
        <div className="action-bar-clearance min-w-0 flex-1 space-y-5">
          <IdentityStep />
          <SupplyStep />
          <AllocationStep />
          <VestingStep />
          <EmissionStep />
          <FundingStep />

          {/* ── Studio footer: previous · autosave chip · continue / finish ───── */}
          <div className="glass sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 shadow-lg">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!prevSectionKey}
              onClick={() => prevSectionKey && goSection(prevSectionKey)}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">
                {prevSectionKey
                  ? FACTORY_SECTION_LABELS[prevSectionKey]
                  : 'Back'}
              </span>
            </Button>
            {autosaveChip}
            {nextSectionKey ? (
              <Button
                type="button"
                size="sm"
                onClick={handleContinue}
                disabled={loading}
              >
                <span className="hidden sm:inline">
                  Continue: {FACTORY_SECTION_LABELS[nextSectionKey]}
                </span>
                <span className="sm:hidden">Continue</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="brand"
                onClick={handleFinish}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                )}
                Finish and review
              </Button>
            )}
          </div>
        </div>
        {/* end active section column */}

        {/* ── Living graph pane (desktop) ─────────────────────────────────────── */}
        <aside className="sticky top-20 hidden w-72 shrink-0 space-y-4 xl:block">
          <BenchmarkPanel />
          <StudioGraphPane
            name={liveTokenName}
            ticker={liveTokenTicker}
            segmentLabels={_lw3segs
              .filter(
                (s) =>
                  s.label ||
                  s.segment_type ||
                  (parseFloat(s.percentage) || 0) > 0,
              )
              .map((s) => s.label)}
            vestingCount={completedSteps.includes(4) ? allocations.length : 0}
            hasEmission={Boolean(_lw5type)}
            sourceCount={0}
            riskCount={0}
            showAttestationSlots={false}
          />
        </aside>
      </div>
      {/* end studio layout */}
      <FactoryRemovalConfirmDialog />
    </div>
  )
}
