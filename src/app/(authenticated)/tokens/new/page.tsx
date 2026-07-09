'use client'

import { format } from 'date-fns'
import { CalendarIcon, ArrowLeft, ArrowRight, Loader2, Plus, X, AlertCircle, CheckCircle2, Clock, Tag, BarChart2, PieChart, TrendingUp, ShieldAlert } from 'lucide-react'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { StudioSpine, type StudioSectionMeta } from '@/features/studio/studio-spine'
import { StudioGraphPane } from '@/features/studio/studio-graph-pane'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  RISK_FLAG_TYPE_OPTIONS,
  RISK_SEVERITY_OPTIONS,
  getRiskFlagTypeDescription,
  normalizeRiskSeverity,
  formatCategoryLabel,
  formatSectorLabel,
  SOURCE_TYPE_OPTIONS,
} from '@/types/form'
import { cn } from '@/lib/utils'
import { SECTION_LABELS } from '@/components/token-form/form-helpers'
import { TokenFormProvider, useTokenForm } from '@/components/token-form/token-form-context'
import { COMPLETION_STEP } from '@/components/token-form/use-token-form-state'
import { CompletionScreen } from '@/components/token-form/CompletionScreen'
import { RemovalConfirmDialog } from '@/components/token-form/RemovalConfirmDialog'
import { SectionHeader, NotReadySection } from '@/components/token-form/section-chrome'
import { Step1Identity } from '@/components/token-form/steps/Step1Identity'
import { Step2Supply } from '@/components/token-form/steps/Step2Supply'
import { Step3Allocation } from '@/components/token-form/steps/Step3Allocation'
import { Step4Vesting } from '@/components/token-form/steps/Step4Vesting'
import { Step5Emission } from '@/components/token-form/steps/Step5Emission'

export default function NewTokenPage() {
  return (
    <TokenFormProvider>
      <NewTokenPageInner />
    </TokenFormProvider>
  )
}

