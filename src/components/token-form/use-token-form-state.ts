'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { type StudioSectionKey } from '@/features/studio/studio-spine'
import {
  tokenIdentitySchema,
  supplyMetricsSchema,
  allocationsSchema,
  vestingSchedulesSchema,
  emissionModelSchema,
  dataSourcesSchema,
  riskFlagsSchema,
  BLOCKCHAIN_OPTIONS,
  getCategoryOption,
  getSectorOptionsByCategory,
  toSupportedCategory,
  toSupportedSector,
  isSectorCompatibleWithCategory,
  toSupportedSegmentType,
  normalizeRiskSeverity,
  type TokenIdentityFormData,
  type SupplyMetricsFormData,
  type AllocationsFormData,
  type VestingSchedulesFormData,
  type EmissionModelFormData,
  type DataSourcesFormData,
  type RiskFlagsFormData,
} from '@/types/form'
import { toast } from 'sonner'
import {
  type AllocationWithId,
  type AutosaveStatus,
  SECTION_ORDER,
  formatNumber,
  parseDecimal,
} from './form-helpers'
import { buildDefaultAttributions, buildStep4Schedules } from './completeness'

// Sentinel for the post-save "Token created" screen. Kept distinct from the
// real step ids (1..7, Risk Flags is the 7th) so adding steps never collides.
export const COMPLETION_STEP = 99

type SectionForm =
  | ReturnType<typeof useForm<TokenIdentityFormData>>
  | ReturnType<typeof useForm<SupplyMetricsFormData>>
  | ReturnType<typeof useForm<AllocationsFormData>>
  | ReturnType<typeof useForm<VestingSchedulesFormData>>
  | ReturnType<typeof useForm<EmissionModelFormData>>
  | ReturnType<typeof useForm<DataSourcesFormData>>
  | ReturnType<typeof useForm<RiskFlagsFormData>>

/**
 * The keystone hook for the token structuring studio: owns every RHF instance,
 * the optimistic-lock timestamp, allocations, completedSteps, the studio's
 * navigation/autosave state, and the load functions. See
 * docs/refactor-plan-token-routes-20260620.md — highest-risk parts 1, 2 and 5
 * (optimistic locking, destructive delete→insert reseeding, and the live-score
 * .watch() block) all live here so they stay a single source of truth.
 */
