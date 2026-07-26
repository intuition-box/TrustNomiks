'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import type { FactoryProjectStatus } from '@/types/factory'
import {
  tokenIdentitySchema,
  supplyMetricsSchema,
  allocationsSchema,
  vestingSchedulesSchema,
  emissionModelSchema,
  fundingRoundsSchema,
  getCategoryOption,
  getSectorOptionsByCategory,
  toSupportedCategory,
  toSupportedSector,
  isSectorCompatibleWithCategory,
  toSupportedSegmentType,
  buildStep4Schedules,
  computeFactoryScore,
  createSaveQueue,
  formatNumber,
  parseDecimal,
  type AllocationWithId,
  type AutosaveStatus,
  type TokenIdentityFormData,
  type SupplyMetricsFormData,
  type AllocationsFormData,
  type VestingSchedulesFormData,
  type EmissionModelFormData,
  type FundingRoundsFormData,
  type FactoryBenchmarkSnapshot,
  type VestingSeed,
} from '@/lib/tokenomics'
import { toast } from 'sonner'
import {
  FACTORY_SECTION_ORDER,
  type FactoryFormSectionKey,
  type FactorySectionKey,
} from './sections'

/*
 * ── DRIFT LEDGER ─────────────────────────────────────────────────────────────
 * This hook and use-factory-save-handlers.ts are derive-and-strip twins of
 * src/components/token-form/{use-token-form-state,use-token-save-handlers}.ts
 * (clone-not-adapter, per tasks/factory-plan.md). The following wiring blocks
 * MUST track the screener originals; if one changes there, mirror it here
 * (autosave-parity.test.ts trips on the load-bearing ones):
 *   1. createSaveQueue wiring (single-sourced from @/lib/tokenomics) + the
 *      onTimeout reset of the shared `loading` flag.
 *   2. The `info?.type !== 'change'` watch filter: only real user edits arm
 *      the debounced autosave, never programmatic reset/setValue.
 *   3. The AUTOSAVE_DEBOUNCE_MS (1800) debounce in queueAutosave, and the
 *      auto-draft timer (1200).
 *   4. The saveSectionRef / autosaveActiveRef latest-ref pattern: the watch
 *      subscription mounts once, each save closes over fresh optimistic-lock
 *      state.
 *   5. The autosave skip guards: no project id yet; vesting with zero
 *      allocations; emission with no type picked.
 * Stripped relative to the screener (do NOT re-add): sources/risk forms,
 * challenge pre-fill, CoinGecko autofill, claim attributions.
 * Factory-only additions (assumed divergence, not screener drift): the
 * step-5 inflation_schedule field array (the screener now hydrates the
 * stored schedule on load too, so its saves stopped wiping it, but it
 * still has no editor UI there), and the formless Projections section (a
 * derived view; every save path guards on it via FactoryFormSectionKey).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Sentinel for the post-save "Design saved" screen. Kept distinct from the
// real step ids (1..5) so adding steps never collides.
export const COMPLETION_STEP = 99

type SectionForm =
  | ReturnType<typeof useForm<TokenIdentityFormData>>
  | ReturnType<typeof useForm<SupplyMetricsFormData>>
  | ReturnType<typeof useForm<AllocationsFormData>>
  | ReturnType<typeof useForm<VestingSchedulesFormData>>
  | ReturnType<typeof useForm<EmissionModelFormData>>
  | ReturnType<typeof useForm<FundingRoundsFormData>>

/**
 * The keystone hook for the Factory builder: owns every RHF instance, the
 * optimistic-lock timestamp, allocations, completedSteps, the studio's
 * navigation/autosave state, and the load functions. Twin of
 * useTokenFormState (see the drift ledger above).
 */