function NewTokenPageInner() {
  const {
    router,
    isEditMode,
    currentStep,
    tokenId,
    allocations,
    loading,
    loadingTokenData,
    completedSteps,
    setPendingRemoval,
    flashPts,
    flashKey,
    showFlash,
    activeSection,
    autosave,
    step6Form,
    step7Form,
    sourceFields,
    riskFields,
    liveTokenName,
    liveTokenTicker,
    liveChain,
    liveCategory,
    liveSector,
    chainLabel,
    _lw3segs,
    _lw5type,
    _lw6srcs,
    _lw7flags,
    liveIdentityScore,
    liveSupplyScore,
    liveAllocationScore,
    liveVestingScore,
    liveEmissionScore,
    liveSourcesScore,
    liveTotalScore,
    onSubmitStep6,
    onSubmitStep7,
    addSource,
    addRisk,
    goSection,
    prevSectionKey,
    nextSectionKey,
    handleContinue,
    handleFinish,
  } = useTokenForm()

  // Show loading state while loading token data
  if (loadingTokenData) {
    return <GraphLoader className="mx-auto mt-24" label="Loading token data…" />
  }

  const spineSections: StudioSectionMeta[] = [
    { key: 'identity', label: 'Identity', accentVar: '--data-token', tier: 'core', live: liveIdentityScore, max: 20 },
    { key: 'supply', label: 'Supply', accentVar: '--data-supply', tier: 'core', live: liveSupplyScore, max: 15 },
    { key: 'allocation', label: 'Allocation', accentVar: '--data-allocation', tier: 'core', live: liveAllocationScore, max: 20 },
    { key: 'vesting', label: 'Vesting', accentVar: '--data-vesting', tier: 'enrich', live: liveVestingScore, max: 20 },
    { key: 'emission', label: 'Emission', accentVar: '--data-emission', tier: 'enrich', live: liveEmissionScore, max: 10 },
    { key: 'sources', label: 'Sources', accentVar: '--data-source', tier: 'enrich', live: liveSourcesScore, max: 10 },
    { key: 'risk', label: 'Risk flags', accentVar: '--data-risk', tier: 'enrich', live: _lw7flags.length > 0 ? 1 : 0, max: 0, optional: true },
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
    <span aria-live="polite" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
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
          <AlertCircle className="h-3.5 w-3.5 text-warning" aria-hidden /> Fix the errors to save
        </>
      )}
      {autosave.status === 'error' && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden /> Save failed
        </>
      )}
      {autosave.status === 'idle' && (tokenId ? 'Autosave is on' : 'Name + ticker create the draft')}
    </span>
  )

  // ── Completion screen (after the final step is saved) ──────────────────────
  if (currentStep === COMPLETION_STEP) {
    return <CompletionScreen />
  }

  return (
    <div className="mx-auto max-w-6xl pb-16">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => router.push('/tokens')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Tokens
          </button>

          {liveTokenName ? (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold tracking-tight">{liveTokenName}</h1>
                {liveTokenTicker && (
                  <Badge variant="secondary" className="font-mono text-base px-3 py-0.5 h-auto">
                    {liveTokenTicker}
                  </Badge>
                )}
              </div>
              {(liveChain || liveCategory) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {liveChain && chainLabel && (
                    <Badge variant="outline" className="font-normal text-muted-foreground capitalize">
                      {chainLabel}
                    </Badge>
                  )}
                  {liveCategory && (
                    <span className="text-sm text-muted-foreground">
                      {formatCategoryLabel(liveCategory)}
                      {liveSector && ` · ${formatSectorLabel(liveSector)}`}
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {isEditMode ? 'Edit token' : 'Add a token'}
              </h1>
              <p className="text-muted-foreground text-sm">
                Structure the token cluster by cluster. The graph grows as your data lands.
              </p>
            </>
          )}
        </div>

        {/* Mobile score (compact) */}
        <div className="flex-shrink-0 rounded-xl border bg-surface-1 px-4 py-2.5 text-center lg:hidden">
          <div className="relative inline-block">
            <span className="tabular text-xl font-semibold">{liveTotalScore}</span>
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
        <div className="min-w-0 flex-1 space-y-5">

          {/* ── Section 1: Identity ───────────────────────────────────────────── */}
          <Step1Identity />

          {/* ── Section 2: Supply ─────────────────────────────────────────────── */}
          <Step2Supply />

          {/* ── Section 3: Allocation ─────────────────────────────────────────── */}
          <Step3Allocation />

          {/* ── Section 4: Vesting ────────────────────────────────────────────── */}
          <Step4Vesting />

          {/* ── Section 5: Emission ───────────────────────────────────────────── */}
          <Step5Emission />

          {/* ── Section 6: Sources ────────────────────────────────────────────── */}
          <div
            id="section-sources"
            className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'sources' && 'hidden')}
            style={{ borderLeft: '3px solid hsl(var(--data-source))' }}
          >
            <SectionHeader accentVar="--data-source" label="Sources" desc="· Data references & attribution" liveScore={liveSourcesScore} maxScore={10} saved={completedSteps.includes(6)} />
            {!tokenId ? <NotReadySection message="Give the token a name and ticker first. The draft creates itself as you type." action={{ label: 'Go to Identity', section: 'identity' }} /> : (
            <div className="px-6 py-6">
            <Form {...step6Form}>
              <form onSubmit={step6Form.handleSubmit((data) => onSubmitStep6(data))} className="space-y-6">
                {/* Info Banner */}
                {sourceFields.length === 0 && (
                  <div className="flex items-start gap-3 p-4 bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-600 dark:text-yellow-500">No sources added yet</p>
                      <p className="text-muted-foreground">
                        Adding at least one source is highly recommended for data verification and credibility.
                      </p>
                    </div>
                  </div>
                )}

                {/* Data Sources Table */}
                {sourceFields.length > 0 && (
                  <div className="space-y-4">
                    {sourceFields.map((field, index) => (
                      <Card key={field.id} className="relative">
                        <CardContent className="pt-6">
                          {/* Remove button */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => setPendingRemoval({ type: 'source', index })}
                          >
                            <X className="h-4 w-4" />
                          </Button>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Source Type */}
                            <FormField
                              control={step6Form.control}
                              name={`sources.${index}.source_type`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Source Type *</FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select type" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {SOURCE_TYPE_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Document Name */}
                            <FormField
                              control={step6Form.control}
                              name={`sources.${index}.document_name`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Document Name *</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. Tokenomics Whitepaper v2.0" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* URL */}
                            <FormField
                              control={step6Form.control}
                              name={`sources.${index}.url`}
                              render={({ field }) => (
                                <FormItem className="md:col-span-2">
                                  <FormLabel>URL *</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="url"
                                      placeholder="https://..."
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Version */}
                            <FormField
                              control={step6Form.control}
                              name={`sources.${index}.version`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Version (optional)</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g. v2.0, 2024" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Verified Date */}
                            <FormField
                              control={step6Form.control}
                              name={`sources.${index}.verified_at`}
                              render={({ field }) => (
                                <FormItem className="flex flex-col">
                                  <FormLabel>Verification Date (optional)</FormLabel>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <FormControl>
                                        <Button
                                          variant="outline"
                                          className={cn(
                                            'w-full pl-3 text-left font-normal',
                                            !field.value && 'text-muted-foreground'
                                          )}
                                        >
                                          {field.value ? (
                                            format(new Date(field.value), 'PPP')
                                          ) : (
                                            <span>Pick a date</span>
                                          )}
                                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                      </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent
                                      className="z-[90] w-[22rem] max-w-[calc(100vw-2rem)] border-border/80 bg-card/95 p-3 shadow-2xl shadow-black/10 dark:shadow-black/50 backdrop-blur"
                                      align="end"
                                      side="top"
                                      sideOffset={10}
                                      collisionPadding={16}
                                    >
                                      <Calendar
                                        mode="single"
                                        selected={field.value ? new Date(field.value) : undefined}
                                        onSelect={(date) => field.onChange(date?.toISOString())}
                                        captionLayout="dropdown"
                                        fromYear={2000}
                                        toYear={2030}
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                  <FormDescription className="text-xs">
                                    When was this source last verified?
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Add Source Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSource}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Source
                </Button>

                {/* Source Attribution — visible once at least one source has been added */}
                {sourceFields.length > 0 && (() => {
                  const attributions = step6Form.watch('attributions') ?? []

                  const findIdx = (type: string, claimId: string | null) =>
                    attributions.findIndex(a => a.claim_type === type && (a.claim_id ?? null) === claimId)

                  const allocAttrs = attributions
                    .map((a, i) => ({ attr: a, idx: i }))
                    .filter(({ attr }) => attr.claim_type === 'allocation_segment')

                  const vestingAttrs = attributions
                    .map((a, i) => ({ attr: a, idx: i }))
                    .filter(({ attr }) => attr.claim_type === 'vesting_schedule')

                  const tokenIdentityIdx = findIdx('token_identity', null)
                  const supplyIdx = findIdx('supply_metrics', null)
                  const emissionIdx = findIdx('emission_model', null)

                  const renderPills = (attrIdx: number) => {
                    if (attrIdx < 0 || !attributions[attrIdx]) return null
                    const attr = attributions[attrIdx]
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {sourceFields.map((sf, srcIdx) => {
                          const srcLabel = step6Form.watch(`sources.${srcIdx}.document_name`) || `Source ${srcIdx + 1}`
                          const isSelected = attr.data_source_ids.includes(srcIdx.toString())
                          return (
                            <button
                              key={sf.id}
                              type="button"
                              onClick={() => {
                                const current = step6Form.getValues('attributions') ?? []
                                const updated = current.map((a, i) => {
                                  if (i !== attrIdx) return a
                                  const ids = a.data_source_ids.includes(srcIdx.toString())
                                    ? a.data_source_ids.filter(id => id !== srcIdx.toString())
                                    : [...a.data_source_ids, srcIdx.toString()]
                                  return { ...a, data_source_ids: ids }
                                })
                                step6Form.setValue('attributions', updated)
                              }}
                              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                                isSelected
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border text-muted-foreground hover:border-primary/50'
                              }`}
                            >
                              {srcLabel}
                            </button>
                          )
                        })}
                      </div>
                    )
                  }

                  return (
                    <div className="rounded-lg border p-4 space-y-5">
                      {/* Header */}
                      <div>
                        <p className="font-medium text-sm">Source Attribution</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Map each piece of data to its source(s). All optional.
                        </p>
                      </div>

                      {/* Token Identity */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Token Identity</span>
                        </div>
                        <div className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-2">
                          <p className="text-xs text-muted-foreground">Name, ticker, chain, category, contract address</p>
                          {renderPills(tokenIdentityIdx)}
                        </div>
                      </div>

                      <Separator />

                      {/* Supply Metrics */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <BarChart2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supply Metrics</span>
                        </div>
                        <div className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-2">
                          <p className="text-xs text-muted-foreground">Max supply, circulating supply, TGE supply</p>
                          {renderPills(supplyIdx)}
                        </div>
                      </div>

                      {allocAttrs.length > 0 && (
                        <>
                          <Separator />

                          {/* Allocations & Vesting */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-1.5">
                              <PieChart className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Allocations & Vesting</span>
                            </div>
                            <div className="pl-5 space-y-3">
                              {allocAttrs.map(({ attr, idx }) => {
                                const vestingEntry = vestingAttrs.find(v => v.attr.claim_id === attr.claim_id)
                                return (
                                  <div key={attr.claim_id} className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-3">
                                    {/* Group header: allocation name */}
                                    <p className="text-sm font-semibold">{attr.label}</p>

                                    {/* Allocation segment sub-row */}
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium text-muted-foreground">Allocation segment</p>
                                      {renderPills(idx)}
                                    </div>

                                    {/* Vesting schedule sub-row */}
                                    {vestingEntry && (
                                      <div className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">Vesting schedule</p>
                                        {renderPills(vestingEntry.idx)}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </>
                      )}

                      <Separator />

                      {/* Emission Model */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emission Model</span>
                        </div>
                        <div className="rounded-md border border-border/40 bg-muted/20 p-3 space-y-2">
                          <p className="text-xs text-muted-foreground">Inflation type, burn & buyback mechanisms</p>
                          {renderPills(emissionIdx)}
                        </div>
                      </div>
                    </div>
                  )
                })()}

              </form>
            </Form>
            </div>
            )}
          </div>

          {/* ── Section 7: Risk Flags ─────────────────────────────────────────── */}
          <div
            id="section-risk"
            className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'risk' && 'hidden')}
            style={{ borderLeft: '3px solid hsl(var(--data-risk))' }}
          >
            <SectionHeader accentVar="--data-risk" label="Risk flags" desc="· Risk signals & severity" liveScore={_lw7flags.length > 0 ? 1 : 0} maxScore={0} saved={completedSteps.includes(7)} />
            {!tokenId ? <NotReadySection message="Give the token a name and ticker first. The draft creates itself as you type." action={{ label: 'Go to Identity', section: 'identity' }} /> : (
            <div className="px-6 py-6">
            <Form {...step7Form}>
              <form onSubmit={step7Form.handleSubmit((data) => onSubmitStep7(data))} className="space-y-6">
                {/* Info Banner */}
                {riskFields.length === 0 && (
                  <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                    <ShieldAlert className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">No risk flags added yet</p>
                      <p className="text-muted-foreground">
                        Record any risk signals you have identified for this token. This section is optional.
                      </p>
                    </div>
                  </div>
                )}

                {/* Risk Flags Table */}
                {riskFields.length > 0 && (
                  <div className="space-y-4">
                    {riskFields.map((field, index) => {
                      const selectedType = step7Form.watch(`flags.${index}.flag_type`)
                      const typeDescription = getRiskFlagTypeDescription(selectedType)
                      return (
                        <Card key={field.id} className="relative">
                          <CardContent className="pt-6">
                            {/* Remove button */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="absolute top-2 right-2"
                              onClick={() => setPendingRemoval({ type: 'risk', index })}
                            >
                              <X className="h-4 w-4" />
                            </Button>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Risk Type */}
                              <FormField
                                control={step7Form.control}
                                name={`flags.${index}.flag_type`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Risk Type *</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select risk type" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {RISK_FLAG_TYPE_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {typeDescription && (
                                      <FormDescription className="text-xs">
                                        {typeDescription}
                                      </FormDescription>
                                    )}
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {/* Severity */}
                              <FormField
                                control={step7Form.control}
                                name={`flags.${index}.severity`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Severity *</FormLabel>
                                    <Select
                                      onValueChange={(value) => field.onChange(normalizeRiskSeverity(value))}
                                      value={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select severity" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {RISK_SEVERITY_OPTIONS.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {/* Justification */}
                              <FormField
                                control={step7Form.control}
                                name={`flags.${index}.justification`}
                                render={({ field }) => (
                                  <FormItem className="md:col-span-2">
                                    <FormLabel>Justification (optional)</FormLabel>
                                    <FormControl>
                                      <Textarea
                                        placeholder="Explain why this risk applies to the token..."
                                        className="min-h-[80px]"
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {/* Flagged toggle */}
                              <FormField
                                control={step7Form.control}
                                name={`flags.${index}.is_flagged`}
                                render={({ field }) => (
                                  <FormItem className="md:col-span-2 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="space-y-0.5">
                                      <FormLabel className="text-base">Active Flag</FormLabel>
                                      <FormDescription>
                                        Keep this on if the risk currently applies. Turn it off to record a risk that has been cleared.
                                      </FormDescription>
                                    </div>
                                    <FormControl>
                                      <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                      />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}

                {/* Add Risk Flag Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addRisk}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Risk Flag
                </Button>

              </form>
            </Form>
            </div>
            )}
          </div>

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
              <span className="hidden sm:inline">{prevSectionKey ? SECTION_LABELS[prevSectionKey] : 'Back'}</span>
            </Button>
            {autosaveChip}
            {nextSectionKey ? (
              <Button type="button" size="sm" onClick={handleContinue} disabled={loading}>
                <span className="hidden sm:inline">Continue: {SECTION_LABELS[nextSectionKey]}</span>
                <span className="sm:hidden">Continue</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            ) : (
              <Button type="button" size="sm" variant="brand" onClick={handleFinish} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                Finish and review
              </Button>
            )}
          </div>

        </div>{/* end active section column */}

        {/* ── Living graph pane (desktop) ─────────────────────────────────────── */}
        <aside className="sticky top-20 hidden w-72 shrink-0 xl:block">
          <StudioGraphPane
            name={liveTokenName}
            ticker={liveTokenTicker}
            segmentLabels={_lw3segs
              .filter((s) => s.label || s.segment_type || (parseFloat(s.percentage) || 0) > 0)
              .map((s) => s.label)}
            vestingCount={completedSteps.includes(4) ? allocations.length : 0}
            hasEmission={Boolean(_lw5type)}
            sourceCount={_lw6srcs.length}
            riskCount={_lw7flags.length}
          />
        </aside>
      </div>{/* end studio layout */}
      <RemovalConfirmDialog />
    </div>
  )
}