export function useTokenFormState() {
  const searchParams = useSearchParams()
  const editTokenId = searchParams.get('id')
  const isEditMode = !!editTokenId

  const [currentStep, setCurrentStep] = useState(1)
  const [tokenId, setTokenId] = useState<string | null>(editTokenId)
  const [maxSupply, setMaxSupply] = useState<string>('')
  const [, setTgeDate] = useState<string | undefined>(undefined)
  const [allocations, setAllocations] = useState<AllocationWithId[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTokenData, setLoadingTokenData] = useState(isEditMode)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  const [initialUpdatedAt, setInitialUpdatedAt] = useState<string | null>(null)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [identityGuideTarget, setIdentityGuideTarget] = useState<
    'category' | 'sector' | null
  >(null)
  const [segmentGuideRowIndex, setSegmentGuideRowIndex] = useState<
    number | null
  >(null)
  const [pendingRemoval, setPendingRemoval] = useState<{
    type: 'allocation' | 'source' | 'risk'
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
  const [activeSection, setActiveSection] = useState<StudioSectionKey>(
    SECTION_ORDER.includes(sectionParam as StudioSectionKey)
      ? (sectionParam as StudioSectionKey)
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
  const tokenIdRef = useRef<string | null>(editTokenId)
  const autosaveTimerRef = useRef<number | null>(null)
  const autoDraftBusyRef = useRef(false)
  // Serialize all persistence: the optimistic lock (initialUpdatedAt) must
  // advance strictly between saves, so two saves never race each other.
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    activeSectionRef.current = activeSection
  }, [activeSection])
  useEffect(() => {
    tokenIdRef.current = tokenId
  }, [tokenId])

  // Refresh the "Saved Xs ago" chip label periodically.
  useEffect(() => {
    const i = window.setInterval(() => setChipTick((t) => t + 1), 30000)
    return () => window.clearInterval(i)
  }, [])

  const enqueueSave = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = saveChainRef.current.then(fn, fn)
    saveChainRef.current = next.catch(() => undefined)
    return next
  }

  // Step 1 Form
  const step1Form = useForm<TokenIdentityFormData>({
    resolver: zodResolver(tokenIdentitySchema),
    defaultValues: {
      name: '',
      ticker: '',
      chain: undefined,
      contract_address: '',
      coingecko_id: undefined,
      coingecko_image: undefined,
      tge_date: undefined,
      category: undefined,
      sector: undefined,
      notes: '',
    },
  })

  // Step 2 Form
  const step2Form = useForm<SupplyMetricsFormData>({
    resolver: zodResolver(supplyMetricsSchema),
    defaultValues: {
      max_supply: '',
      initial_supply: '',
      tge_supply: '',
      circulating_supply: '',
      circulating_date: undefined,
      source_url: '',
      notes: '',
    },
  })

  // Step 3 Form
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

  // Step 4 Form - Vesting Schedules
  const step4Form = useForm<VestingSchedulesFormData>({
    resolver: zodResolver(vestingSchedulesSchema),
    defaultValues: {
      schedules: {},
    },
  })

  // Step 5 Form - Emission Model
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

  // Step 6 Form - Data Sources
  const step6Form = useForm<DataSourcesFormData>({
    resolver: zodResolver(dataSourcesSchema),
    defaultValues: {
      sources: [],
    },
  })

  const {
    fields: sourceFields,
    append: appendSource,
    remove: removeSource,
  } = useFieldArray({
    control: step6Form.control,
    name: 'sources',
  })

  // Step 7 Form - Risk Flags
  const step7Form = useForm<RiskFlagsFormData>({
    resolver: zodResolver(riskFlagsSchema),
    defaultValues: {
      flags: [],
    },
  })

  const {
    fields: riskFields,
    append: appendRisk,
    remove: removeRisk,
  } = useFieldArray({
    control: step7Form.control,
    name: 'flags',
  })

  // Reconcile attribution rows whenever the allocation *id set* changes: adds
  // rows for newly-created allocations and drops rows for deleted ones, while
  // preserving existing data_source_ids selections (buildDefaultAttributions
  // merges by claim_type:claim_id key). Depends on the id set, not just the
  // count, because a delete followed by a re-insert autosave can keep the
  // length the same while swapping every id. loadTokenData (edit mode) already
  // rebuilds attributions from freshly-fetched data on load; this effect must
  // treat that as a no-op rather than clobber it, so it skips the setValue
  // when the reconciled rows are equivalent to what's already there.
  const allocationIdKey = allocations.map((a) => a.id).join(',')
  useEffect(() => {
    if (!tokenId || allocations.length === 0) return
    const current = step6Form.getValues('attributions')
    const reconciled = buildDefaultAttributions(allocations, current)
    const isNoOp =
      !!current &&
      current.length === reconciled.length &&
      current.every(
        (row, i) =>
          row.claim_type === reconciled[i].claim_type &&
          row.claim_id === reconciled[i].claim_id &&
          row.data_source_ids.length === reconciled[i].data_source_ids.length &&
          row.data_source_ids.every(
            (id, j) => id === reconciled[i].data_source_ids[j],
          ),
      )
    if (isNoOp) return
    step6Form.setValue('attributions', reconciled)
  }, [tokenId, allocationIdKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCategory = step1Form.watch('category')
  const selectedCategoryOption = getCategoryOption(selectedCategory)
  const sectorOptions = getSectorOptionsByCategory(selectedCategory)

  // Load allocations when entering Step 4
  const loadAllocationsForVesting = async () => {
    if (!tokenId) return

    try {
      setLoading(true)

      // Fetch allocations from database
      const { data: allocationData, error } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', tokenId)
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
        .from('vesting_schedules')
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

  // Load existing token data for editing
  const loadTokenData = async (id: string) => {
    try {
      setLoadingTokenData(true)

      // Fetch token with all related data
      const { data: tokenData, error: tokenError } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', id)
        .single()

      if (tokenError) throw tokenError
      if (!tokenData) {
        toast.error('Token not found')
        router.push('/dashboard')
        return
      }

      // Store initial updated_at for optimistic locking
      setInitialUpdatedAt(tokenData.updated_at)

      // Pre-fill Step 1 - Token Identity
      step1Form.reset({
        name: tokenData.name,
        ticker: tokenData.ticker,
        chain: tokenData.chain || undefined,
        contract_address: tokenData.contract_address || '',
        coingecko_id: tokenData.coingecko_id || undefined,
        coingecko_image: tokenData.coingecko_image || undefined,
        tge_date: tokenData.tge_date || undefined,
        category: toSupportedCategory(tokenData.category) || undefined,
        sector:
          toSupportedCategory(tokenData.category) &&
          toSupportedSector(tokenData.sector) &&
          isSectorCompatibleWithCategory(tokenData.category, tokenData.sector)
            ? toSupportedSector(tokenData.sector) || undefined
            : undefined,
        notes: tokenData.notes || '',
      })

      if (tokenData.tge_date) {
        setTgeDate(tokenData.tge_date)
      }

      // Fetch and pre-fill Step 2 - Supply Metrics (row may legitimately not exist yet)
      const { data: supplyData } = await supabase
        .from('supply_metrics')
        .select('*')
        .eq('token_id', id)
        .maybeSingle()

      if (supplyData) {
        step2Form.reset({
          max_supply: supplyData.max_supply
            ? formatNumber(String(supplyData.max_supply))
            : '',
          initial_supply: supplyData.initial_supply
            ? formatNumber(String(supplyData.initial_supply))
            : '',
          tge_supply: supplyData.tge_supply
            ? formatNumber(String(supplyData.tge_supply))
            : '',
          circulating_supply: supplyData.circulating_supply
            ? formatNumber(String(supplyData.circulating_supply))
            : '',
          circulating_date: supplyData.circulating_date || undefined,
          source_url: supplyData.source_url || '',
          notes: supplyData.notes || '',
        })
        if (supplyData.max_supply) {
          setMaxSupply(formatNumber(String(supplyData.max_supply)))
        }
      }

      // Fetch and pre-fill Step 3 - Allocations
      const { data: allocData } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', id)
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

      // Fetch and pre-fill Step 4 - Vesting Schedules
      if (allocData && allocData.length > 0) {
        const allocationIds = allocData.map((a) => a.id)
        const { data: vestingData } = await supabase
          .from('vesting_schedules')
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

      // Fetch and pre-fill Step 5 - Emission Model (row may legitimately not exist yet)
      const { data: emissionData } = await supabase
        .from('emission_models')
        .select('*')
        .eq('token_id', id)
        .maybeSingle()

      if (emissionData) {
        step5Form.reset({
          type: emissionData.type,
          annual_inflation_rate:
            emissionData.annual_inflation_rate?.toString() || '',
          has_burn: emissionData.has_burn || false,
          burn_details: emissionData.burn_details || '',
          has_buyback: emissionData.has_buyback || false,
          buyback_details: emissionData.buyback_details || '',
          notes: emissionData.notes || '',
        })
      }

      // Fetch and pre-fill Step 6 - Data Sources
      const { data: sourcesData } = await supabase
        .from('data_sources')
        .select('*')
        .eq('token_id', id)

      if (sourcesData && sourcesData.length > 0) {
        // Also fetch existing claim_sources to pre-fill attributions
        const { data: claimSourcesData } = await supabase
          .from('claim_sources')
          .select('claim_type, claim_id, data_source_id')
          .eq('token_id', id)

        // Build attribution index map: key → list of source indices (as strings)
        const attrMap = new Map<string, string[]>()
        claimSourcesData?.forEach((cs) => {
          const key = `${cs.claim_type}:${cs.claim_id ?? 'null'}`
          const srcIdx = sourcesData.findIndex(
            (s) => s.id === cs.data_source_id,
          )
          if (srcIdx < 0) return
          if (!attrMap.has(key)) attrMap.set(key, [])
          attrMap.get(key)!.push(srcIdx.toString())
        })

        // Build attribution rows from the locally-loaded allocations (not stale state)
        const prefilledAttributions = buildDefaultAttributions(
          allocationsWithIds,
        ).map((row) => {
          const key = `${row.claim_type}:${row.claim_id ?? 'null'}`
          return { ...row, data_source_ids: attrMap.get(key) ?? [] }
        })

        step6Form.reset({
          sources: sourcesData.map((source) => ({
            id: source.id,
            source_type: source.source_type,
            document_name: source.document_name,
            url: source.url,
            version: source.version || '',
            verified_at: source.verified_at || undefined,
          })),
          attributions: prefilledAttributions,
        })
      }

      // Fetch and pre-fill Step 7 - Risk Flags
      const { data: riskFlagsData } = await supabase
        .from('risk_flags')
        .select('*')
        .eq('token_id', id)

      if (riskFlagsData && riskFlagsData.length > 0) {
        step7Form.reset({
          flags: riskFlagsData.map((flag) => ({
            id: flag.id,
            flag_type: flag.flag_type,
            severity: normalizeRiskSeverity(flag.severity),
            is_flagged: flag.is_flagged ?? true,
            justification: flag.justification || '',
          })),
        })
      }

      toast.success('Token data loaded successfully')

      // Calculate completed steps after loading
      calculateCompletedSteps()
    } catch (error: unknown) {
      console.error('Error loading token data:', error)
      toast.error('Failed to load token data')
      router.push('/dashboard')
    } finally {
      setLoadingTokenData(false)
    }
  }

  // Calculate which steps have been completed
  const calculateCompletedSteps = () => {
    const completed: number[] = []

    // Step 1: Always completed if we have a token
    if (tokenId) completed.push(1)

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

    // Step 6: Check if data sources exist
    const step6Data = step6Form.getValues()
    if (step6Data.sources.length > 0) completed.push(6)

    // Step 7: Check if risk flags exist
    const step7Data = step7Form.getValues()
    if (step7Data.flags.length > 0) completed.push(7)

    setCompletedSteps(completed)
  }

  // Load token data on mount if editing
  useEffect(() => {
    if (isEditMode && editTokenId) {
      loadTokenData(editTokenId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load allocations for vesting once step 3 is completed
  useEffect(() => {
    if (completedSteps.includes(3) && tokenId && allocations.length === 0) {
      loadAllocationsForVesting()
    }
  }, [completedSteps, tokenId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Studio orchestration: shared refs used by use-token-save-handlers ──────
  const sectionFormsRef = useRef<Record<StudioSectionKey, SectionForm>>({
    identity: step1Form,
    supply: step2Form,
    allocation: step3Form,
    vesting: step4Form,
    emission: step5Form,
    sources: step6Form,
    risk: step7Form,
  })

  // Latest-ref pattern: the watch subscription mounts once, but each save
  // closes over fresh state (initialUpdatedAt for the optimistic lock). The
  // real implementation is assigned in use-token-save-handlers.ts, which is
  // the only place with access to onSubmitStep1..7.
  const saveSectionRef = useRef<(key: StudioSectionKey) => Promise<boolean>>(
    async () => false,
  )

  const allocationsRef = useRef(allocations)
  useEffect(() => {
    allocationsRef.current = allocations
  }, [allocations])

  /** Persist the active section if it is dirty and valid. Powers autosave.
   * Assigned in use-token-save-handlers.ts (needs saveSectionRef to be wired). */
  const autosaveActiveRef = useRef<() => Promise<void>>(async () => {})

  // Live token identity values for the page header
  const liveTokenName = step1Form.watch('name')
  const liveTokenTicker = step1Form.watch('ticker')
  const liveChain = step1Form.watch('chain')
  const liveCategory = step1Form.watch('category')
  const liveSector = step1Form.watch('sector')
  const chainLabel =
    BLOCKCHAIN_OPTIONS.find((b) => b.value === liveChain)?.label ?? liveChain

  // ── Live score (client-side, mirrors computeScores logic) ──────────────────
  const _lw1name = step1Form.watch('name')
  const _lw1ticker = step1Form.watch('ticker')
  const _lw1chain = step1Form.watch('chain')
  const _lw1addr = step1Form.watch('contract_address')
  const _lw1tge = step1Form.watch('tge_date')
  const _lw2max = step2Form.watch('max_supply')
  const _lw2init = step2Form.watch('initial_supply')
  const _lw2tge = step2Form.watch('tge_supply')
  const _lw3segs = step3Form.watch('segments') || []
  const _lw5type = step5Form.watch('type')
  const _lw5infl = step5Form.watch('annual_inflation_rate')
  const _lw5burn = step5Form.watch('has_burn')
  const _lw5buy = step5Form.watch('has_buyback')
  const _lw6srcs = step6Form.watch('sources') || []
  const _lw7flags = step7Form.watch('flags') || []

  const liveIdentityScore =
    (_lw1name && _lw1ticker && _lw1chain ? 10 : 0) +
    (_lw1addr ? 5 : 0) +
    (_lw1tge ? 5 : 0)
  const liveSupplyScore = _lw2max ? 10 + (_lw2init || _lw2tge ? 5 : 0) : 0
  const _lw3total = _lw3segs.reduce(
    (t, s) => t + (parseDecimal(s.percentage) || 0),
    0,
  )
  const liveAllocationScore =
    (_lw3segs.length >= 3 ? 10 : 0) +
    (Math.abs(_lw3total - 100) < 0.01 ? 10 : 0)
  const liveVestingScore = completedSteps.includes(4) ? 20 : 0
  const liveEmissionScore = _lw5type
    ? 5 + (_lw5infl || _lw5burn || _lw5buy ? 5 : 0)
    : 0
  const liveSourcesScore = _lw6srcs.length >= 1 ? 10 : 0
  const liveTotalScore = Math.min(
    100,
    liveIdentityScore +
      liveSupplyScore +
      liveAllocationScore +
      liveVestingScore +
      liveEmissionScore +
      liveSourcesScore,
  )

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
    editTokenId,
    isEditMode,
    supabase,

    currentStep,
    setCurrentStep,
    tokenId,
    setTokenId,
    maxSupply,
    setMaxSupply,
    setTgeDate,
    allocations,
    setAllocations,
    loading,
    setLoading,
    loadingTokenData,
    setLoadingTokenData,
    finalScore,
    setFinalScore,
    initialUpdatedAt,
    setInitialUpdatedAt,
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
    tokenIdRef,
    autosaveTimerRef,
    autoDraftBusyRef,
    saveChainRef,
    enqueueSave,

    step1Form,
    step2Form,
    step3Form,
    step4Form,
    step5Form,
    step6Form,
    step7Form,
    fields,
    append,
    remove,
    sourceFields,
    appendSource,
    removeSource,
    riskFields,
    appendRisk,
    removeRisk,

    selectedCategory,
    selectedCategoryOption,
    sectorOptions,

    loadAllocationsForVesting,
    loadTokenData,
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
  }
}

export type TokenFormState = ReturnType<typeof useTokenFormState>
