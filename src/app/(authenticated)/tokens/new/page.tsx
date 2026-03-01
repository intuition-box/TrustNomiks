'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { CalendarIcon, ArrowLeft, ArrowRight, Loader2, Plus, X, AlertCircle, CheckCircle2, Clock, CircleHelp, Tag, BarChart2, PieChart, TrendingUp, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { computeScores } from '@/lib/utils/completeness'
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
  tokenIdentitySchema,
  supplyMetricsSchema,
  allocationsSchema,
  vestingSchedulesSchema,
  emissionModelSchema,
  dataSourcesSchema,
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
  IMMEDIATE_SEGMENT_TYPES,
  EMISSION_TYPE_OPTIONS,
  SOURCE_TYPE_OPTIONS,
  type TokenIdentityFormData,
  type SupplyMetricsFormData,
  type AllocationsFormData,
  type VestingSchedulesFormData,
  type EmissionModelFormData,
  type DataSourcesFormData,
  type AllocationSegment,
  type ClaimAttribution,
} from '@/types/form'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AllocationWithId extends AllocationSegment {
  id: string
  token_amount?: string
}

export default function NewTokenPage() {
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
  const [identityGuideTarget, setIdentityGuideTarget] = useState<'category' | 'sector' | null>(null)
  const [segmentGuideRowIndex, setSegmentGuideRowIndex] = useState<number | null>(null)
  const prevScoreRef = useRef(0)
  const [flashPts, setFlashPts] = useState(0)
  const [flashKey, setFlashKey] = useState(0)
  const [showFlash, setShowFlash] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Step 1 Form
  const step1Form = useForm<TokenIdentityFormData>({
    resolver: zodResolver(tokenIdentitySchema),
    defaultValues: {
      name: '',
      ticker: '',
      chain: undefined,
      contract_address: '',
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

  // Build the default attribution rows.
  // Uses allocation.id as claim_id for both allocation_segment and vesting_schedule.
  // Pass overrideAllocations when calling from within an async function where React
  // state may not yet reflect freshly loaded data (e.g. loadTokenData).
  const buildDefaultAttributions = (
    existingAttributions?: ClaimAttribution[],
    overrideAllocations?: AllocationWithId[]
  ): ClaimAttribution[] => {
    const allocs = overrideAllocations ?? allocations
    const rows: ClaimAttribution[] = [
      { claim_type: 'token_identity',   claim_id: null, label: 'Token Identity',  data_source_ids: [] },
      { claim_type: 'supply_metrics',   claim_id: null, label: 'Supply Metrics',  data_source_ids: [] },
      ...allocs.map(a => ({
        claim_type: 'allocation_segment' as const,
        claim_id: a.id,
        label: `${a.label} (${formatSegmentTypeLabel(a.segment_type)})`,
        data_source_ids: [] as string[],
      })),
      ...allocs.map(a => ({
        claim_type: 'vesting_schedule' as const,
        claim_id: a.id,
        label: `Vesting — ${a.label}`,
        data_source_ids: [] as string[],
      })),
      { claim_type: 'emission_model',   claim_id: null, label: 'Emission Model',  data_source_ids: [] },
    ]
    if (!existingAttributions || existingAttributions.length === 0) return rows
    // Merge existing selections into the default rows
    return rows.map(row => {
      const key = `${row.claim_type}:${row.claim_id ?? 'null'}`
      const existing = existingAttributions.find(
        a => `${a.claim_type}:${a.claim_id ?? 'null'}` === key
      )
      return existing ? { ...row, data_source_ids: existing.data_source_ids } : row
    })
  }

  // Initialise attribution rows once allocations are available (replaces step 6 trigger)
  useEffect(() => {
    if (!tokenId || allocations.length === 0) return
    const current = step6Form.getValues('attributions')
    if (!current || current.length === 0) {
      step6Form.setValue('attributions', buildDefaultAttributions(current))
    }
  }, [tokenId, allocations.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCategory = step1Form.watch('category')
  const selectedCategoryOption = getCategoryOption(selectedCategory)
  const sectorOptions = getSectorOptionsByCategory(selectedCategory)

  const buildStep4Schedules = (
    allocationData: Array<{
      id: string
      segment_type: string
    }>,
    vestingData?: Array<{
      allocation_id: string
      frequency?: string | null
      cliff_months?: number | null
      duration_months?: number | null
      tge_percentage?: number | null
      cliff_unlock_percentage?: number | null
      notes?: string | null
    }>
  ) => {
    const schedules: Record<string, Record<string, string>> = {}

    allocationData.forEach((alloc) => {
      const vestingSchedule = vestingData?.find((v) => v.allocation_id === alloc.id)
      const segmentType = toSupportedSegmentType(alloc.segment_type)
      const isImmediate = IMMEDIATE_SEGMENT_TYPES.includes(segmentType)

      schedules[alloc.id] = vestingSchedule ? {
        allocation_id: alloc.id,
        frequency: normalizeVestingFrequency(
          vestingSchedule.frequency || (isImmediate ? 'immediate' : 'monthly')
        ),
        cliff_months: vestingSchedule.cliff_months?.toString() || (isImmediate ? '0' : ''),
        duration_months: vestingSchedule.duration_months?.toString() || (isImmediate ? '0' : ''),
        tge_percentage: vestingSchedule.tge_percentage?.toString() || (isImmediate ? '100' : ''),
        cliff_unlock_percentage: vestingSchedule.cliff_unlock_percentage?.toString() || '',
        notes: vestingSchedule.notes || '',
      } : {
        allocation_id: alloc.id,
        frequency: normalizeVestingFrequency(isImmediate ? 'immediate' : 'monthly'),
        cliff_months: isImmediate ? '0' : '',
        duration_months: isImmediate ? '0' : '',
        tge_percentage: isImmediate ? '100' : '',
        cliff_unlock_percentage: '',
        notes: '',
      }
    })

    return schedules
  }

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
        const prefilledAttributions = buildDefaultAttributions(undefined, allocationsWithIds).map(row => {
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

  // Format number with commas
  const formatNumber = (value: string) => {
    const digitsOnly = value.replace(/[^\d]/g, '')
    if (!digitsOnly) return ''
    return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  // Calculate token amount from percentage
  const calculateTokenAmount = (percentage: string): string => {
    if (!percentage || !maxSupply) return '0'
    const percentNum = parseFloat(percentage)
    // Handle both string and number for maxSupply
    const supplyStr = String(maxSupply).replace(/,/g, '')
    const supplyNum = parseFloat(supplyStr)
    if (isNaN(percentNum) || isNaN(supplyNum)) return '0'
    const amount = (supplyNum * percentNum) / 100
    return formatNumber(Math.floor(amount).toString())
  }

  // Calculate percentage from token amount (reverse calculation)
  const calculatePercentage = (tokenAmount: string): string => {
    if (!tokenAmount || !maxSupply) return ''
    // Handle both string and number for tokenAmount
    const amountStr = String(tokenAmount).replace(/,/g, '')
    const amountNum = parseFloat(amountStr)
    // Handle both string and number for maxSupply
    const supplyStr = String(maxSupply).replace(/,/g, '')
    const supplyNum = parseFloat(supplyStr)
    if (isNaN(amountNum) || isNaN(supplyNum) || supplyNum === 0) return ''
    const percentage = (amountNum / supplyNum) * 100
    return percentage.toFixed(2)
  }

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

  // Save Step 1 and create/update token
  const onSubmitStep1 = async (data: TokenIdentityFormData) => {
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
          .select('updated_at')
          .eq('id', tokenId)
          .single()

        if (currentToken && initialUpdatedAt && currentToken.updated_at !== initialUpdatedAt) {
          toast.error('This token was modified by someone else. Please refresh and try again.')
          return
        }

        const { error } = await supabase
          .from('tokens')
          .update({
            name: data.name,
            ticker: data.ticker.toUpperCase(),
            chain: data.chain || null,
            contract_address: data.contract_address || null,
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
      toast.success(isEditMode ? 'Identity updated' : 'Token created — continue filling in the sections below')
    } catch (error: unknown) {
      console.error('Error saving token:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save token')
    } finally {
      setLoading(false)
    }
  }

  // Save Step 2 - Supply Metrics
  const onSubmitStep2 = async (data: SupplyMetricsFormData) => {
    if (!tokenId) {
      toast.error('Token ID not found. Please start from step 1.')
      return
    }

    try {
      setLoading(true)

      // Store max supply for step 3 calculations
      setMaxSupply(data.max_supply || '')

      // Convert string numbers to bigint
      const maxSupplyNum = data.max_supply ? BigInt(data.max_supply.replace(/,/g, '')) : null
      const initialSupply = data.initial_supply ? BigInt(data.initial_supply.replace(/,/g, '')) : null
      const tgeSupply = data.tge_supply ? BigInt(data.tge_supply.replace(/,/g, '')) : null
      const circulatingSupply = data.circulating_supply
        ? BigInt(data.circulating_supply.replace(/,/g, ''))
        : null

      // Save supply metrics (upsert with explicit onConflict)
      const { error } = await supabase.from('supply_metrics').upsert({
        token_id: tokenId,
        max_supply: maxSupplyNum ? maxSupplyNum.toString() : null,
        initial_supply: initialSupply ? initialSupply.toString() : null,
        tge_supply: tgeSupply ? tgeSupply.toString() : null,
        circulating_supply: circulatingSupply ? circulatingSupply.toString() : null,
        circulating_date: data.circulating_date || null,
        source_url: data.source_url || null,
        notes: data.notes || null,
      }, { onConflict: 'token_id' })

      if (error) throw error

      calculateCompletedSteps()
      toast.success('Supply metrics saved')
    } catch (error: unknown) {
      console.error('Error saving supply metrics:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save supply metrics')
    } finally {
      setLoading(false)
    }
  }

  // Save Step 3 - Allocations
  const onSubmitStep3 = async (data: AllocationsFormData) => {
    if (!tokenId) {
      toast.error('Token ID not found. Please start from step 1.')
      return
    }

    try {
      setLoading(true)

      // Load current allocations to compute a diff and preserve existing allocation IDs.
      const { data: existingAllocations, error: existingAllocationsError } = await supabase
        .from('allocation_segments')
        .select('id')
        .eq('token_id', tokenId)

      if (existingAllocationsError) throw existingAllocationsError

      const existingIdSet = new Set((existingAllocations || []).map((alloc) => alloc.id))

      // Existing rows that should be updated.
      const segmentsToUpdate = data.segments
        .filter((segment) => segment.id && existingIdSet.has(segment.id))
        .map((segment) => ({
          id: segment.id!,
          token_id: tokenId,
          segment_type: toSupportedSegmentType(segment.segment_type),
          label: segment.label,
          percentage: parseFloat(segment.percentage),
          token_amount: segment.token_amount ? BigInt(String(segment.token_amount).replace(/,/g, '')).toString() : null,
          wallet_address: segment.wallet_address || null,
        }))

      if (segmentsToUpdate.length > 0) {
        const { error } = await supabase
          .from('allocation_segments')
          .upsert(segmentsToUpdate, { onConflict: 'id' })
        if (error) throw error
      }

      // New rows that should be inserted.
      const segmentsToInsert = data.segments
        .filter((segment) => !segment.id || !existingIdSet.has(segment.id))
        .map((segment) => ({
          token_id: tokenId,
          segment_type: toSupportedSegmentType(segment.segment_type),
          label: segment.label,
          percentage: parseFloat(segment.percentage),
          token_amount: segment.token_amount ? BigInt(String(segment.token_amount).replace(/,/g, '')).toString() : null,
          wallet_address: segment.wallet_address || null,
        }))

      if (segmentsToInsert.length > 0) {
        const { error } = await supabase
          .from('allocation_segments')
          .insert(segmentsToInsert)
        if (error) throw error
      }

      // Delete rows removed by the user (this is the only case where vesting should be deleted).
      const submittedExistingIds = new Set(
        data.segments
          .filter((segment) => segment.id && existingIdSet.has(segment.id))
          .map((segment) => segment.id as string)
      )
      const allocationIdsToDelete = (existingAllocations || [])
        .map((alloc) => alloc.id)
        .filter((id) => !submittedExistingIds.has(id))

      if (allocationIdsToDelete.length > 0) {
        const { error } = await supabase
          .from('allocation_segments')
          .delete()
          .in('id', allocationIdsToDelete)
        if (error) throw error
      }

      // Refresh allocations state with DB rows (keeping stable IDs for preserved allocations).
      const { data: savedAllocations, error: savedAllocationsError } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', tokenId)
        .order('percentage', { ascending: false })

      if (savedAllocationsError) throw savedAllocationsError

      const allocationsWithIds = (savedAllocations || []).map((alloc) => ({
        id: alloc.id,
        segment_type: toSupportedSegmentType(alloc.segment_type),
        label: alloc.label,
        percentage: alloc.percentage.toString(),
        token_amount: alloc.token_amount ? String(alloc.token_amount) : '',
        wallet_address: alloc.wallet_address || '',
      }))
      setAllocations(allocationsWithIds)

      // Rebuild Step 4 form with existing vesting values for preserved allocations.
      const allocationIds = (savedAllocations || []).map((alloc) => alloc.id)
      const { data: vestingData } = await supabase
        .from('vesting_schedules')
        .select('*')
        .in('allocation_id', allocationIds.length > 0 ? allocationIds : [''])

      step4Form.reset({
        schedules: buildStep4Schedules(
          (savedAllocations || []).map((alloc) => ({ id: alloc.id, segment_type: alloc.segment_type })),
          vestingData || []
        ),
      })

      // Update token completeness + cluster scores
      const s1 = step1Form.getValues()
      const s2 = step2Form.getValues()
      const s3 = step3Form.getValues()
      const s3Total = s3.segments.reduce((t, s) => t + (parseFloat(s.percentage) || 0), 0)
      const clusterScoresStep3 = {
        identity: 10 + (s1.contract_address ? 5 : 0) + (s1.tge_date ? 5 : 0),
        supply: s2.max_supply ? 10 + ((s2.initial_supply || s2.tge_supply) ? 5 : 0) : 0,
        allocation: (s3.segments.length >= 3 ? 10 : 0) + (Math.abs(s3Total - 100) < 0.01 ? 10 : 0),
        vesting: 0,
      }
      const completeness = calculateCompleteness()
      await supabase.from('tokens').update({ completeness, cluster_scores: clusterScoresStep3 }).eq('id', tokenId)

      calculateCompletedSteps()
      toast.success('Allocations saved — vesting section is now unlocked')
    } catch (error: unknown) {
      console.error('Error saving allocations:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save allocations')
    } finally {
      setLoading(false)
    }
  }

  // Save Step 4 - Vesting Schedules
  const onSubmitStep4 = async (data: VestingSchedulesFormData) => {
    if (!tokenId) {
      toast.error('Token ID not found. Please start from step 1.')
      return
    }

    try {
      setLoading(true)

      // Delete existing vesting schedules first
      const allocationIds = allocations.map(a => a.id)
      await supabase.from('vesting_schedules').delete().in('allocation_id', allocationIds)

      // Save new vesting schedules
      const schedulesToSave = Object.entries(data.schedules).map(([allocationId, schedule]) => ({
        allocation_id: allocationId,
        cliff_months: schedule.cliff_months ? parseInt(schedule.cliff_months) : 0,
        duration_months: schedule.duration_months ? parseInt(schedule.duration_months) : 0,
        frequency: normalizeVestingFrequency(schedule.frequency),
        tge_percentage: schedule.tge_percentage ? parseFloat(schedule.tge_percentage) : 0,
        cliff_unlock_percentage: schedule.cliff_unlock_percentage ? parseFloat(schedule.cliff_unlock_percentage) : 0,
        notes: schedule.notes || null,
      }))

      const { error } = await supabase.from('vesting_schedules').insert(schedulesToSave)

      if (error) throw error

      // Update token completeness + cluster scores (vesting now complete)
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
      const completeness = calculateCompleteness() + 20 // Add vesting score
      await supabase.from('tokens').update({ completeness, cluster_scores: clusterScoresStep4 }).eq('id', tokenId)

      calculateCompletedSteps()
      toast.success('Vesting schedules saved')
    } catch (error: unknown) {
      console.error('Error saving vesting schedules:', error)
      const pgError = error as { code?: string; message?: string } | null
      if (
        pgError?.code === '23514' &&
        String(pgError?.message || '').includes('vesting_schedules_frequency_check')
      ) {
        toast.error('Database schema is outdated: apply the vesting frequency migration (yearly).')
      } else {
        toast.error(error instanceof Error ? error.message : 'Failed to save vesting schedules')
      }
    } finally {
      setLoading(false)
    }
  }

  // Save Step 5 - Emission Model
  const onSubmitStep5 = async (data: EmissionModelFormData) => {
    if (!tokenId) {
      toast.error('Token ID not found. Please start from step 1.')
      return
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

      // Save emission model (upsert with explicit onConflict)
      const { error } = await supabase.from('emission_models').upsert({
        token_id: tokenId,
        type: data.type,
        annual_inflation_rate: data.annual_inflation_rate ? parseFloat(data.annual_inflation_rate) : null,
        inflation_schedule: inflationSchedule,
        has_burn: data.has_burn || false,
        burn_details: data.burn_details || null,
        has_buyback: data.has_buyback || false,
        buyback_details: data.buyback_details || null,
        notes: data.notes || null,
      }, { onConflict: 'token_id' })

      if (error) throw error

      calculateCompletedSteps()
      toast.success('Emission model saved')
    } catch (error: unknown) {
      console.error('Error saving emission model:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save emission model')
    } finally {
      setLoading(false)
    }
  }

  // Save Step 6 - Data Sources
  const onSubmitStep6 = async (data: DataSourcesFormData) => {
    if (!tokenId) {
      toast.error('Token ID not found. Please start from step 1.')
      return
    }

    try {
      setLoading(true)

      // Delete existing sources — claim_sources rows are auto-deleted via ON DELETE CASCADE
      await supabase.from('data_sources').delete().eq('token_id', tokenId)

      // Save new sources and retrieve their new DB-assigned UUIDs (indexed by position)
      let newSourceIds: string[] = []
      if (data.sources.length > 0) {
        const sourcesToSave = data.sources.map((source) => ({
          token_id: tokenId,
          source_type: source.source_type,
          document_name: source.document_name,
          url: source.url,
          version: source.version || null,
          verified_at: source.verified_at || null,
        }))

        const { data: insertedSources, error } = await supabase
          .from('data_sources')
          .insert(sourcesToSave)
          .select('id')
        if (error) throw error
        newSourceIds = (insertedSources || []).map(s => s.id)
      }

      // Save claim_sources: map form source-index → new DB UUID
      if (data.attributions && data.attributions.length > 0 && newSourceIds.length > 0) {
        const claimsToSave = data.attributions
          .flatMap(attr =>
            attr.data_source_ids
              .map(idx => {
                const dbId = newSourceIds[parseInt(idx)]
                if (!dbId) return null
                return {
                  token_id: tokenId,
                  data_source_id: dbId,
                  claim_type: attr.claim_type,
                  claim_id: attr.claim_id || null,
                }
              })
              .filter((r): r is NonNullable<typeof r> => r !== null)
          )
        if (claimsToSave.length > 0) {
          const { error } = await supabase.from('claim_sources').insert(claimsToSave)
          if (error) throw error
        }
      }

      // Calculate final completeness score
      const { totalScore: finalCompleteness, clusterScores } = await calculateFinalCompleteness()
      await supabase.from('tokens').update({ completeness: finalCompleteness, cluster_scores: clusterScores }).eq('id', tokenId)
      setFinalScore(finalCompleteness)

      // Move to completion page (step 7)
      setCurrentStep(7)
    } catch (error: unknown) {
      console.error('Error saving data sources:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save data sources')
    } finally {
      setLoading(false)
    }
  }

  // Calculate final completeness score based on all data
  const calculateFinalCompleteness = async (): Promise<{ totalScore: number; clusterScores: { identity: number; supply: number; allocation: number; vesting: number } }> => {
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

      const { data: sourcesData } = await supabase
        .from('data_sources')
        .select('*')
        .eq('token_id', tokenId)

      return computeScores({
        token: tokenData,
        supply: supplyData,
        allocations: allocData || [],
        vestingCount: vestingData?.length ?? 0,
        emission: emissionData,
        sourcesCount: sourcesData?.length ?? 0,
      })
    } catch (error) {
      console.error('Error calculating completeness:', error)
      return { totalScore: 0, clusterScores: { identity: 0, supply: 0, allocation: 0, vesting: 0 } }
    }
  }

  // Calculate completeness based on filled fields
  const calculateCompleteness = () => {
    let score = 10 // Base score from step 1

    const step1Data = step1Form.getValues()
    if (step1Data.contract_address) score += 5
    if (step1Data.tge_date) score += 5

    const step2Data = step2Form.getValues()
    if (step2Data.max_supply) score += 10
    if (step2Data.max_supply && (step2Data.initial_supply || step2Data.tge_supply)) score += 5

    const step3Data = step3Form.getValues()
    if (step3Data.segments.length >= 3) score += 10
    // Recalculate total percentage from form data
    const calculatedTotal = step3Data.segments.reduce((total, segment) => {
      const percentage = parseFloat(segment.percentage) || 0
      return total + percentage
    }, 0)
    if (calculatedTotal === 100) score += 10

    return Math.min(score, 100)
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

  // Format token amount for display
  const formatTokenAmount = (amount: string | undefined) => {
    if (!amount) return '0'
    return formatNumber(amount)
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
    return (
      <div className="mx-auto max-w-4xl space-y-8 pb-12">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-lg">Loading token data...</span>
        </div>
      </div>
    )
  }

  // ── Helpers for section rendering ──────────────────────────────────────────
  const sectionHeader = (
    dot: string,
    label: string,
    desc: string,
    liveScore: number,
    maxScore: number,
    textColor: string,
    saved: boolean,
  ) => (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border">
      <div className="flex items-center gap-3">
        <div className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <div>
          <span className={`text-xs font-bold uppercase tracking-widest ${textColor}`}>{label}</span>
          <span className="ml-2 text-xs text-muted-foreground">{desc}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {saved && <CheckCircle2 className={`h-3.5 w-3.5 ${textColor} opacity-70`} />}
        <span className={`text-xs font-mono font-semibold ${liveScore > 0 ? textColor : 'text-muted-foreground/40'}`}>
          {liveScore}&thinsp;/&thinsp;{maxScore} pts
        </span>
      </div>
    </div>
  )

  const lockedSection = (message: string) => (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
        <Lock className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )

  // Sidebar cluster data
  const sidebarClusters = [
    { key: 'identity',   label: 'Identity',   bar: 'bg-violet-500', text: 'text-violet-400', live: liveIdentityScore,   max: 20 },
    { key: 'supply',     label: 'Supply',     bar: 'bg-sky-500',    text: 'text-sky-400',    live: liveSupplyScore,     max: 15 },
    { key: 'allocation', label: 'Allocation', bar: 'bg-amber-500',  text: 'text-amber-400',  live: liveAllocationScore, max: 20 },
    { key: 'vesting',    label: 'Vesting',    bar: 'bg-emerald-500',text: 'text-emerald-400',live: liveVestingScore,    max: 20 },
  ]

  // ── Completion screen (after sources saved) ────────────────────────────────
  if (currentStep === 7) {
    return (
      <div className="mx-auto max-w-2xl pb-16 pt-8">
        <div className="rounded-xl border border-primary/20 bg-card overflow-hidden">
          <div className="px-8 py-10 text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h1 className="text-2xl font-bold">Token {isEditMode ? 'Updated' : 'Created'} Successfully!</h1>
            <p className="text-muted-foreground text-sm">Your tokenomics data has been saved and is ready for review.</p>
          </div>

          <div className="px-8 pb-8 space-y-4">
            <div className="grid gap-3">
              <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
                <span className="text-sm font-medium">Token</span>
                <span className="font-semibold">{step1Form.getValues('name')} <span className="font-mono text-primary">{step1Form.getValues('ticker')}</span></span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
                <span className="text-sm font-medium">Completeness Score</span>
                <Badge className="text-base px-3 py-0.5 bg-primary">
                  {finalScore !== null ? `${finalScore} pts` : 'Calculating…'}
                </Badge>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {tokenId && (
                <Button className="flex-1" size="lg" onClick={() => router.push(`/tokens/${tokenId}`)}>
                  View Token Details
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
              <Button variant="outline" className="flex-1" size="lg" onClick={() => router.push('/tokens')}>
                Back to Tokens
              </Button>
              <Button variant="outline" className="flex-1" size="lg" onClick={() => router.push('/tokens/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Add Another
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
                {isEditMode ? 'Edit Token' : 'Add New Token'}
              </h1>
              <p className="text-muted-foreground text-sm">Fill in each cluster section — your score updates live</p>
            </>
          )}
        </div>

        {/* Mobile score pill (visible only on small screens) */}
        <div className="lg:hidden flex-shrink-0 rounded-xl border bg-card px-4 py-3 text-center min-w-[80px]">
          <div className="relative inline-block">
            <span className="text-2xl font-bold tabular-nums">{liveTotalScore}</span>
            {showFlash && (
              <span
                key={flashKey}
                className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-bold text-emerald-400 whitespace-nowrap select-none"
                style={{ animation: 'score-flash 1.4s ease-out forwards' }}
              >
                +{flashPts}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">/ 100 pts</p>
          {/* Cluster dots */}
          <div className="mt-2 flex items-center justify-center gap-1">
            {sidebarClusters.map(c => (
              <div
                key={c.key}
                className={`h-1.5 w-1.5 rounded-full transition-all duration-500 ${c.live === c.max ? c.bar : 'bg-muted-foreground/20'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────────── */}
      <div className="flex gap-8 items-start">

        {/* ── Sidebar (desktop only) ──────────────────────────────────────────── */}
        <aside className="hidden lg:block w-64 xl:w-72 shrink-0 sticky top-4">

          {/* Score panel */}
          <div className="rounded-xl border bg-card p-5 space-y-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Completeness</p>

              {/* Big score + flash */}
              <div className="relative flex items-end gap-2 mb-3">
                <span className="text-5xl font-bold tabular-nums transition-all duration-300">{liveTotalScore}</span>
                <span className="text-sm text-muted-foreground mb-1.5">/ 100 pts</span>
                {showFlash && (
                  <span
                    key={flashKey}
                    className="absolute -top-7 left-0 text-sm font-bold text-emerald-400 whitespace-nowrap select-none"
                    style={{ animation: 'score-flash 1.4s ease-out forwards' }}
                  >
                    +{flashPts} pts
                  </span>
                )}
              </div>

              {/* Global progress bar */}
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${liveTotalScore}%` }}
                />
              </div>
            </div>

            {/* Cluster mini-bars */}
            <div className="space-y-3">
              {sidebarClusters.map(c => (
                <div key={c.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${c.text}`}>{c.label}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{c.live}&thinsp;/&thinsp;{c.max}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${c.bar} rounded-full transition-[width] duration-700 ease-out`}
                      style={{ width: `${(c.live / c.max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Extras */}
            <div className="pt-4 border-t border-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Emission</span>
                <span className={`font-mono ${liveEmissionScore > 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                  {liveEmissionScore}&thinsp;/&thinsp;10
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Sources</span>
                <span className={`font-mono ${liveSourcesScore > 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                  {liveSourcesScore}&thinsp;/&thinsp;10
                </span>
              </div>
            </div>
          </div>

          {/* Section nav */}
          <nav className="mt-3 rounded-xl border bg-card p-3 space-y-0.5">
            {[
              { id: 'section-identity',   label: 'Identity',   icon: '◆', color: 'text-violet-400',  done: completedSteps.includes(1) },
              { id: 'section-supply',     label: 'Supply',     icon: '◆', color: 'text-sky-400',     done: completedSteps.includes(2) },
              { id: 'section-allocation', label: 'Allocation', icon: '◆', color: 'text-amber-400',   done: completedSteps.includes(3) },
              { id: 'section-vesting',    label: 'Vesting',    icon: '◆', color: 'text-emerald-400', done: completedSteps.includes(4) },
              { id: 'section-emission',   label: 'Emission',   icon: '○', color: 'text-muted-foreground', done: completedSteps.includes(5) },
              { id: 'section-sources',    label: 'Sources',    icon: '○', color: 'text-muted-foreground', done: completedSteps.includes(6) },
            ].map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors group"
              >
                <span className="flex items-center gap-2">
                  <span className={`${item.color} group-hover:opacity-100`}>{item.icon}</span>
                  {item.label}
                </span>
                {item.done && <CheckCircle2 className="h-3 w-3 text-muted-foreground/50" />}
              </a>
            ))}
          </nav>
        </aside>

        {/* ── Main content ────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* ── Section 1: Identity (violet) ──────────────────────────────────── */}
          <div id="section-identity" className="rounded-xl border border-l-4 border-l-violet-500 bg-card overflow-hidden">
            {sectionHeader('bg-violet-500', 'Identity', '· Token identification', liveIdentityScore, 20, 'text-violet-400', completedSteps.includes(1))}
            <div className="px-6 py-6">
            <Form {...step1Form}>
              <form onSubmit={step1Form.handleSubmit(onSubmitStep1)} className="space-y-6">
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
                          className="z-[90] w-[22rem] max-w-[calc(100vw-2rem)] border-border/80 bg-card/95 p-3 shadow-2xl shadow-black/50 backdrop-blur"
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

                {/* Actions */}
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Identity'}
                  </Button>
                </div>
              </form>
            </Form>
            </div>
          </div>

          {/* ── Section 2: Supply (sky) ───────────────────────────────────────── */}
          <div id="section-supply" className="rounded-xl border border-l-4 border-l-sky-500 bg-card overflow-hidden">
            {sectionHeader('bg-sky-500', 'Supply', '· Token supply metrics', liveSupplyScore, 15, 'text-sky-400', completedSteps.includes(2))}
            {!tokenId ? lockedSection('Save Identity first to unlock Supply Metrics.') : (
            <div className="px-6 py-6">
            <Form {...step2Form}>
              <form onSubmit={step2Form.handleSubmit(onSubmitStep2)} className="space-y-6">
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
                            className="z-[90] w-[22rem] max-w-[calc(100vw-2rem)] border-border/80 bg-card/95 p-3 shadow-2xl shadow-black/50 backdrop-blur"
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

                {/* Actions */}
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Supply'}
                  </Button>
                </div>
              </form>
            </Form>
            </div>
            )}
          </div>

          {/* ── Section 3: Allocation (amber) ────────────────────────────────── */}
          <div id="section-allocation" className="rounded-xl border border-l-4 border-l-amber-500 bg-card overflow-hidden">
            {sectionHeader('bg-amber-500', 'Allocation', '· Token distribution', liveAllocationScore, 20, 'text-amber-400', completedSteps.includes(3))}
            {!tokenId ? lockedSection('Save Identity first to unlock Allocations.') : (
            <div className="px-6 py-6">
            <Form {...step3Form}>
              <form onSubmit={step3Form.handleSubmit(onSubmitStep3)} className="space-y-6">
                {/* Total Percentage Badge */}
                <div className="flex flex-col gap-3 rounded-lg bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">Total Allocation:</span>
                    <Badge
                      variant={isComplete ? 'default' : 'secondary'}
                      className={cn(
                        'text-base font-bold',
                        isComplete
                          ? 'bg-green-500/10 text-green-500 border-green-500/20'
                          : totalPercentage > 100
                          ? 'bg-red-500/10 text-red-500 border-red-500/20'
                          : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                      )}
                    >
                      {isComplete ? (
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                      ) : (
                        <AlertCircle className="mr-1 h-4 w-4" />
                      )}
                      {totalPercentage.toFixed(2)}%
                    </Badge>
                  </div>
                  {!isComplete && (
                    <span className="text-sm text-muted-foreground">
                      {delta > 0 ? `${delta.toFixed(2)}% remaining` : `${Math.abs(delta).toFixed(2)}% over`}
                    </span>
                  )}
                </div>

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
                            onClick={() => {
                              if (segmentGuideRowIndex === index) {
                                closeSegmentGuide()
                              } else if (segmentGuideRowIndex !== null && segmentGuideRowIndex > index) {
                                setSegmentGuideRowIndex(segmentGuideRowIndex - 1)
                              }
                              remove(index)
                            }}
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
                                      const tokenAmount = calculateTokenAmount(e.target.value)
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
                                      const percentage = calculatePercentage(e.target.value)
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

                {/* Validation Message */}
                {!isComplete && fields.length > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-muted">
                    <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium">Allocation not complete</p>
                      <p className="text-muted-foreground">
                        {delta > 0
                          ? `You still have ${delta.toFixed(2)}% unallocated. You can continue anyway, but having 100% allocation is recommended.`
                          : `You have allocated ${Math.abs(delta).toFixed(2)}% too much. Please adjust your percentages.`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Allocations'}
                  </Button>
                </div>
              </form>
            </Form>
            </div>
            )}
          </div>

          {/* ── Section 4: Vesting (emerald) ─────────────────────────────────── */}
          <div id="section-vesting" className="rounded-xl border border-l-4 border-l-emerald-500 bg-card overflow-hidden">
            {sectionHeader('bg-emerald-500', 'Vesting', '· Unlock schedules', liveVestingScore, 20, 'text-emerald-400', completedSteps.includes(4))}
            {!tokenId ? lockedSection('Save Identity first to unlock Vesting.') :
             !completedSteps.includes(3) ? lockedSection('Save Allocations first — vesting schedules are built from your allocation segments.') : (
            <div className="px-6 py-6">
            {allocations.length === 0 ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Loading allocation segments...</p>
              </div>
            ) : (
              <Form {...step4Form}>
                <form onSubmit={step4Form.handleSubmit(onSubmitStep4)} className="space-y-6">
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
                                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
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

                  {/* Actions */}
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={loading}>
                      {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Vesting'}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
            </div>
            )}
          </div>

          {/* ── Section 5: Emission (extra, gray) ────────────────────────────── */}
          <div id="section-emission" className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Emission</span>
                  <span className="ml-2 text-xs text-muted-foreground">· Inflation &amp; economic mechanisms</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {completedSteps.includes(5) && <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/50" />}
                <span className={`text-xs font-mono font-semibold ${liveEmissionScore > 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                  {liveEmissionScore}&thinsp;/&thinsp;10 pts
                </span>
              </div>
            </div>
            {!tokenId ? lockedSection('Save Identity first to unlock Emission.') : (
            <div className="px-6 py-6">
            <Form {...step5Form}>
              <form onSubmit={step5Form.handleSubmit(onSubmitStep5)} className="space-y-6">
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

                {/* Actions */}
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save Emission'}
                  </Button>
                </div>
              </form>
            </Form>
            </div>
            )}
          </div>

          {/* ── Section 6: Sources (extra, gray) ─────────────────────────────── */}
          <div id="section-sources" className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sources</span>
                  <span className="ml-2 text-xs text-muted-foreground">· Data references &amp; attribution</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {completedSteps.includes(6) && <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/50" />}
                <span className={`text-xs font-mono font-semibold ${liveSourcesScore > 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                  {liveSourcesScore}&thinsp;/&thinsp;10 pts
                </span>
              </div>
            </div>
            {!tokenId ? lockedSection('Save Identity first to unlock Sources.') : (
            <div className="px-6 py-6">
            <Form {...step6Form}>
              <form onSubmit={step6Form.handleSubmit(onSubmitStep6)} className="space-y-6">
                {/* Info Banner */}
                {sourceFields.length === 0 && (
                  <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-500">No sources added yet</p>
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
                            onClick={() => removeSource(index)}
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
                                      className="z-[90] w-[22rem] max-w-[calc(100vw-2rem)] border-border/80 bg-card/95 p-3 shadow-2xl shadow-black/50 backdrop-blur"
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

                {/* Actions */}
                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={loading}>
                    {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Complete & Review'}
                  </Button>
                </div>
              </form>
            </Form>
            </div>
            )}
          </div>

        </div>{/* end main content */}
      </div>{/* end two-column layout */}
    </div>
  )
}
