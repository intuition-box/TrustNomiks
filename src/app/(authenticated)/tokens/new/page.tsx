'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { CalendarIcon, ArrowLeft, ArrowRight, Loader2, Plus, X, AlertCircle, CheckCircle2, Clock, CircleHelp, Tag, BarChart2, PieChart, TrendingUp, ShieldAlert, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { computeScores } from '@/lib/utils/completeness'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { StudioSpine, type StudioSectionKey, type StudioSectionMeta } from '@/features/studio/studio-spine'
import { StudioGraphPane } from '@/features/studio/studio-graph-pane'
import type { CoinGeckoProfile } from '@/types/coingecko'
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
  tokenIdentitySchema,
  supplyMetricsSchema,
  allocationsSchema,
  vestingSchedulesSchema,
  emissionModelSchema,
  dataSourcesSchema,
  riskFlagsSchema,
  RISK_FLAG_TYPE_OPTIONS,
  RISK_SEVERITY_OPTIONS,
  getRiskFlagTypeDescription,
  normalizeRiskSeverity,
  BLOCKCHAIN_OPTIONS,
  CATEGORY_OPTIONS,
  getCategoryOption,
  getSectorOption,
  getSectorOptionsByCategory,
  isSectorCompatibleWithCategory,
  toSupportedCategory,
  toSupportedSector,
  SEGMENT_TYPE_OPTIONS,
  VESTING_FREQUENCY_OPTIONS,
  normalizeVestingFrequency,
  toSupportedSegmentType,
  formatSegmentTypeLabel,
  formatCategoryLabel,
  formatSectorLabel,
  EMISSION_TYPE_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  type TokenIdentityFormData,
  type SupplyMetricsFormData,
  type AllocationsFormData,
  type VestingSchedulesFormData,
  type EmissionModelFormData,
  type DataSourcesFormData,
  type RiskFlagsFormData,
} from '@/types/form'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { CoinGeckoSearch } from '@/components/coingecko-search'
import {
  type AllocationWithId,
  type SaveOpts,
  type AutosaveStatus,
  SECTION_ORDER,
  SECTION_LABELS,
  CHAIN_PLATFORM,
  formatNumber,
  calculateTokenAmount,
  calculatePercentage,
  formatTokenAmount,
} from '@/components/token-form/form-helpers'
import {
  buildDefaultAttributions,
  buildStep4Schedules,
  calculateCompleteness,
} from '@/components/token-form/completeness'

