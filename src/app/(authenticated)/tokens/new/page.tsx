'use client'

import { format } from 'date-fns'
import { CalendarIcon, ArrowLeft, ArrowRight, Loader2, Plus, X, AlertCircle, CheckCircle2, Clock, CircleHelp, Tag, BarChart2, PieChart, TrendingUp, ShieldAlert, Sparkles } from 'lucide-react'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { StudioSpine, type StudioSectionKey, type StudioSectionMeta } from '@/features/studio/studio-spine'
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  RISK_FLAG_TYPE_OPTIONS,
  RISK_SEVERITY_OPTIONS,
  getRiskFlagTypeDescription,
  normalizeRiskSeverity,
  BLOCKCHAIN_OPTIONS,
  CATEGORY_OPTIONS,
  isSectorCompatibleWithCategory,
  SEGMENT_TYPE_OPTIONS,
  VESTING_FREQUENCY_OPTIONS,
  formatSegmentTypeLabel,
  formatCategoryLabel,
  formatSectorLabel,
  EMISSION_TYPE_OPTIONS,
  SOURCE_TYPE_OPTIONS,
} from '@/types/form'
import { cn } from '@/lib/utils'
import { CoinGeckoSearch } from '@/components/coingecko-search'
import {
  SECTION_LABELS,
  formatNumber,
  calculateTokenAmount,
  calculatePercentage,
  formatTokenAmount,
} from '@/components/token-form/form-helpers'
import { TokenFormProvider, useTokenForm } from '@/components/token-form/token-form-context'
import { COMPLETION_STEP } from '@/components/token-form/use-token-form-state'

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
    maxSupply,
    allocations,
    loading,
    loadingTokenData,
    finalScore,
    completedSteps,
    identityGuideTarget,
    segmentGuideRowIndex,
    setSegmentGuideRowIndex,
    pendingRemoval,
    setPendingRemoval,
    flashPts,
    flashKey,
    showFlash,
    activeSection,
    autosave,
    step1Form,
    step2Form,
    step3Form,
    step4Form,
    step5Form,
    step6Form,
    step7Form,
    fields,
    remove,
    sourceFields,
    removeSource,
    riskFields,
    removeRisk,
    selectedCategoryOption,
    sectorOptions,
    totalPercentage,
    delta,
    isComplete,
    sealKey,
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
    onSubmitStep1,
    onSubmitStep2,
    onSubmitStep3,
    onSubmitStep4,
    onSubmitStep5,
    onSubmitStep6,
    onSubmitStep7,
    openIdentityGuide,
    closeIdentityGuide,
    applyCategoryFromGuide,
    applySectorFromGuide,
    addSegment,
    openSegmentGuide,
    closeSegmentGuide,
    applySegmentTypeFromGuide,
    preventScrollChange,
    selectInputValue,
    handleFrequencyChange,
    addSource,
    addRisk,
    goSection,
    prevSectionKey,
    nextSectionKey,
    handleContinue,
    handleFinish,
    autofillFromCoinGecko,
    normalizeAllocations,
  } = useTokenForm()

  // Show loading state while loading token data
  if (loadingTokenData) {
    return <GraphLoader className="mx-auto mt-24" label="Loading token data…" />
  }

  // ── Helpers for section rendering ──────────────────────────────────────────
  const sectionHeader = (
    accentVar: string,
    label: string,
    desc: string,
    liveScore: number,
    maxScore: number,
    saved: boolean,
  ) => {
    const color = `hsl(var(${accentVar}))`
    return (
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <div>
            <h2 className="inline text-xs font-bold uppercase tracking-widest" style={{ color }}>
              {label}
            </h2>
            <span className="ml-2 text-xs text-muted-foreground">{desc}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && <CheckCircle2 className="h-3.5 w-3.5 opacity-70" style={{ color }} aria-hidden />}
          <span
            className={cn('tabular font-mono text-xs font-semibold', liveScore === 0 && maxScore > 0 && 'text-muted-foreground/40')}
            style={liveScore > 0 ? { color } : undefined}
          >
            {maxScore > 0 ? `${liveScore} / ${maxScore} pts` : 'optional'}
          </span>
        </div>
      </div>
    )
  }

  // Guidance instead of a padlock: sections are never locked, they explain
  // what they need and offer the shortcut (docs/redesign/08 §6).
  const notReadySection = (message: string, action?: { label: string; section: StudioSectionKey }) => (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {action && (
        <Button type="button" variant="outline" size="sm" onClick={() => goSection(action.section)}>
          {action.label}
        </Button>
      )}
    </div>
  )

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
    return (
      <div className="mx-auto max-w-2xl pb-16 pt-8">
        <div className="overflow-hidden rounded-xl border bg-surface-1">
          <div className="space-y-4 px-8 py-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-8 w-8 text-success" aria-hidden />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {step1Form.getValues('name') || 'Token'} is structured
            </h1>
            <p className="text-sm text-muted-foreground">
              Its data now lives in the TrustNomiks graph, ready to review, validate and publish on-chain.
            </p>
          </div>

          <div className="space-y-4 px-8 pb-8">
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                <span className="text-sm font-medium">Token</span>
                <span className="font-semibold">
                  {step1Form.getValues('name')}{' '}
                  <span className="font-mono text-primary">{step1Form.getValues('ticker')}</span>
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-surface-2 px-4 py-3">
                <span className="text-sm font-medium">Completeness</span>
                <span className="tabular text-base font-semibold">
                  {finalScore !== null ? `${finalScore} / 100` : 'Calculating…'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              {tokenId && (
                <Button variant="brand" className="flex-1" size="lg" onClick={() => router.push(`/tokens/${tokenId}`)}>
                  Open token to publish
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              )}
              <Button variant="outline" className="flex-1" size="lg" onClick={() => router.push('/tokens')}>
                Back to tokens
              </Button>
              <Button variant="outline" className="flex-1" size="lg" onClick={() => router.push('/tokens/new')}>
                <Plus className="h-4 w-4" aria-hidden />
                Add another
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
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
          <div
            id="section-identity"
            className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'identity' && 'hidden')}
            style={{ borderLeft: '3px solid hsl(var(--data-token))' }}
          >
            {sectionHeader('--data-token', 'Identity', '· Token identification', liveIdentityScore, 20, completedSteps.includes(1))}
            <div className="px-6 py-6">
            <Form {...step1Form}>
              <form onSubmit={step1Form.handleSubmit((data) => onSubmitStep1(data))} className="space-y-6">
                {/* Project Name */}
                <FormField
                  control={step1Form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Uniswap" {...field} />
                      </FormControl>
                      <FormDescription>
                        The official name of the token project
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Ticker */}
                <FormField
                  control={step1Form.control}
                  name="ticker"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ticker Symbol *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. UNI"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormDescription>
                        The token&apos;s ticker symbol (automatically converted to uppercase)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {/* Blockchain */}
                  <FormField
                    control={step1Form.control}
                    name="chain"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Blockchain</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select blockchain" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {BLOCKCHAIN_OPTIONS.map((option) => (
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

                  <div className="space-y-4">
                    {/* Category */}
                    <FormField
                      control={step1Form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <FormLabel className="mb-0">Category</FormLabel>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openIdentityGuide('category')}
                            >
                              <CircleHelp className="mr-1 h-3.5 w-3.5" />
                              Guide
                            </Button>
                          </div>
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value)
                              const currentSector = step1Form.getValues('sector')
                              if (currentSector && !isSectorCompatibleWithCategory(value, currentSector)) {
                                step1Form.setValue('sector', undefined, {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                  shouldTouch: true,
                                })
                              }
                            }}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {CATEGORY_OPTIONS.map((option) => (
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

                    {/* Sector */}
                    <FormField
                      control={step1Form.control}
                      name="sector"
                      render={({ field }) => (
                        <FormItem>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <FormLabel className="mb-0">Sector</FormLabel>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => openIdentityGuide('sector')}
                            >
                              <CircleHelp className="mr-1 h-3.5 w-3.5" />
                              Guide
                            </Button>
                          </div>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={!selectedCategoryOption}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select sector" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {sectorOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!selectedCategoryOption && (
                            <FormDescription className="text-xs">
                              Select a category first.
                            </FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <Sheet
                  open={identityGuideTarget !== null}
                  onOpenChange={(open) => {
                    if (!open) closeIdentityGuide()
                  }}
                >
                  <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
                    <SheetHeader>
                      <SheetTitle>
                        {identityGuideTarget === 'sector' ? 'Sector Guide' : 'Category Guide'}
                      </SheetTitle>
                      <SheetDescription>
                        {identityGuideTarget === 'sector'
                          ? 'Choose a sector linked to the right parent category.'
                          : 'Choose the category that best describes this project.'}
                      </SheetDescription>
                    </SheetHeader>

                    {identityGuideTarget === 'category' && (
                      <div className="mt-6 space-y-3">
                        {CATEGORY_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
                            onClick={() => applyCategoryFromGuide(option.value)}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold">{option.label}</p>
                              <Badge variant="outline" className="font-mono text-[11px]">
                                {option.value}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                              {option.description}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}

                    {identityGuideTarget === 'sector' && (
                      <div className="mt-6 space-y-4">
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Parent Category
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {CATEGORY_OPTIONS.map((option) => (
                              <Button
                                key={option.value}
                                type="button"
                                size="sm"
                                variant={selectedCategoryOption?.value === option.value ? 'default' : 'outline'}
                                onClick={() => applyCategoryFromGuide(option.value, false)}
                              >
                                {option.label}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {!selectedCategoryOption ? (
                          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                            Select a parent category to see the available sectors.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {sectorOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
                                onClick={() => applySectorFromGuide(option.value)}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-semibold">{option.label}</p>
                                  <Badge variant="outline" className="font-mono text-[11px]">
                                    {option.value}
                                  </Badge>
                                </div>
                                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                  {option.description}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </SheetContent>
                </Sheet>

                {/* Contract Address */}
                <FormField
                  control={step1Form.control}
                  name="contract_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contract Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="0x..."
                          {...field}
                          className="font-mono text-sm"
                        />
                      </FormControl>
                      <FormDescription>
                        The token&apos;s smart contract address (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* CoinGecko Link */}
                <FormField
                  control={step1Form.control}
                  name="coingecko_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CoinGecko Link</FormLabel>
                      <FormControl>
                        <CoinGeckoSearch
                          value={field.value || null}
                          onSelect={(coin) => {
                            field.onChange(coin?.id ?? '')
                            step1Form.setValue('coingecko_image', coin?.thumb ?? '')
                            if (coin) void autofillFromCoinGecko(coin.id)
                          }}
                          chain={step1Form.watch('chain')}
                          contractAddress={step1Form.watch('contract_address')}
                        />
                      </FormControl>
                      <FormDescription>
                        Link this token to CoinGecko for real-time price data (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* TGE Date */}
                <FormField
                  control={step1Form.control}
                  name="tge_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>TGE Date (Token Generation Event)</FormLabel>
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
                          align="start"
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
                      <FormDescription>
                        The date when tokens were first generated (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notes */}
                <FormField
                  control={step1Form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional notes about this token..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </form>
            </Form>
            </div>
          </div>

          {/* ── Section 2: Supply ─────────────────────────────────────────────── */}
          <div
            id="section-supply"
            className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'supply' && 'hidden')}
            style={{ borderLeft: '3px solid hsl(var(--data-supply))' }}
          >
            {sectionHeader('--data-supply', 'Supply', '· Token supply metrics', liveSupplyScore, 15, completedSteps.includes(2))}
            {!tokenId ? notReadySection('Give the token a name and ticker first. The draft creates itself as you type.', { label: 'Go to Identity', section: 'identity' }) : (
            <div className="px-6 py-6">
            <Form {...step2Form}>
              <form onSubmit={step2Form.handleSubmit((data) => onSubmitStep2(data))} className="space-y-6">
                {/* Max Supply */}
                <FormField
                  control={step2Form.control}
                  name="max_supply"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Supply</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. 1,000,000,000"
                          {...field}
                          onDoubleClick={selectInputValue}
                          onChange={(e) => {
                            const formatted = formatNumber(e.target.value)
                            field.onChange(formatted)
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        The maximum total supply of tokens (use commas for readability)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Initial Supply */}
                <FormField
                  control={step2Form.control}
                  name="initial_supply"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Initial Supply</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. 500,000,000"
                          {...field}
                          onDoubleClick={selectInputValue}
                          onChange={(e) => {
                            const formatted = formatNumber(e.target.value)
                            field.onChange(formatted)
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        The initial minted supply at launch (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* TGE Supply */}
                <FormField
                  control={step2Form.control}
                  name="tge_supply"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>TGE Supply</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. 100,000,000"
                          {...field}
                          onDoubleClick={selectInputValue}
                          onChange={(e) => {
                            const formatted = formatNumber(e.target.value)
                            field.onChange(formatted)
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        Tokens available at Token Generation Event (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Circulating Supply */}
                  <FormField
                    control={step2Form.control}
                    name="circulating_supply"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Circulating Supply</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. 250,000,000"
                            {...field}
                            onDoubleClick={selectInputValue}
                            onChange={(e) => {
                              const formatted = formatNumber(e.target.value)
                              field.onChange(formatted)
                            }}
                          />
                        </FormControl>
                        <FormDescription>Current circulating supply</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Circulating Date */}
                  <FormField
                    control={step2Form.control}
                    name="circulating_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Circulating Date</FormLabel>
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
                            align="start"
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
                        <FormDescription>Date of circulating data</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Source URL */}
                <FormField
                  control={step2Form.control}
                  name="source_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Source URL</FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          placeholder="https://..."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Link to the source of this supply data (optional)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notes */}
                <FormField
                  control={step2Form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional notes about supply metrics..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </form>
            </Form>
            </div>
            )}
          </div>

          {/* ── Section 3: Allocation ─────────────────────────────────────────── */}
          <div
            id="section-allocation"
            className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'allocation' && 'hidden')}
            style={{ borderLeft: '3px solid hsl(var(--data-allocation))' }}
          >
            {sectionHeader('--data-allocation', 'Allocation', '· Token distribution', liveAllocationScore, 20, completedSteps.includes(3))}
            {!tokenId ? notReadySection('Give the token a name and ticker first. The draft creates itself as you type.', { label: 'Go to Identity', section: 'identity' }) : (
            <div className="px-6 py-6">
            <Form {...step3Form}>
              <form onSubmit={step3Form.handleSubmit((data) => onSubmitStep3(data))} className="space-y-6">
                {/* Live sum bar: the soft allocation gate (docs/redesign/08 §6) */}
                {(() => {
                  const sumColor = isComplete
                    ? 'hsl(var(--success))'
                    : totalPercentage > 100
                      ? 'hsl(var(--destructive))'
                      : 'hsl(var(--warning))'
                  return (
                    <div
                      key={sealKey}
                      className="space-y-2 rounded-lg border bg-surface-2/60 p-4"
                      style={
                        isComplete && sealKey > 0
                          ? {
                              animation:
                                'stake-swell var(--dur-slow, 320ms) var(--ease-spring, cubic-bezier(0.34,1.56,0.64,1))',
                            }
                          : undefined
                      }
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">Total allocated</span>
                        <span className="tabular inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: sumColor }}>
                          {isComplete ? (
                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                          ) : (
                            <AlertCircle className="h-4 w-4" aria-hidden />
                          )}
                          {totalPercentage.toFixed(2)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width,background-color] duration-300"
                          style={{ width: `${Math.min(100, totalPercentage)}%`, backgroundColor: sumColor }}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span aria-live="polite">
                          {isComplete
                            ? 'Fully allocated: worth the full 10 points.'
                            : delta > 0
                              ? `${delta.toFixed(2)}% left to allocate. Saving works anytime; reaching 100% earns the full points.`
                              : `${Math.abs(delta).toFixed(2)}% over 100. Adjust the percentages or normalize.`}
                        </span>
                        {!isComplete && totalPercentage > 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={normalizeAllocations}
                          >
                            <Sparkles className="h-3.5 w-3.5" aria-hidden />
                            Normalize to 100%
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Allocation Segments Table */}
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <Card key={field.id} className="relative">
                      <CardContent className="pt-6">
                        {/* Remove button */}
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => setPendingRemoval({ type: 'allocation', index })}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Segment Type */}
                          <FormField
                            control={step3Form.control}
                            name={`segments.${index}.segment_type`}
                            render={({ field }) => (
                              <FormItem>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <FormLabel className="mb-0">Segment Type *</FormLabel>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => openSegmentGuide(index)}
                                  >
                                    <CircleHelp className="mr-1 h-3.5 w-3.5" />
                                    Guide
                                  </Button>
                                </div>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {SEGMENT_TYPE_OPTIONS.map((option) => (
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

                          {/* Label */}
                          <FormField
                            control={step3Form.control}
                            name={`segments.${index}.label`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Label *</FormLabel>
                                <FormControl>
                                  <Input placeholder="e.g. Early Backers" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Percentage */}
                          <FormField
                            control={step3Form.control}
                            name={`segments.${index}.percentage`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Percentage of Max Supply *</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    onWheel={preventScrollChange}
                                    onDoubleClick={selectInputValue}
                                    placeholder="e.g. 15.5"
                                    {...field}
                                    onChange={(e) => {
                                      field.onChange(e.target.value)
                                      // Update token amount when percentage changes
                                      const tokenAmount = calculateTokenAmount(e.target.value, maxSupply)
                                      step3Form.setValue(`segments.${index}.token_amount`, tokenAmount, { shouldValidate: false })
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Token Amount (editable, auto-calculated) */}
                          <FormField
                            control={step3Form.control}
                            name={`segments.${index}.token_amount`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Token Amount (optional)</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder="Auto-calculated or enter manually"
                                    onChange={(e) => {
                                      field.onChange(e.target.value)
                                      // Update percentage when token amount changes
                                      const percentage = calculatePercentage(e.target.value, maxSupply)
                                      if (percentage) {
                                        step3Form.setValue(`segments.${index}.percentage`, percentage, { shouldValidate: false })
                                      }
                                    }}
                                  />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  Auto-calculated from percentage, or edit manually
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Wallet Address */}
                          <FormField
                            control={step3Form.control}
                            name={`segments.${index}.wallet_address`}
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>Wallet Address (optional)</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="0x..."
                                    {...field}
                                    className="font-mono text-sm"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Sheet
                  open={segmentGuideRowIndex !== null}
                  onOpenChange={(open) => {
                    if (!open) closeSegmentGuide()
                  }}
                >
                  <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
                    <SheetHeader>
                      <SheetTitle>Allocation Segment Guide</SheetTitle>
                      <SheetDescription>
                        Pick the segment type that best matches this allocation.
                        {segmentGuideRowIndex !== null ? ` Applying to segment #${segmentGuideRowIndex + 1}.` : ''}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-3">
                      {SEGMENT_TYPE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted"
                          onClick={() => applySegmentTypeFromGuide(option.value)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold">{option.label}</p>
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {option.value}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {option.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Add Segment Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSegment}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Segment
                </Button>

              </form>
            </Form>
            </div>
            )}
          </div>

          {/* ── Section 4: Vesting ────────────────────────────────────────────── */}
          <div
            id="section-vesting"
            className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'vesting' && 'hidden')}
            style={{ borderLeft: '3px solid hsl(var(--data-vesting))' }}
          >
            {sectionHeader('--data-vesting', 'Vesting', '· Unlock schedules', liveVestingScore, 20, completedSteps.includes(4))}
            {!tokenId ? notReadySection('Give the token a name and ticker first. The draft creates itself as you type.', { label: 'Go to Identity', section: 'identity' }) :
             !completedSteps.includes(3) ? notReadySection('Vesting schedules are built from your allocation segments. Add allocations first.', { label: 'Go to Allocation', section: 'allocation' }) : (
            <div className="px-6 py-6">
            {allocations.length === 0 ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Loading allocation segments...</p>
              </div>
            ) : (
              <Form {...step4Form}>
                <form onSubmit={step4Form.handleSubmit((data) => onSubmitStep4(data))} className="space-y-6">
                  {/* Info Banner */}
                  <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                    <Clock className="h-5 w-5 text-primary mt-0.5" />
                    <div className="text-sm space-y-1">
                      <p className="font-medium">Configure vesting for {allocations.length} segments</p>
                      <p className="text-muted-foreground">
                        Liquidity, Airdrop, and Funding Public segments are pre-filled with immediate vesting (100% at TGE).
                        Adjust as needed for your tokenomics.
                      </p>
                    </div>
                  </div>

                  {/* Vesting Schedules Accordion */}
                  {/* eslint-disable @typescript-eslint/no-explicit-any -- react-hook-form FieldPath cannot resolve dynamic Record<string,...> keys */}
                  <Accordion type="multiple" className="space-y-4">
                    {allocations.map((allocation) => {
                      const scheduleKey = `schedules.${allocation.id}`
                      const currentFrequency = step4Form.watch(`${scheduleKey}.frequency` as any)
                      const isImmediate = currentFrequency === 'immediate'

                      return (
                        <AccordionItem
                          key={allocation.id}
                          value={allocation.id}
                          className="border rounded-lg px-4"
                        >
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex w-full flex-col gap-3 pr-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex flex-wrap items-center gap-3">
                                <Badge variant="outline" className="font-mono">
                                  {formatSegmentTypeLabel(allocation.segment_type)}
                                </Badge>
                                <span className="font-medium">{allocation.label}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                                <span>{allocation.percentage}%</span>
                                <span className="font-mono">{formatTokenAmount(allocation.token_amount)}</span>
                                {isImmediate && (
                                  <Badge className="bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-500 border-green-500/20">
                                    Immediate
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-4 pb-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Frequency */}
                              <FormField
                                control={step4Form.control}
                                name={`${scheduleKey}.frequency` as any}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Vesting Frequency</FormLabel>
                                    <Select
                                      onValueChange={(value) => {
                                        field.onChange(value)
                                        handleFrequencyChange(allocation.id, value)
                                      }}
                                      defaultValue={field.value}
                                    >
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select frequency" />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        {VESTING_FREQUENCY_OPTIONS.map((option) => (
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

                              {/* TGE Unlock */}
                              <FormField
                                control={step4Form.control}
                                name={`${scheduleKey}.tge_percentage` as any}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>TGE Unlock (%)</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        placeholder="e.g. 10"
                                        onWheel={preventScrollChange}
                                        onDoubleClick={selectInputValue}
                                        {...field}
                                        disabled={isImmediate}
                                      />
                                    </FormControl>
                                    <FormDescription className="text-xs">
                                      Percentage unlocked immediately at TGE
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {/* Cliff Months */}
                              <FormField
                                control={step4Form.control}
                                name={`${scheduleKey}.cliff_months` as any}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Cliff Period (months)</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        placeholder="e.g. 6"
                                        onWheel={preventScrollChange}
                                        onDoubleClick={selectInputValue}
                                        {...field}
                                        disabled={isImmediate}
                                      />
                                    </FormControl>
                                    <FormDescription className="text-xs">
                                      Lock period before vesting starts
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {/* Cliff Unlock Percentage */}
                              <FormField
                                control={step4Form.control}
                                name={`${scheduleKey}.cliff_unlock_percentage` as any}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Cliff Unlock (%)</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="100"
                                        placeholder="e.g. 15"
                                        onWheel={preventScrollChange}
                                        onDoubleClick={selectInputValue}
                                        {...field}
                                        disabled={isImmediate}
                                      />
                                    </FormControl>
                                    <FormDescription className="text-xs">
                                      Percentage released when cliff ends
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {/* Duration Months */}
                              <FormField
                                control={step4Form.control}
                                name={`${scheduleKey}.duration_months` as any}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Vesting Duration (months)</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="number"
                                        min="0"
                                        placeholder="e.g. 24"
                                        onWheel={preventScrollChange}
                                        onDoubleClick={selectInputValue}
                                        {...field}
                                        disabled={isImmediate}
                                      />
                                    </FormControl>
                                    <FormDescription className="text-xs">
                                      Total vesting period after cliff
                                    </FormDescription>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {/* Notes */}
                              <FormField
                                control={step4Form.control}
                                name={`${scheduleKey}.notes` as any}
                                render={({ field }) => (
                                  <FormItem className="md:col-span-2">
                                    <FormLabel>Notes</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="Additional vesting details..."
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            {/* Vesting Summary */}
                            {!isImmediate && (
                              <div className="mt-4 p-3 bg-muted/50 rounded-md text-sm">
                                <p className="font-medium mb-1">Vesting Summary:</p>
                                <p className="text-muted-foreground">
                                  {step4Form.watch(`${scheduleKey}.tge_percentage` as any) || '0'}% unlocked at TGE
                                  {step4Form.watch(`${scheduleKey}.cliff_months` as any) ? `, then ${step4Form.watch(`${scheduleKey}.cliff_months` as any)} month cliff` : ''}
                                  {step4Form.watch(`${scheduleKey}.cliff_unlock_percentage` as any) ? ` (${step4Form.watch(`${scheduleKey}.cliff_unlock_percentage` as any)}% released at cliff end)` : ''}
                                  {step4Form.watch(`${scheduleKey}.duration_months` as any) ? `, followed by ${step4Form.watch(`${scheduleKey}.duration_months` as any)} months of ${currentFrequency || 'monthly'} vesting` : ''}
                                </p>
                              </div>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                  {/* eslint-enable @typescript-eslint/no-explicit-any */}

                </form>
              </Form>
            )}
            </div>
            )}
          </div>

          {/* ── Section 5: Emission ───────────────────────────────────────────── */}
          <div
            id="section-emission"
            className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'emission' && 'hidden')}
            style={{ borderLeft: '3px solid hsl(var(--data-emission))' }}
          >
            {sectionHeader('--data-emission', 'Emission', '· Inflation & economic mechanisms', liveEmissionScore, 10, completedSteps.includes(5))}
            {!tokenId ? notReadySection('Give the token a name and ticker first. The draft creates itself as you type.', { label: 'Go to Identity', section: 'identity' }) : (
            <div className="px-6 py-6">
            <Form {...step5Form}>
              <form onSubmit={step5Form.handleSubmit((data) => onSubmitStep5(data))} className="space-y-6">
                {/* Emission Type */}
                <FormField
                  control={step5Form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emission Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select emission type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {EMISSION_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        How the token supply changes over time
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Annual Inflation Rate */}
                <FormField
                  control={step5Form.control}
                  name="annual_inflation_rate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Annual Inflation Rate (%)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="e.g. 2.5"
                          onWheel={preventScrollChange}
                          onDoubleClick={selectInputValue}
                          {...field}
                          disabled={step5Form.watch('type') === 'fixed_cap'}
                        />
                      </FormControl>
                      <FormDescription>
                        Fixed inflation rate per year (disabled for fixed cap tokens)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Burn Mechanism */}
                <div className="space-y-4 p-4 border rounded-lg">
                  <FormField
                    control={step5Form.control}
                    name="has_burn"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Burn Mechanism</FormLabel>
                          <FormDescription>
                            Does this token have a burn mechanism?
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

                  {step5Form.watch('has_burn') && (
                    <FormField
                      control={step5Form.control}
                      name="burn_details"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Burn Details</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe the burn mechanism (e.g., % of fees burned, manual burns, etc.)"
                              className="min-h-[80px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Buyback Mechanism */}
                <div className="space-y-4 p-4 border rounded-lg">
                  <FormField
                    control={step5Form.control}
                    name="has_buyback"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Buyback Program</FormLabel>
                          <FormDescription>
                            Does this token have a buyback program?
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

                  {step5Form.watch('has_buyback') && (
                    <FormField
                      control={step5Form.control}
                      name="buyback_details"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Buyback Details</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe the buyback program (e.g., % of revenue, frequency, mechanism)"
                              className="min-h-[80px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Notes */}
                <FormField
                  control={step5Form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any additional emission details or economic mechanisms..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </form>
            </Form>
            </div>
            )}
          </div>

          {/* ── Section 6: Sources ────────────────────────────────────────────── */}
          <div
            id="section-sources"
            className={cn('overflow-hidden rounded-xl border bg-surface-1', activeSection !== 'sources' && 'hidden')}
            style={{ borderLeft: '3px solid hsl(var(--data-source))' }}
          >
            {sectionHeader('--data-source', 'Sources', '· Data references & attribution', liveSourcesScore, 10, completedSteps.includes(6))}
            {!tokenId ? notReadySection('Give the token a name and ticker first. The draft creates itself as you type.', { label: 'Go to Identity', section: 'identity' }) : (
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
            {sectionHeader('--data-risk', 'Risk flags', '· Risk signals & severity', _lw7flags.length > 0 ? 1 : 0, 0, completedSteps.includes(7))}
            {!tokenId ? notReadySection('Give the token a name and ticker first. The draft creates itself as you type.', { label: 'Go to Identity', section: 'identity' }) : (
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
      {/* Removal confirmation dialog (allocations + sources + risk flags) */}
      <AlertDialog open={!!pendingRemoval} onOpenChange={(open) => { if (!open) setPendingRemoval(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRemoval?.type === 'allocation'
                ? 'Remove allocation segment?'
                : pendingRemoval?.type === 'risk'
                ? 'Remove risk flag?'
                : 'Remove data source?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.type === 'allocation'
                ? 'This will remove the allocation segment and any vesting schedule tied to it. This cannot be undone after saving.'
                : pendingRemoval?.type === 'risk'
                ? 'This will remove the risk flag. This cannot be undone after saving.'
                : 'This will remove the data source and any claim attributions linked to it. This cannot be undone after saving.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingRemoval) return
                if (pendingRemoval.type === 'allocation') {
                  const index = pendingRemoval.index
                  if (segmentGuideRowIndex === index) {
                    closeSegmentGuide()
                  } else if (segmentGuideRowIndex !== null && segmentGuideRowIndex > index) {
                    setSegmentGuideRowIndex(segmentGuideRowIndex - 1)
                  }
                  remove(index)
                } else if (pendingRemoval.type === 'risk') {
                  removeRisk(pendingRemoval.index)
                } else {
                  removeSource(pendingRemoval.index)
                }
                setPendingRemoval(null)
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