export function useFactoryFormState() {
  const searchParams = useSearchParams()
  const editProjectId = searchParams.get('id')
  const isEditMode = !!editProjectId

  const [currentStep, setCurrentStep] = useState(1)
  const [projectId, setProjectId] = useState<string | null>(editProjectId)
  const [maxSupply, setMaxSupply] = useState<string>('')
  const [allocations, setAllocations] = useState<AllocationWithId[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingProjectData, setLoadingProjectData] = useState(isEditMode)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  const [benchmarkSnapshot, setBenchmarkSnapshot] =
    useState<FactoryBenchmarkSnapshot | null>(null)
  const [initialUpdatedAt, setInitialUpdatedAt] = useState<string | null>(null)
  const [ownershipDenied, setOwnershipDenied] = useState(false)
  // Promote lifecycle: a promoted design renders read-only and links to the
  // screener token it minted.
  const [projectStatus, setProjectStatus] =
    useState<FactoryProjectStatus>('draft')
  const [promotedTokenId, setPromotedTokenId] = useState<string | null>(null)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [identityGuideTarget, setIdentityGuideTarget] = useState<
    'category' | 'sector' | null
  >(null)
  const [segmentGuideRowIndex, setSegmentGuideRowIndex] = useState<
    number | null
  >(null)
  const [pendingRemoval, setPendingRemoval] = useState<{
    type: 'allocation' | 'funding'
    index: number
  } | null>(null)
  const prevScoreRef = useRef(0)
  const [flashPts, setFlashPts] = useState(0)
  const [flashKey, setFlashKey] = useState(0)
  const [showFlash, setShowFlash] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // ── Studio orchestration state (docs/redesign/08 §6) ────────────────────────
  const sectionParam = searchParams.get('section')
  const [activeSection, setActiveSection] = useState<FactorySectionKey>(
    FACTORY_SECTION_ORDER.includes(sectionParam as FactorySectionKey)
      ? (sectionParam as FactorySectionKey)
      : 'identity',
  )
  const [autosave, setAutosave] = useState<{
    status: AutosaveStatus
    at: number | null
  }>({
    status: 'idle',
    at: null,
  })
  const [, setChipTick] = useState(0)
  const activeSectionRef = useRef(activeSection)
  const projectIdRef = useRef<string | null>(editProjectId)
  const autosaveTimerRef = useRef<number | null>(null)
  const autoDraftBusyRef = useRef(false)

  useEffect(() => {
    activeSectionRef.current = activeSection
  }, [activeSection])
  useEffect(() => {
    projectIdRef.current = projectId
  }, [projectId])

  // Refresh the "Saved Xs ago" chip label periodically.
  useEffect(() => {
    const i = window.setInterval(() => setChipTick((t) => t + 1), 30000)
    return () => window.clearInterval(i)
  }, [])

  // Serialize all persistence: the optimistic lock (initialUpdatedAt) must
  // advance strictly between saves, so two saves never race each other. A
  // single stuck save (e.g. a Supabase await that never resolves) must not
  // wedge every later save — autosave, "Continue", "Finish" — behind it
  // forever, so the queue carries its own timeout; see createSaveQueue.
  const enqueueSaveRef = useRef(
    createSaveQueue({
      onTimeout: () => {
        setLoading(false)
        toast.error('Save is taking too long and was cancelled. Please retry.')
      },
    }),
  )
  const enqueueSave = enqueueSaveRef.current

  // Section 1 Form - Identity (shared identity schema; Factory simply never
  // renders the contract_address / coingecko fields a design cannot have)
  const step1Form = useForm<TokenIdentityFormData>({
    resolver: zodResolver(tokenIdentitySchema),
    defaultValues: {
      name: '',
      ticker: '',
      category: undefined,
      sector: undefined,
      notes: '',
    },
  })

  // Section 2 Form - Supply
  const step2Form = useForm<SupplyMetricsFormData>({
    resolver: zodResolver(supplyMetricsSchema),
    defaultValues: {
      max_supply: '',
      notes: '',
    },
  })

  // Section 3 Form - Allocation
  const step3Form = useForm<AllocationsFormData>({
    resolver: zodResolver(allocationsSchema),
    defaultValues: {
      segments: [
        {
          id: crypto.randomUUID(),
          segment_type: '',
          label: '',
          percentage: '',
          token_amount: '',
          wallet_address: '',
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: step3Form.control,
    name: 'segments',
  })

  // Section 4 Form - Vesting Schedules
  const step4Form = useForm<VestingSchedulesFormData>({
    resolver: zodResolver(vestingSchedulesSchema),
    defaultValues: {
      schedules: {},
    },
  })

  // Section 5 Form - Emission Model
  const step5Form = useForm<EmissionModelFormData>({
    resolver: zodResolver(emissionModelSchema),
    defaultValues: {
      type: '',
      annual_inflation_rate: '',
      inflation_schedule: [],
      has_burn: false,
      burn_details: '',
      has_buyback: false,
      buyback_details: '',
      notes: '',
    },
  })

  const {
    fields: inflationYearFields,
    append: appendInflationYear,
    remove: removeInflationYear,
  } = useFieldArray({
    control: step5Form.control,
    name: 'inflation_schedule',
  })

  // Section 6 Form - Funding rounds (factory-only, optional, unscored)
  const step6Form = useForm<FundingRoundsFormData>({
    resolver: zodResolver(fundingRoundsSchema),
    defaultValues: {
      rounds: [],
    },
  })

  const {
    fields: roundFields,
    append: appendRound,
    remove: removeRound,
  } = useFieldArray({
    control: step6Form.control,
    name: 'rounds',
  })

  // RHF's formState is a lazy proxy: isDirty is only computed once it has
  // been read during a render. handleContinue and the autosave read it inside
  // event handlers, where a never-subscribed read returns a stale false and
  // the save is silently skipped (the first Continue after mount lost its
  // section). Reading every form's isDirty here keeps the subscription hot.
  const sectionDirty = [
    step1Form.formState.isDirty,
    step2Form.formState.isDirty,
    step3Form.formState.isDirty,
    step4Form.formState.isDirty,
    step5Form.formState.isDirty,
    step6Form.formState.isDirty,
  ]

  const selectedCategory = step1Form.watch('category')
  const selectedCategoryOption = getCategoryOption(selectedCategory)
  const sectorOptions = getSectorOptionsByCategory(selectedCategory)

  // Load allocations when entering the Vesting section
  const loadAllocationsForVesting = async () => {
    if (!projectId) return

    try {
      setLoading(true)

      // Fetch allocations from database
      const { data: allocationData, error } = await supabase
        .from('factory_allocation_segments')
        .select('*')
        .eq('project_id', projectId)
        .order('percentage', { ascending: false })

      if (error) throw error

      const allocationsWithIds = (allocationData || []).map((alloc) => ({
        id: alloc.id,
        segment_type: toSupportedSegmentType(alloc.segment_type),
        label: alloc.label,
        percentage: alloc.percentage.toString(),
        token_amount: alloc.token_amount || '0',
        wallet_address: alloc.wallet_address || '',
      }))

      setAllocations(allocationsWithIds)

      const allocationIds = (allocationData || []).map((alloc) => alloc.id)
      const { data: vestingData } = await supabase
        .from('factory_vesting_schedules')
        .select('*')
        .in('allocation_id', allocationIds.length > 0 ? allocationIds : [''])

      step4Form.reset({
        schedules: buildStep4Schedules(
          (allocationData || []).map((alloc) => ({
            id: alloc.id,
            segment_type: alloc.segment_type,
          })),
          vestingData || [],
        ),
      })
    } catch (error: unknown) {
      console.error('Error loading allocations:', error)
      toast.error('Failed to load allocations')
    } finally {
      setLoading(false)
    }
  }

  // Load existing design data for editing
  const loadProjectData = async (id: string) => {
    try {
      setLoadingProjectData(true)

      // Fetch the design row
      const { data: projectData, error: projectError } = await supabase
        .from('factory_projects')
        .select('*')
        .eq('id', id)
        .single()

      if (projectError) throw projectError
      if (!projectData) {
        toast.error('Design not found')
        router.push('/factory')
        return
      }

      // Ownership guard: only the design's creator may edit it here. RLS
      // already blocks the save server-side; this stops the editable form
      // from mounting at all so the UX matches that restriction.
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user || projectData.created_by !== authData.user.id) {
        setOwnershipDenied(true)
        return
      }

      // Store initial updated_at for optimistic locking
      setInitialUpdatedAt(projectData.updated_at)

      // Promote lifecycle (a promoted design mounts read-only)
      setProjectStatus(
        (projectData.status as FactoryProjectStatus | null) ?? 'draft',
      )
      setPromotedTokenId(
        (projectData.promoted_token_id as string | null) ?? null,
      )

      // Hydrate the persisted benchmark snapshot (the design renders from it)
      setBenchmarkSnapshot(
        (projectData.benchmark_snapshot as FactoryBenchmarkSnapshot | null) ??
          null,
      )

      // Pre-fill Section 1 - Identity
      step1Form.reset({
        name: projectData.name,
        ticker: projectData.ticker,
        category: toSupportedCategory(projectData.category) || undefined,
        sector:
          toSupportedCategory(projectData.category) &&
          toSupportedSector(projectData.sector) &&
          isSectorCompatibleWithCategory(
            projectData.category,
            projectData.sector,
          )
            ? toSupportedSector(projectData.sector) || undefined
            : undefined,
        notes: projectData.notes || '',
      })

      // Fetch and pre-fill Section 2 - Supply (row may legitimately not exist yet)
      const { data: supplyData } = await supabase
        .from('factory_supply_metrics')
        .select('*')
        .eq('project_id', id)
        .maybeSingle()

      if (supplyData) {
        step2Form.reset({
          max_supply: supplyData.max_supply
            ? formatNumber(String(supplyData.max_supply))
            : '',
          notes: supplyData.notes || '',
        })
        if (supplyData.max_supply) {
          setMaxSupply(formatNumber(String(supplyData.max_supply)))
        }
      }

      // Fetch and pre-fill Section 3 - Allocations
      const { data: allocData } = await supabase
        .from('factory_allocation_segments')
        .select('*')
        .eq('project_id', id)
        .order('percentage', { ascending: false })

      const allocationsWithIds: AllocationWithId[] =
        allocData?.map((alloc) => ({
          id: alloc.id,
          segment_type: toSupportedSegmentType(alloc.segment_type),
          label: alloc.label,
          percentage: alloc.percentage.toString(),
          token_amount: alloc.token_amount ? String(alloc.token_amount) : '',
          wallet_address: alloc.wallet_address || '',
        })) ?? []

      if (allocationsWithIds.length > 0) {
        setAllocations(allocationsWithIds)
        step3Form.reset({ segments: allocationsWithIds })
      }

      // Fetch and pre-fill Section 4 - Vesting Schedules
      if (allocData && allocData.length > 0) {
        const allocationIds = allocData.map((a) => a.id)
        const { data: vestingData } = await supabase
          .from('factory_vesting_schedules')
          .select('*')
          .in('allocation_id', allocationIds)

        step4Form.reset({
          schedules: buildStep4Schedules(
            allocData.map((alloc) => ({
              id: alloc.id,
              segment_type: alloc.segment_type,
            })),
            vestingData || [],
          ),
        })
      }

      // Fetch and pre-fill Section 5 - Emission Model (row may legitimately not exist yet)
      const { data: emissionData } = await supabase
        .from('factory_emission_models')
        .select('*')
        .eq('project_id', id)
        .maybeSingle()

      if (emissionData) {
        step5Form.reset({
          type: emissionData.type,
          annual_inflation_rate:
            emissionData.annual_inflation_rate?.toString() || '',
          inflation_schedule: Array.isArray(emissionData.inflation_schedule)
            ? (
                emissionData.inflation_schedule as Array<{
                  year: number
                  rate: number
                }>
              ).map((item) => ({
                year: String(item.year),
                rate: String(item.rate),
              }))
            : [],
          has_burn: emissionData.has_burn || false,
          burn_details: emissionData.burn_details || '',
          has_buyback: emissionData.has_buyback || false,
          buyback_details: emissionData.buyback_details || '',
          notes: emissionData.notes || '',
        })
      }

      // Fetch and pre-fill Section 6 - Funding rounds (factory-only)
      const { data: fundingData } = await supabase
        .from('factory_funding_rounds')
        .select('*')
        .eq('project_id', id)
        .order('round_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })

      if (fundingData && fundingData.length > 0) {
        step6Form.reset({
          rounds: fundingData.map((round) => ({
            id: round.id,
            round_type: round.round_type,
            label: round.label || '',
            round_date: round.round_date || undefined,
            token_price_usd:
              round.token_price_usd != null
                ? String(round.token_price_usd)
                : '',
            tokens_sold:
              round.tokens_sold != null
                ? formatNumber(String(round.tokens_sold))
                : '',
            amount_usd:
              round.amount_usd != null ? String(round.amount_usd) : '',
            notes: round.notes || '',
          })),
        })
      }

      toast.success('Design loaded successfully')

      // Calculate completed steps after loading
      calculateCompletedSteps()
    } catch (error: unknown) {
      console.error('Error loading design data:', error)
      toast.error('Failed to load design data')
      router.push('/factory')
    } finally {
      setLoadingProjectData(false)
    }
  }

  // Calculate which steps have been completed
  const calculateCompletedSteps = () => {
    const completed: number[] = []

    // Step 1: Always completed if we have a design
    if (projectId) completed.push(1)

    // Step 2: Check if supply metrics exist
    const step2Data = step2Form.getValues()
    if (step2Data.max_supply) completed.push(2)

    // Step 3: Check if allocations exist
    const step3Data = step3Form.getValues()
    if (step3Data.segments.length > 0) completed.push(3)

    // Step 4: Check if vesting schedules exist
    const step4Data = step4Form.getValues()
    if (Object.keys(step4Data.schedules).length > 0) completed.push(4)

    // Step 5: Check if emission model exists
    const step5Data = step5Form.getValues()
    if (step5Data.type) completed.push(5)

    // Step 6: Check if funding rounds exist
    const step6Data = step6Form.getValues()
    if (step6Data.rounds.length > 0) completed.push(6)

    setCompletedSteps(completed)
  }

  // Load design data on mount if editing.
  useEffect(() => {
    if (isEditMode && editProjectId) {
      void loadProjectData(editProjectId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load allocations for vesting once the allocation section is completed
  useEffect(() => {
    if (completedSteps.includes(3) && projectId && allocations.length === 0) {
      loadAllocationsForVesting()
    }
  }, [completedSteps, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate total percentage
  const calculateTotalPercentage = (): number => {
    const segments = step3Form.watch('segments')
    return segments.reduce((total, segment) => {
      const percentage = parseDecimal(segment.percentage) || 0
      return total + percentage
    }, 0)
  }

  const totalPercentage = calculateTotalPercentage()
  const delta = 100 - totalPercentage
  const isComplete = totalPercentage === 100

  // One swell when the allocation sum first seals at 100 (motion vocabulary:
  // stake-swell; frozen automatically under prefers-reduced-motion).
  const prevSealRef = useRef(false)
  const [sealKey, setSealKey] = useState(0)
  useEffect(() => {
    if (isComplete && !prevSealRef.current) setSealKey((k) => k + 1)
    prevSealRef.current = isComplete
  }, [isComplete])

  // ── Studio orchestration: shared refs used by use-factory-save-handlers ────
  // Keyed by the form-backed sections only: Projections is a derived view
  // with nothing to persist.
  const sectionFormsRef = useRef<Record<FactoryFormSectionKey, SectionForm>>({
    identity: step1Form,
    supply: step2Form,
    allocation: step3Form,
    vesting: step4Form,
    emission: step5Form,
    funding: step6Form,
  })

  // Latest-ref pattern: the watch subscription mounts once, but each save
  // closes over fresh state (initialUpdatedAt for the optimistic lock). The
  // real implementation is assigned in use-factory-save-handlers.ts, which is
  // the only place with access to onSubmitStep1..5.
  const saveSectionRef = useRef<
    (key: FactoryFormSectionKey) => Promise<boolean>
  >(async () => false)

  const allocationsRef = useRef(allocations)
  useEffect(() => {
    allocationsRef.current = allocations
  }, [allocations])

  /** Persist the active section if it is dirty and valid. Powers autosave.
   * Assigned in use-factory-save-handlers.ts (needs saveSectionRef to be wired). */
  const autosaveActiveRef = useRef<() => Promise<void>>(async () => {})

  /**
   * Benchmark vesting seeds queued by the BenchmarkPanel's Apply, keyed by
   * segment_type. Consumed by onSubmitStep3 IMMEDIATELY AFTER its
   * step4Form.reset: the reset is the single place the vesting form is
   * rebuilt from saved rows, so overlaying there is race-free. (An
   * allocations-watching effect is NOT: onSubmitStep3 awaits a vesting fetch
   * between setAllocations and the reset, so such an effect fires mid-save
   * and its seeds get wiped by the reset that follows.)
   */
  const pendingVestingSeedsRef = useRef<Record<string, VestingSeed> | null>(
    null,
  )

  // Live design identity values for the page header
  const liveTokenName = step1Form.watch('name')
  const liveTokenTicker = step1Form.watch('ticker')
  const liveCategory = step1Form.watch('category')
  const liveSector = step1Form.watch('sector')

  // ── Live score: THE Factory scoring contract, never a hand-rolled sum ──────
  const _lw1name = step1Form.watch('name')
  const _lw1ticker = step1Form.watch('ticker')
  const _lw2max = step2Form.watch('max_supply')
  const _lw3segs = step3Form.watch('segments') || []
  const _lw5type = step5Form.watch('type')
  const _lw5infl = step5Form.watch('annual_inflation_rate')
  const _lw5burn = step5Form.watch('has_burn')
  const _lw5buy = step5Form.watch('has_buyback')
  const _lw6rounds = step6Form.watch('rounds') || []

  // computeFactoryScore only reads truthiness off supply/emission numerics, so
  // the formatted form strings are mapped to 1/null sentinels rather than
  // parsed. Allocation percentages DO feed real math (the 100% seal).
  const { clusterScores: liveClusters, totalScore: liveTotalScore } =
    computeFactoryScore({
      project: {
        name: _lw1name || null,
        ticker: _lw1ticker || null,
        category: liveCategory || null,
        sector: liveSector || null,
      },
      supply: _lw2max ? { max_supply: 1 } : null,
      allocations: _lw3segs.map((s) => ({
        id: s.id ?? '',
        percentage: parseDecimal(s.percentage) || 0,
      })),
      vestingCount: completedSteps.includes(4) ? 1 : 0,
      emission: _lw5type
        ? {
            type: _lw5type,
            annual_inflation_rate: _lw5infl ? 1 : null,
            has_burn: _lw5burn,
            has_buyback: _lw5buy,
          }
        : null,
    })

  const liveIdentityScore = liveClusters.identity
  const liveSupplyScore = liveClusters.supply
  const liveAllocationScore = liveClusters.allocation
  const liveVestingScore = liveClusters.vesting
  const liveEmissionScore = liveClusters.emission

  // Flash animation when score increases
  useEffect(() => {
    const diff = liveTotalScore - prevScoreRef.current
    if (diff > 0) {
      setFlashPts(diff)
      setFlashKey((k) => k + 1)
      setShowFlash(true)
      const t = setTimeout(() => setShowFlash(false), 1400)
      prevScoreRef.current = liveTotalScore
      return () => clearTimeout(t)
    }
    prevScoreRef.current = liveTotalScore
  }, [liveTotalScore])

  return {
    router,
    searchParams,
    editProjectId,
    isEditMode,
    supabase,

    currentStep,
    setCurrentStep,
    projectId,
    setProjectId,
    maxSupply,
    setMaxSupply,
    allocations,
    setAllocations,
    loading,
    setLoading,
    loadingProjectData,
    setLoadingProjectData,
    finalScore,
    setFinalScore,
    benchmarkSnapshot,
    setBenchmarkSnapshot,
    initialUpdatedAt,
    setInitialUpdatedAt,
    projectStatus,
    setProjectStatus,
    promotedTokenId,
    setPromotedTokenId,
    ownershipDenied,
    setOwnershipDenied,
    completedSteps,
    setCompletedSteps,
    identityGuideTarget,
    setIdentityGuideTarget,
    segmentGuideRowIndex,
    setSegmentGuideRowIndex,
    pendingRemoval,
    setPendingRemoval,

    prevScoreRef,
    flashPts,
    setFlashPts,
    flashKey,
    setFlashKey,
    showFlash,
    setShowFlash,

    activeSection,
    setActiveSection,
    autosave,
    setAutosave,
    activeSectionRef,
    projectIdRef,
    autosaveTimerRef,
    autoDraftBusyRef,
    enqueueSave,

    step1Form,
    step2Form,
    step3Form,
    step4Form,
    step5Form,
    step6Form,
    sectionDirty,
    fields,
    append,
    remove,
    roundFields,
    appendRound,
    removeRound,
    inflationYearFields,
    appendInflationYear,
    removeInflationYear,

    selectedCategory,
    selectedCategoryOption,
    sectorOptions,

    loadAllocationsForVesting,
    loadProjectData,
    calculateCompletedSteps,

    totalPercentage,
    delta,
    isComplete,
    prevSealRef,
    sealKey,
    setSealKey,

    sectionFormsRef,
    saveSectionRef,
    allocationsRef,
    autosaveActiveRef,
    pendingVestingSeedsRef,

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
  }
}

export type FactoryFormState = ReturnType<typeof useFactoryFormState>