export default function NewTokenPage() {
  const searchParams = useSearchParams()
  const editTokenId = searchParams.get('id')
  const isEditMode = !!editTokenId

  // Sentinel for the post-save "Token created" screen. Kept distinct from the
  // real step ids (1..7, Risk Flags is the 7th) so adding steps never collides.
  const COMPLETION_STEP = 99
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
  const [identityGuideTarget, setIdentityGuideTarget] = useState<'category' | 'sector' | null>(null)
  const [segmentGuideRowIndex, setSegmentGuideRowIndex] = useState<number | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<{ type: 'allocation' | 'source' | 'risk'; index: number } | null>(null)
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
      : 'identity'
  )
  const [autosave, setAutosave] = useState<{ status: AutosaveStatus; at: number | null }>({
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

  const enqueueSave = <T,>(fn: () => Promise<T>): Promise<T> => {
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

  const { fields: sourceFields, append: appendSource, remove: removeSource } = useFieldArray({
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

  const { fields: riskFields, append: appendRisk, remove: removeRisk } = useFieldArray({
    control: step7Form.control,
    name: 'flags',
  })

  // Initialise attribution rows once allocations are available (replaces step 6 trigger)
  useEffect(() => {
    if (!tokenId || allocations.length === 0) return
    const current = step6Form.getValues('attributions')
    if (!current || current.length === 0) {
      step6Form.setValue('attributions', buildDefaultAttributions(allocations, current))
    }
  }, [tokenId, allocations.length]) // eslint-disable-line react-hooks/exhaustive-deps

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
          (allocationData || []).map((alloc) => ({ id: alloc.id, segment_type: alloc.segment_type })),
          vestingData || []
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

      // Fetch and pre-fill Step 2 - Supply Metrics
      const { data: supplyData } = await supabase
        .from('supply_metrics')
        .select('*')
        .eq('token_id', id)
        .single()

      if (supplyData) {
        step2Form.reset({
          max_supply: supplyData.max_supply ? formatNumber(String(supplyData.max_supply)) : '',
          initial_supply: supplyData.initial_supply ? formatNumber(String(supplyData.initial_supply)) : '',
          tge_supply: supplyData.tge_supply ? formatNumber(String(supplyData.tge_supply)) : '',
          circulating_supply: supplyData.circulating_supply ? formatNumber(String(supplyData.circulating_supply)) : '',
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

      const allocationsWithIds: AllocationWithId[] = allocData?.map((alloc) => ({
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
        const allocationIds = allocData.map(a => a.id)
        const { data: vestingData } = await supabase
          .from('vesting_schedules')
          .select('*')
          .in('allocation_id', allocationIds)

        step4Form.reset({
          schedules: buildStep4Schedules(
            allocData.map((alloc) => ({ id: alloc.id, segment_type: alloc.segment_type })),
            vestingData || []
          ),
        })
      }

      // Fetch and pre-fill Step 5 - Emission Model
      const { data: emissionData } = await supabase
        .from('emission_models')
        .select('*')
        .eq('token_id', id)
        .single()

      if (emissionData) {
        step5Form.reset({
          type: emissionData.type,
          annual_inflation_rate: emissionData.annual_inflation_rate?.toString() || '',
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
        claimSourcesData?.forEach(cs => {
          const key = `${cs.claim_type}:${cs.claim_id ?? 'null'}`
          const srcIdx = sourcesData.findIndex(s => s.id === cs.data_source_id)
          if (srcIdx < 0) return
          if (!attrMap.has(key)) attrMap.set(key, [])
          attrMap.get(key)!.push(srcIdx.toString())
        })

        // Build attribution rows from the locally-loaded allocations (not stale state)
        const prefilledAttributions = buildDefaultAttributions(allocationsWithIds).map(row => {
          const key = `${row.claim_type}:${row.claim_id ?? 'null'}`
          return { ...row, data_source_ids: attrMap.get(key) ?? [] }
        })

        step6Form.reset({
          sources: sourcesData.map(source => ({
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
      const percentage = parseFloat(segment.percentage) || 0
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

  const handleRpcError = (error: { code?: string; message?: string }): boolean => {
    if (error.message?.includes('FORBIDDEN') || error.code === '42501') {
      toast.error('You do not have permission to modify this token.')
      return true
    }
    if (error.message?.includes('CONFLICT') || error.code === '40001') {
      toast.error('This token was modified by someone else. Please refresh and try again.')
      return true
    }
    return false
  }

  // Save Step 1 and create/update token
  const onSubmitStep1 = async (data: TokenIdentityFormData, opts: SaveOpts = {}): Promise<boolean> => {
    try {
      setLoading(true)

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const normalizedCategory = toSupportedCategory(data.category)
      const normalizedSector = toSupportedSector(data.sector)
      const safeSector = normalizedCategory && normalizedSector && isSectorCompatibleWithCategory(normalizedCategory, normalizedSector)
        ? normalizedSector
        : null

      if (isEditMode && tokenId) {
        // Update existing token - check for concurrent modifications
        const { data: currentToken } = await supabase
          .from('tokens')
          .select('updated_at, created_by')
          .eq('id', tokenId)
          .single()

        if (currentToken && currentToken.created_by !== user.id) {
          toast.error('You do not have permission to modify this token.')
          return false
        }

        if (currentToken && initialUpdatedAt && currentToken.updated_at !== initialUpdatedAt) {
          toast.error('This token was modified by someone else. Please refresh and try again.')
          return false
        }

        const { error } = await supabase
          .from('tokens')
          .update({
            name: data.name,
            ticker: data.ticker.toUpperCase(),
            chain: data.chain || null,
            contract_address: data.contract_address || null,
            coingecko_id: data.coingecko_id || null,
            coingecko_image: data.coingecko_image || null,
            tge_date: data.tge_date || null,
            category: normalizedCategory || null,
            sector: safeSector,
            notes: data.notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tokenId)

        if (error) throw error

        // Update initial timestamp for next save
        const { data: updatedToken } = await supabase
          .from('tokens')
          .select('updated_at')
          .eq('id', tokenId)
          .single()
        if (updatedToken) setInitialUpdatedAt(updatedToken.updated_at)
      } else {
        // Create new token
        const { data: tokenData, error } = await supabase
          .from('tokens')
          .insert({
            name: data.name,
            ticker: data.ticker.toUpperCase(),
            chain: data.chain || null,
            contract_address: data.contract_address || null,
            coingecko_id: data.coingecko_id || null,
            coingecko_image: data.coingecko_image || null,
            tge_date: data.tge_date || null,
            category: normalizedCategory || null,
            sector: safeSector,
            notes: data.notes || null,
            status: 'draft',
            completeness: 10,
            created_by: user.id,
          })
          .select()
          .single()

        if (error) throw error

        setTokenId(tokenData.id)
        setInitialUpdatedAt(tokenData.updated_at)
      }

      setTgeDate(data.tge_date)
      calculateCompletedSteps()
      if (!opts.silent) {
        toast.success(isEditMode ? 'Identity updated' : 'Token created. All sections are open.')
      }
      return true
    } catch (error: unknown) {
      console.error('Error saving token:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save token')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 2 - Supply Metrics
  const onSubmitStep2 = async (data: SupplyMetricsFormData, opts: SaveOpts = {}): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    try {
      setLoading(true)

      // Store max supply for step 3 calculations
      setMaxSupply(data.max_supply || '')

      // Convert string numbers to bigint strings
      const maxSupplyNum = data.max_supply ? BigInt(data.max_supply.replace(/,/g, '')) : null
      const initialSupply = data.initial_supply ? BigInt(data.initial_supply.replace(/,/g, '')) : null
      const tgeSupply = data.tge_supply ? BigInt(data.tge_supply.replace(/,/g, '')) : null
      const circulatingSupply = data.circulating_supply
        ? BigInt(data.circulating_supply.replace(/,/g, ''))
        : null

      const { data: newUpdatedAt, error } = await supabase.rpc('save_supply_metrics_tx', {
        p_token_id: tokenId,
        p_metrics: {
          max_supply: maxSupplyNum ? maxSupplyNum.toString() : null,
          initial_supply: initialSupply ? initialSupply.toString() : null,
          tge_supply: tgeSupply ? tgeSupply.toString() : null,
          circulating_supply: circulatingSupply ? circulatingSupply.toString() : null,
          circulating_date: data.circulating_date || null,
          source_url: data.source_url || null,
          notes: data.notes || null,
        },
        p_expected_updated_at: initialUpdatedAt,
      })

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(newUpdatedAt)

      calculateCompletedSteps()
      if (!opts.silent) toast.success('Supply metrics saved')
      return true
    } catch (error: unknown) {
      console.error('Error saving supply metrics:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save supply metrics')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 3 - Allocations
  const onSubmitStep3 = async (data: AllocationsFormData, opts: SaveOpts = {}): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    try {
      setLoading(true)

      const segmentsPayload = data.segments.map(segment => ({
        id: segment.id || null,
        segment_type: toSupportedSegmentType(segment.segment_type),
        label: segment.label,
        percentage: parseFloat(segment.percentage),
        token_amount: segment.token_amount ? BigInt(String(segment.token_amount).replace(/,/g, '')).toString() : null,
        wallet_address: segment.wallet_address || null,
      }))

      // Pre-compute completeness for atomic save
      const s1 = step1Form.getValues()
      const s2 = step2Form.getValues()
      const s3Total = data.segments.reduce((t, s) => t + (parseFloat(s.percentage) || 0), 0)
      const clusterScoresStep3 = {
        identity: 10 + (s1.contract_address ? 5 : 0) + (s1.tge_date ? 5 : 0),
        supply: s2.max_supply ? 10 + ((s2.initial_supply || s2.tge_supply) ? 5 : 0) : 0,
        allocation: (data.segments.length >= 3 ? 10 : 0) + (Math.abs(s3Total - 100) < 0.01 ? 10 : 0),
        vesting: 0,
      }
      const completeness = Math.min(
        clusterScoresStep3.identity + clusterScoresStep3.supply + clusterScoresStep3.allocation + clusterScoresStep3.vesting,
        100
      )

      const { data: rpcResult, error } = await supabase.rpc('save_allocations_tx', {
        p_token_id: tokenId,
        p_segments: segmentsPayload,
        p_expected_updated_at: initialUpdatedAt,
        p_completeness: completeness,
        p_cluster_scores: clusterScoresStep3,
      })

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(rpcResult.updated_at)

      // Refresh allocations state from RPC result
      const allocationsWithIds = (rpcResult.segments || []).map((alloc: { id: string; segment_type: string; label: string; percentage: number; token_amount: string | null; wallet_address: string | null }) => ({
        id: alloc.id,
        segment_type: toSupportedSegmentType(alloc.segment_type),
        label: alloc.label,
        percentage: alloc.percentage.toString(),
        token_amount: alloc.token_amount ? String(alloc.token_amount) : '',
        wallet_address: alloc.wallet_address || '',
      }))
      setAllocations(allocationsWithIds)

      // Sync DB-issued ids back into the form rows (matched by label + type).
      // The RPC inserts unknown ids as new rows, so keeping the form on client
      // UUIDs would make every subsequent save a delete-and-recreate, wiping
      // the vesting schedules that hang off the old allocation ids.
      const unclaimed = [...allocationsWithIds]
      data.segments.forEach((seg, index) => {
        const matchIdx = unclaimed.findIndex(
          (a) =>
            a.label === seg.label &&
            a.segment_type === toSupportedSegmentType(seg.segment_type),
        )
        if (matchIdx >= 0) {
          const [match] = unclaimed.splice(matchIdx, 1)
          if (match.id !== seg.id) {
            step3Form.setValue(`segments.${index}.id`, match.id, {
              shouldDirty: false,
              shouldValidate: false,
            })
          }
        }
      })

      // Read-only: fetch vesting data for Step 4 form rebuild
      const allocationIds = (rpcResult.segments || []).map((s: { id: string }) => s.id)
      const { data: vestingData } = await supabase
        .from('vesting_schedules')
        .select('*')
        .in('allocation_id', allocationIds.length > 0 ? allocationIds : [''])

      step4Form.reset({
        schedules: buildStep4Schedules(
          (rpcResult.segments || []).map((alloc: { id: string; segment_type: string }) => ({ id: alloc.id, segment_type: alloc.segment_type })),
          vestingData || []
        ),
      })

      calculateCompletedSteps()
      if (!opts.silent) toast.success('Allocations saved. Vesting builds on these segments.')
      return true
    } catch (error: unknown) {
      console.error('Error saving allocations:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save allocations')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 4 - Vesting Schedules
  const onSubmitStep4 = async (data: VestingSchedulesFormData, opts: SaveOpts = {}): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    try {
      setLoading(true)

      const allocationIds = allocations.map(a => a.id)

      const schedulesToSave = Object.entries(data.schedules).map(([allocationId, schedule]) => ({
        allocation_id: allocationId,
        cliff_months: schedule.cliff_months ? parseInt(schedule.cliff_months) : 0,
        duration_months: schedule.duration_months ? parseInt(schedule.duration_months) : 0,
        frequency: normalizeVestingFrequency(schedule.frequency),
        tge_percentage: schedule.tge_percentage ? parseFloat(schedule.tge_percentage) : 0,
        cliff_unlock_percentage: schedule.cliff_unlock_percentage ? parseFloat(schedule.cliff_unlock_percentage) : 0,
        notes: schedule.notes || null,
      }))

      // Pre-compute completeness for atomic save
      const s1v = step1Form.getValues()
      const s2v = step2Form.getValues()
      const s3v = step3Form.getValues()
      const s3TotalV = s3v.segments.reduce((t, s) => t + (parseFloat(s.percentage) || 0), 0)
      const clusterScoresStep4 = {
        identity: 10 + (s1v.contract_address ? 5 : 0) + (s1v.tge_date ? 5 : 0),
        supply: s2v.max_supply ? 10 + ((s2v.initial_supply || s2v.tge_supply) ? 5 : 0) : 0,
        allocation: (s3v.segments.length >= 3 ? 10 : 0) + (Math.abs(s3TotalV - 100) < 0.01 ? 10 : 0),
        vesting: 20,
      }
      const completeness = calculateCompleteness(s1v, s2v, s3v) + 20

      const { data: newUpdatedAt, error } = await supabase.rpc('save_vesting_schedules_tx', {
        p_token_id: tokenId,
        p_allocation_ids: allocationIds,
        p_schedules: schedulesToSave,
        p_expected_updated_at: initialUpdatedAt,
        p_completeness: Math.min(completeness, 100),
        p_cluster_scores: clusterScoresStep4,
      })

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(newUpdatedAt)

      calculateCompletedSteps()
      if (!opts.silent) toast.success('Vesting schedules saved')
      return true
    } catch (error: unknown) {
      console.error('Error saving vesting schedules:', error)
      const pgError = error as { code?: string; message?: string } | null
      if (
        pgError?.code === '23514' &&
        String(pgError?.message || '').includes('vesting_schedules_frequency_check')
      ) {
        toast.error('Database schema is outdated: apply the vesting frequency migration (yearly).')
      } else if (pgError?.message?.includes('CONFLICT')) {
        toast.error('This token was modified by someone else. Please refresh and try again.')
      } else {
        toast.error(error instanceof Error ? error.message : 'Failed to save vesting schedules')
      }
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 5 - Emission Model
  const onSubmitStep5 = async (data: EmissionModelFormData, opts: SaveOpts = {}): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    try {
      setLoading(true)

      // Prepare inflation schedule as JSONB
      const inflationSchedule = data.inflation_schedule && data.inflation_schedule.length > 0
        ? data.inflation_schedule.map(item => ({
            year: parseInt(item.year),
            rate: parseFloat(item.rate)
          }))
        : null

      const { data: newUpdatedAt, error } = await supabase.rpc('save_emission_model_tx', {
        p_token_id: tokenId,
        p_model: {
          type: data.type,
          annual_inflation_rate: data.annual_inflation_rate ? parseFloat(data.annual_inflation_rate) : null,
          inflation_schedule: inflationSchedule,
          has_burn: data.has_burn || false,
          burn_details: data.burn_details || null,
          has_buyback: data.has_buyback || false,
          buyback_details: data.buyback_details || null,
          notes: data.notes || null,
        },
        p_expected_updated_at: initialUpdatedAt,
      })

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(newUpdatedAt)

      calculateCompletedSteps()
      if (!opts.silent) toast.success('Emission model saved')
      return true
    } catch (error: unknown) {
      console.error('Error saving emission model:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save emission model')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 6 - Data Sources
  const onSubmitStep6 = async (data: DataSourcesFormData, opts: SaveOpts = {}): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    if (!initialUpdatedAt) {
      toast.error('Token state not loaded. Please refresh the page.')
      return false
    }

    try {
      setLoading(true)

      const sourcesToSave = data.sources.map((source) => ({
        source_type: source.source_type,
        document_name: source.document_name,
        url: source.url,
        version: source.version || null,
        verified_at: source.verified_at || null,
      }))

      // Flatten attributions to individual claim_source rows with source index
      const attributionsToSave = (data.attributions || []).flatMap(attr =>
        attr.data_source_ids.map(idx => ({
          source_index: parseInt(idx),
          claim_type: attr.claim_type,
          claim_id: attr.claim_id || null,
        }))
      )

      // Pre-compute final completeness BEFORE the RPC
      // Use calculateFinalCompleteness but override sourcesCount with form data
      const { totalScore: finalCompleteness, clusterScores } = await calculateFinalCompletenessWithSourceCount(data.sources.length)

      const { data: rpcResult, error } = await supabase.rpc('save_data_sources_tx', {
        p_token_id: tokenId,
        p_sources: sourcesToSave,
        p_attributions: attributionsToSave,
        p_expected_updated_at: initialUpdatedAt,
        p_completeness: Math.round(finalCompleteness),
        p_cluster_scores: clusterScores,
      })

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(rpcResult.updated_at)
      setFinalScore(finalCompleteness)

      if (!opts.silent) toast.success('Data sources saved')
      return true
    } catch (error: unknown) {
      console.error('Error saving data sources:', error)
      const msg = error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Failed to save data sources'
      toast.error(msg || 'Failed to save data sources')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 7 - Risk Flags (final step).
  // Uses save_risk_flags_tx, a SECURITY DEFINER RPC that does the destructive
  // delete -> insert atomically with an ownership check and the same optimistic
  // lock as the other steps (mirrors save_data_sources_tx). This replaces the
  // earlier raw client-side delete()+insert(), which was non-atomic and had no
  // server-side ownership guard.
  const onSubmitStep7 = async (data: RiskFlagsFormData, opts: SaveOpts = {}): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    if (!initialUpdatedAt) {
      toast.error('Token state not loaded. Please refresh the page.')
      return false
    }

    try {
      setLoading(true)

      const flagsToSave = data.flags.map((flag) => ({
        flag_type: flag.flag_type,
        severity: normalizeRiskSeverity(flag.severity),
        is_flagged: flag.is_flagged,
        justification: flag.justification || null,
      }))

      const { data: rpcResult, error } = await supabase.rpc('save_risk_flags_tx', {
        p_token_id: tokenId,
        p_flags: flagsToSave,
        p_expected_updated_at: initialUpdatedAt,
      })

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(rpcResult.updated_at)

      // Sync form state with the freshly persisted rows (new UUIDs, in order)
      const newFlagIds: string[] = rpcResult.flag_ids || []
      step7Form.reset({
        flags: data.flags.map((flag, idx) => ({
          id: newFlagIds[idx] ?? flag.id,
          flag_type: flag.flag_type,
          severity: normalizeRiskSeverity(flag.severity),
          is_flagged: flag.is_flagged ?? true,
          justification: flag.justification || '',
        })),
      })

      // Autosave only persists; the completion screen fires on the explicit
      // "Finish and review" action, whatever order the sections were saved in.
      if (!opts.silent) {
        if (finalScore !== null) {
          setCurrentStep(COMPLETION_STEP)
        } else {
          const { totalScore } = await calculateFinalCompletenessWithSourceCount(
            step6Form.getValues('sources')?.length ?? 0
          )
          setFinalScore(totalScore)
          setCurrentStep(COMPLETION_STEP)
        }
      }
      return true
    } catch (error: unknown) {
      console.error('Error saving risk flags:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save risk flags')
      return false
    } finally {
      setLoading(false)
    }
  }

  // Calculate final completeness score with an explicit source count
  // Used by Step 6 to compute scores BEFORE the RPC saves the new sources
  const calculateFinalCompletenessWithSourceCount = async (sourcesCount: number): Promise<{ totalScore: number; clusterScores: { identity: number; supply: number; allocation: number; vesting: number } }> => {
    try {
      const { data: tokenData } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', tokenId)
        .single()

      if (!tokenData) return { totalScore: 0, clusterScores: { identity: 0, supply: 0, allocation: 0, vesting: 0 } }

      const { data: supplyData } = await supabase
        .from('supply_metrics')
        .select('*')
        .eq('token_id', tokenId)
        .single()

      const { data: allocData } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', tokenId)

      const { data: vestingData } = await supabase
        .from('vesting_schedules')
        .select('*')
        .in('allocation_id', allocData?.map(a => a.id) || [])

      const { data: emissionData } = await supabase
        .from('emission_models')
        .select('*')
        .eq('token_id', tokenId)
        .single()

      return computeScores({
        token: tokenData,
        supply: supplyData,
        allocations: allocData || [],
        vestingCount: vestingData?.length ?? 0,
        emission: emissionData,
        sourcesCount: sourcesCount,
      })
    } catch (error) {
      console.error('Error calculating completeness:', error)
      return { totalScore: 0, clusterScores: { identity: 0, supply: 0, allocation: 0, vesting: 0 } }
    }
  }

  const openIdentityGuide = (target: 'category' | 'sector') => {
    setIdentityGuideTarget(target)
  }

  const closeIdentityGuide = () => {
    setIdentityGuideTarget(null)
  }

  const applyCategoryFromGuide = (category: string, closeGuide = true) => {
    step1Form.setValue('category', category, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    })

    const currentSector = step1Form.getValues('sector')
    if (currentSector && !isSectorCompatibleWithCategory(category, currentSector)) {
      step1Form.setValue('sector', undefined, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      })
    }

    if (closeGuide) {
      closeIdentityGuide()
    }
  }

  const applySectorFromGuide = (sector: string) => {
    const sectorOption = getSectorOption(sector)
    if (!sectorOption) return

    step1Form.setValue('category', sectorOption.category, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    })
    step1Form.setValue('sector', sectorOption.value, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    })
    closeIdentityGuide()
  }

  // Add new allocation segment
  const addSegment = () => {
    append({
      id: crypto.randomUUID(),
      segment_type: '',
      label: '',
      percentage: '',
      token_amount: '',
      wallet_address: '',
    })
  }

  const openSegmentGuide = (index: number) => {
    setSegmentGuideRowIndex(index)
  }

  const closeSegmentGuide = () => {
    setSegmentGuideRowIndex(null)
  }

  const applySegmentTypeFromGuide = (segmentType: string) => {
    if (segmentGuideRowIndex === null) return

    step3Form.setValue(`segments.${segmentGuideRowIndex}.segment_type`, segmentType, {
      shouldDirty: true,
      shouldValidate: true,
      shouldTouch: true,
    })
    closeSegmentGuide()
  }

  // Prevent scroll from changing number input values
  const preventScrollChange = (e: React.WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur()
  }

  const selectInputValue = (e: React.MouseEvent<HTMLInputElement>) => {
    e.currentTarget.select()
  }

  // Handle frequency change - auto-fill for immediate vesting
  const handleFrequencyChange = (allocationId: string, frequency: string) => {
    const normalizedFrequency = normalizeVestingFrequency(frequency)

    if (normalizedFrequency === 'immediate') {
      step4Form.setValue(`schedules.${allocationId}.cliff_months`, '0')
      step4Form.setValue(`schedules.${allocationId}.duration_months`, '0')
      step4Form.setValue(`schedules.${allocationId}.tge_percentage`, '100')
      step4Form.setValue(`schedules.${allocationId}.cliff_unlock_percentage`, '')
    } else if (step4Form.getValues(`schedules.${allocationId}.tge_percentage`) === '100') {
      // Reset if switching away from immediate
      step4Form.setValue(`schedules.${allocationId}.tge_percentage`, '')
    }
  }

  // Add new data source
  const addSource = () => {
    appendSource({
      id: crypto.randomUUID(),
      source_type: '',
      document_name: '',
      url: '',
      version: '',
      verified_at: undefined,
    })
  }

  // Add new risk flag
  const addRisk = () => {
    appendRisk({
      id: crypto.randomUUID(),
      flag_type: '',
      severity: 'medium',
      is_flagged: true,
      justification: '',
    })
  }

  // ── Studio orchestration: autosave, auto-draft, navigation, autofill ───────

  type SectionForm =
    | typeof step1Form
    | typeof step2Form
    | typeof step3Form
    | typeof step4Form
    | typeof step5Form
    | typeof step6Form
    | typeof step7Form

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
  // closes over fresh state (initialUpdatedAt for the optimistic lock).
  const saveSectionRef = useRef<(key: StudioSectionKey) => Promise<boolean>>(async () => false)
  saveSectionRef.current = async (key: StudioSectionKey) => {
    switch (key) {
      case 'identity':
        return onSubmitStep1(step1Form.getValues(), { silent: true })
      case 'supply':
        return onSubmitStep2(step2Form.getValues(), { silent: true })
      case 'allocation':
        return onSubmitStep3(step3Form.getValues(), { silent: true })
      case 'vesting':
        return onSubmitStep4(step4Form.getValues(), { silent: true })
      case 'emission':
        return onSubmitStep5(step5Form.getValues(), { silent: true })
      case 'sources':
        return onSubmitStep6(step6Form.getValues(), { silent: true })
      case 'risk':
        return onSubmitStep7(step7Form.getValues(), { silent: true })
    }
  }

  const allocationsRef = useRef(allocations)
  useEffect(() => {
    allocationsRef.current = allocations
  }, [allocations])

  /** Persist the active section if it is dirty and valid. Powers autosave. */
  const autosaveActiveRef = useRef<() => Promise<void>>(async () => {})
  autosaveActiveRef.current = async () => {
    const key = activeSectionRef.current
    if (!tokenIdRef.current) return
    const form = sectionFormsRef.current[key]
    if (!form.formState.isDirty) return
    if (key === 'vesting' && allocationsRef.current.length === 0) return
    // Emission with no type picked yet: the only required field is untouched
    if (key === 'emission' && !step5Form.getValues('type')) return
    const valid = await form.trigger()
    if (!valid) {
      setAutosave({ status: 'invalid', at: null })
      return
    }
    setAutosave((a) => ({ status: 'saving', at: a.at }))
    const ok = await enqueueSave(() => saveSectionRef.current(key))
    setAutosave(ok ? { status: 'saved', at: Date.now() } : { status: 'error', at: null })
  }

  // One debounced autosave pipeline across all section forms. Only real user
  // edits (type === 'change') schedule a save; programmatic reset/setValue
  // (e.g. rebuilding vesting rows after an allocation save) do not.
  useEffect(() => {
    const forms = Object.values(sectionFormsRef.current)
    const subs = forms.map((form) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- union of 7 form value shapes
      (form as any).watch((_values: unknown, info: { type?: string }) => {
        if (info?.type !== 'change') return
        if (!tokenIdRef.current) return
        setAutosave((a) => (a.status === 'saving' ? a : { status: 'pending', at: a.at }))
        if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = window.setTimeout(() => {
          void autosaveActiveRef.current()
        }, 1800)
      })
    )
    return () => {
      subs.forEach((s: { unsubscribe: () => void }) => s.unsubscribe())
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    }
  }, [])

  // Auto-draft: the padlock killer. As soon as a valid name + ticker exist,
  // the draft creates itself silently and every section opens.
  const draftNameW = step1Form.watch('name')
  const draftTickerW = step1Form.watch('ticker')
  useEffect(() => {
    if (tokenId || isEditMode || autoDraftBusyRef.current) return
    if (!draftNameW?.trim() || !draftTickerW?.trim()) return
    const timer = window.setTimeout(async () => {
      if (autoDraftBusyRef.current || tokenIdRef.current) return
      autoDraftBusyRef.current = true
      const valid = await step1Form.trigger(['name', 'ticker'])
      if (!valid) {
        autoDraftBusyRef.current = false
        return
      }
      const ok = await enqueueSave(() =>
        onSubmitStep1(step1Form.getValues(), { silent: true })
      )
      if (ok) {
        setAutosave({ status: 'saved', at: Date.now() })
        toast.success('Draft created. All sections are open.')
      } else {
        // allow a retry on the next edit
        autoDraftBusyRef.current = false
      }
    }, 1200)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftNameW, draftTickerW, tokenId, isEditMode])

  /** Switch sections; the one being left autosaves in the background. */
  const goSection = (key: StudioSectionKey, opts: { skipSave?: boolean } = {}) => {
    if (key === activeSection) return
    if (!opts.skipSave) void autosaveActiveRef.current()
    setActiveSection(key)
    const params = new URLSearchParams(window.location.search)
    params.set('section', key)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const activeIndex = SECTION_ORDER.indexOf(activeSection)
  const prevSectionKey = activeIndex > 0 ? SECTION_ORDER[activeIndex - 1] : null
  const nextSectionKey =
    activeIndex < SECTION_ORDER.length - 1 ? SECTION_ORDER[activeIndex + 1] : null

  /** Footer "Continue": persist the current section (surfacing errors), then advance. */
  const handleContinue = async () => {
    const form = sectionFormsRef.current[activeSection]
    if (activeSection === 'identity' && !tokenId) {
      const valid = await form.trigger()
      if (!valid) return
      const ok = await enqueueSave(() => onSubmitStep1(step1Form.getValues(), { silent: true }))
      if (!ok) return
      setAutosave({ status: 'saved', at: Date.now() })
    } else if (tokenId && form.formState.isDirty) {
      if (activeSection === 'vesting' && allocationsRef.current.length === 0) {
        // nothing to persist yet
      } else {
        const valid = await form.trigger()
        if (!valid) return
        setAutosave((a) => ({ status: 'saving', at: a.at }))
        const ok = await enqueueSave(() => saveSectionRef.current(activeSection))
        setAutosave(ok ? { status: 'saved', at: Date.now() } : { status: 'error', at: null })
        if (!ok) return
      }
    }
    if (nextSectionKey) goSection(nextSectionKey, { skipSave: true })
  }

  /** Footer "Finish and review": final save + completion moment. */
  const handleFinish = async () => {
    if (!tokenId) return
    const valid = await step7Form.trigger()
    if (!valid) return
    await enqueueSave(() => onSubmitStep7(step7Form.getValues(), {}))
  }

  /**
   * CoinGecko autofill (docs/redesign/08 §6): one pick fills identity, the
   * contract for the selected chain and the supply figures, and seeds a
   * CoinGecko source row. Never overwrites what the user already typed.
   */
  const autofillFromCoinGecko = async (coinId: string) => {
    try {
      const res = await fetch(`/api/coingecko/profile?id=${encodeURIComponent(coinId)}`)
      if (!res.ok) return
      const profile: CoinGeckoProfile = await res.json()
      let filled = 0

      if (!step1Form.getValues('name') && profile.name) {
        step1Form.setValue('name', profile.name, { shouldDirty: true, shouldValidate: true })
        filled++
      }
      if (!step1Form.getValues('ticker') && profile.symbol) {
        step1Form.setValue('ticker', profile.symbol.toUpperCase(), {
          shouldDirty: true,
          shouldValidate: true,
        })
        filled++
      }

      let chain = step1Form.getValues('chain')
      if (!chain) {
        const knownPlatforms = Object.entries(CHAIN_PLATFORM).filter(
          ([, platform]) => profile.platforms[platform]
        )
        if (knownPlatforms.length === 1) {
          chain = knownPlatforms[0][0]
          step1Form.setValue('chain', chain, { shouldDirty: true, shouldValidate: true })
          filled++
        }
      }
      if (!step1Form.getValues('contract_address') && chain && CHAIN_PLATFORM[chain]) {
        const contract = profile.platforms[CHAIN_PLATFORM[chain]]
        if (contract) {
          step1Form.setValue('contract_address', contract, {
            shouldDirty: true,
            shouldValidate: true,
          })
          filled++
        }
      }

      const fillSupply = (
        field: 'max_supply' | 'circulating_supply',
        value: number | null
      ) => {
        if (value == null || value <= 0) return
        if (step2Form.getValues(field)) return
        const formatted = formatNumber(Math.round(value).toString())
        step2Form.setValue(field, formatted, { shouldDirty: true, shouldValidate: true })
        if (field === 'max_supply') setMaxSupply(formatted)
        filled++
      }
      fillSupply('max_supply', profile.max_supply ?? profile.total_supply)
      fillSupply('circulating_supply', profile.circulating_supply)

      const sources = step6Form.getValues('sources') ?? []
      const cgUrl = `https://www.coingecko.com/en/coins/${profile.id}`
      if (!sources.some((s) => s.url === cgUrl)) {
        appendSource({
          id: crypto.randomUUID(),
          source_type: 'api',
          document_name: 'CoinGecko',
          url: cgUrl,
          version: '',
          verified_at: new Date().toISOString(),
        })
        filled++
      }

      if (filled > 0) {
        toast.success(`Prefilled ${filled} field${filled === 1 ? '' : 's'} from CoinGecko`)
      }
    } catch (error) {
      console.error('CoinGecko autofill failed:', error)
    }
  }

  /** Scale every segment proportionally so the sum lands exactly on 100. */
  const normalizeAllocations = () => {
    const segments = step3Form.getValues('segments')
    const total = segments.reduce((t, s) => t + (parseFloat(s.percentage) || 0), 0)
    if (total <= 0) return
    let allocatedSoFar = 0
    segments.forEach((segment, index) => {
      const pct = parseFloat(segment.percentage) || 0
      const next =
        index === segments.length - 1
          ? Math.max(0, +(100 - allocatedSoFar).toFixed(2))
          : +((pct / total) * 100).toFixed(2)
      allocatedSoFar += next
      step3Form.setValue(`segments.${index}.percentage`, String(next), {
        shouldDirty: true,
        shouldValidate: false,
      })
      step3Form.setValue(`segments.${index}.token_amount`, calculateTokenAmount(String(next), maxSupply), {
        shouldValidate: false,
      })
    })
    setAutosave((a) => (a.status === 'saving' ? a : { status: 'pending', at: a.at }))
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(() => {
      void autosaveActiveRef.current()
    }, 1200)
  }

  // Live token identity values for the page header
  const liveTokenName   = step1Form.watch('name')
  const liveTokenTicker = step1Form.watch('ticker')
  const liveChain       = step1Form.watch('chain')
  const liveCategory    = step1Form.watch('category')
  const liveSector      = step1Form.watch('sector')
  const chainLabel      = BLOCKCHAIN_OPTIONS.find(b => b.value === liveChain)?.label ?? liveChain

  // ── Live score (client-side, mirrors computeScores logic) ──────────────────
  const _lw1name   = step1Form.watch('name')
  const _lw1ticker = step1Form.watch('ticker')
  const _lw1chain  = step1Form.watch('chain')
  const _lw1addr   = step1Form.watch('contract_address')
  const _lw1tge    = step1Form.watch('tge_date')
  const _lw2max    = step2Form.watch('max_supply')
  const _lw2init   = step2Form.watch('initial_supply')
  const _lw2tge    = step2Form.watch('tge_supply')
  const _lw3segs   = step3Form.watch('segments') || []
  const _lw5type   = step5Form.watch('type')
  const _lw5infl   = step5Form.watch('annual_inflation_rate')
  const _lw5burn   = step5Form.watch('has_burn')
  const _lw5buy    = step5Form.watch('has_buyback')
  const _lw6srcs   = step6Form.watch('sources') || []
  const _lw7flags  = step7Form.watch('flags') || []

  const liveIdentityScore   = (_lw1name && _lw1ticker && _lw1chain ? 10 : 0) + (_lw1addr ? 5 : 0) + (_lw1tge ? 5 : 0)
  const liveSupplyScore     = _lw2max ? 10 + ((_lw2init || _lw2tge) ? 5 : 0) : 0
  const _lw3total           = _lw3segs.reduce((t, s) => t + (parseFloat(s.percentage) || 0), 0)
  const liveAllocationScore = (_lw3segs.length >= 3 ? 10 : 0) + (Math.abs(_lw3total - 100) < 0.01 ? 10 : 0)
  const liveVestingScore    = completedSteps.includes(4) ? 20 : 0
  const liveEmissionScore   = _lw5type ? 5 + ((_lw5infl || _lw5burn || _lw5buy) ? 5 : 0) : 0
  const liveSourcesScore    = _lw6srcs.length >= 1 ? 10 : 0
  const liveTotalScore      = Math.min(100, liveIdentityScore + liveSupplyScore + liveAllocationScore + liveVestingScore + liveEmissionScore + liveSourcesScore)

  // Flash animation when score increases
  useEffect(() => {
    const diff = liveTotalScore - prevScoreRef.current
    if (diff > 0) {
      setFlashPts(diff)
      setFlashKey(k => k + 1)
      setShowFlash(true)
      const t = setTimeout(() => setShowFlash(false), 1400)
      prevScoreRef.current = liveTotalScore
      return () => clearTimeout(t)
    }
    prevScoreRef.current = liveTotalScore
  }, [liveTotalScore])

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
