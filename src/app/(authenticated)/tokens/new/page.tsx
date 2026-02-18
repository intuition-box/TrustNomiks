'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { CalendarIcon, ArrowLeft, ArrowRight, Loader2, Plus, X, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { TokenFormStepper } from '@/components/token-form-stepper'
import {
  tokenIdentitySchema,
  supplyMetricsSchema,
  allocationsSchema,
  vestingSchedulesSchema,
  emissionModelSchema,
  dataSourcesSchema,
  BLOCKCHAIN_OPTIONS,
  CATEGORY_OPTIONS,
  SEGMENT_TYPE_OPTIONS,
  VESTING_FREQUENCY_OPTIONS,
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
  const [tgeDate, setTgeDate] = useState<string | undefined>(undefined)
  const [allocations, setAllocations] = useState<AllocationWithId[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingTokenData, setLoadingTokenData] = useState(isEditMode)
  const [finalScore, setFinalScore] = useState<number | null>(null)
  const [initialUpdatedAt, setInitialUpdatedAt] = useState<string | null>(null)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
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
        segment_type: alloc.segment_type,
        label: alloc.label,
        percentage: alloc.percentage.toString(),
        token_amount: alloc.token_amount || '0',
        wallet_address: alloc.wallet_address || '',
      }))

      setAllocations(allocationsWithIds)

      // Pre-fill vesting schedules with defaults
      const defaultSchedules: Record<string, any> = {}
      allocationsWithIds.forEach((alloc) => {
        const isImmediate = IMMEDIATE_SEGMENT_TYPES.includes(alloc.segment_type)
        defaultSchedules[alloc.id] = {
          allocation_id: alloc.id,
          frequency: isImmediate ? 'immediate' : 'monthly',
          cliff_months: isImmediate ? '0' : '',
          duration_months: isImmediate ? '0' : '',
          hatch_percentage: isImmediate ? '100' : '',
          cliff_unlock_percentage: '',
          notes: '',
        }
      })

      step4Form.reset({ schedules: defaultSchedules })
    } catch (error: any) {
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
        category: tokenData.category || undefined,
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
          max_supply: supplyData.max_supply || '',
          initial_supply: supplyData.initial_supply || '',
          tge_supply: supplyData.tge_supply || '',
          circulating_supply: supplyData.circulating_supply || '',
          circulating_date: supplyData.circulating_date || undefined,
          source_url: supplyData.source_url || '',
          notes: supplyData.notes || '',
        })
        if (supplyData.max_supply) {
          setMaxSupply(supplyData.max_supply)
        }
      }

      // Fetch and pre-fill Step 3 - Allocations
      const { data: allocData } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', id)
        .order('percentage', { ascending: false })

      if (allocData && allocData.length > 0) {
        const allocationsWithIds = allocData.map((alloc) => ({
          id: alloc.id,
          segment_type: alloc.segment_type,
          label: alloc.label,
          percentage: alloc.percentage.toString(),
          token_amount: alloc.token_amount ? String(alloc.token_amount) : '',
          wallet_address: alloc.wallet_address || '',
        }))

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

        const schedules: Record<string, any> = {}

        allocData.forEach((alloc) => {
          const vestingSchedule = vestingData?.find(v => v.allocation_id === alloc.id)
          const isImmediate = IMMEDIATE_SEGMENT_TYPES.includes(alloc.segment_type)

          schedules[alloc.id] = vestingSchedule ? {
            allocation_id: alloc.id,
            frequency: vestingSchedule.frequency || (isImmediate ? 'immediate' : 'monthly'),
            cliff_months: vestingSchedule.cliff_months?.toString() || (isImmediate ? '0' : ''),
            duration_months: vestingSchedule.duration_months?.toString() || (isImmediate ? '0' : ''),
            hatch_percentage: vestingSchedule.hatch_percentage?.toString() || (isImmediate ? '100' : ''),
            cliff_unlock_percentage: vestingSchedule.cliff_unlock_percentage?.toString() || '',
            notes: vestingSchedule.notes || '',
          } : {
            allocation_id: alloc.id,
            frequency: isImmediate ? 'immediate' : 'monthly',
            cliff_months: isImmediate ? '0' : '',
            duration_months: isImmediate ? '0' : '',
            hatch_percentage: isImmediate ? '100' : '',
            cliff_unlock_percentage: '',
            notes: '',
          }
        })

        step4Form.reset({ schedules })
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
        step6Form.reset({
          sources: sourcesData.map(source => ({
            id: source.id,
            source_type: source.source_type,
            document_name: source.document_name,
            url: source.url,
            version: source.version || '',
            verified_at: source.verified_at || undefined,
          }))
        })
      }

      toast.success('Token data loaded successfully')

      // Calculate completed steps after loading
      calculateCompletedSteps()
    } catch (error: any) {
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

  // Handle step navigation
  const handleStepNavigation = (targetStep: number) => {
    // Only allow navigation to current step or completed steps
    if (targetStep <= currentStep || completedSteps.includes(targetStep)) {
      setCurrentStep(targetStep)
    }
  }

  // Load token data on mount if editing
  useEffect(() => {
    if (isEditMode && editTokenId) {
      loadTokenData(editTokenId)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load allocations when reaching step 4 (fallback if not already loaded by onSubmitStep3)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (currentStep === 4 && tokenId && allocations.length === 0) {
      loadAllocationsForVesting()
    }
  }, [currentStep, tokenId])

  // Format number with commas
  const formatNumber = (value: string) => {
    const num = value.replace(/,/g, '')
    if (!/^\d*$/.test(num)) return value
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
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
            category: data.category || null,
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
            category: data.category || null,
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
      setCurrentStep(2)
    } catch (error: any) {
      console.error('Error saving token:', error)
      toast.error(error.message || 'Failed to save token')
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
      setCurrentStep(3)
    } catch (error: any) {
      console.error('Error saving supply metrics:', error)
      toast.error(error.message || 'Failed to save supply metrics')
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

      // Delete existing allocations first (also cascades to vesting_schedules)
      await supabase.from('allocation_segments').delete().eq('token_id', tokenId)

      // Save new allocations and get back the DB-generated IDs
      const allocationsToSave = data.segments.map((segment) => ({
        token_id: tokenId,
        segment_type: segment.segment_type,
        label: segment.label,
        percentage: parseFloat(segment.percentage),
        token_amount: segment.token_amount ? BigInt(String(segment.token_amount).replace(/,/g, '')).toString() : null,
        wallet_address: segment.wallet_address || null,
      }))

      const { data: insertedAllocations, error } = await supabase
        .from('allocation_segments')
        .insert(allocationsToSave)
        .select()

      if (error) throw error

      // Refresh allocations state with the real DB IDs
      const allocationsWithIds = (insertedAllocations || []).map((alloc) => ({
        id: alloc.id,
        segment_type: alloc.segment_type,
        label: alloc.label,
        percentage: alloc.percentage.toString(),
        token_amount: alloc.token_amount ? String(alloc.token_amount) : '',
        wallet_address: alloc.wallet_address || '',
      }))
      setAllocations(allocationsWithIds)

      // Pre-fill vesting schedules with defaults using the real DB IDs
      const defaultSchedules: Record<string, any> = {}
      allocationsWithIds.forEach((alloc) => {
        const isImmediate = IMMEDIATE_SEGMENT_TYPES.includes(alloc.segment_type)
        defaultSchedules[alloc.id] = {
          allocation_id: alloc.id,
          frequency: isImmediate ? 'immediate' : 'monthly',
          cliff_months: isImmediate ? '0' : '',
          duration_months: isImmediate ? '0' : '',
          hatch_percentage: isImmediate ? '100' : '',
          cliff_unlock_percentage: '',
          notes: '',
        }
      })
      step4Form.reset({ schedules: defaultSchedules })

      // Update token completeness
      const completeness = calculateCompleteness()
      await supabase.from('tokens').update({ completeness }).eq('id', tokenId)

      // Move to Step 4: Vesting
      calculateCompletedSteps()
      setCurrentStep(4)
    } catch (error: any) {
      console.error('Error saving allocations:', error)
      toast.error(error.message || 'Failed to save allocations')
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
        frequency: schedule.frequency || 'monthly',
        hatch_percentage: schedule.hatch_percentage ? parseFloat(schedule.hatch_percentage) : 0,
        cliff_unlock_percentage: schedule.cliff_unlock_percentage ? parseFloat(schedule.cliff_unlock_percentage) : 0,
        notes: schedule.notes || null,
      }))

      const { error } = await supabase.from('vesting_schedules').insert(schedulesToSave)

      if (error) throw error

      // Update token completeness
      const completeness = calculateCompleteness() + 20 // Add vesting score
      await supabase.from('tokens').update({ completeness }).eq('id', tokenId)

      // Move to Step 5: Emission Model
      calculateCompletedSteps()
      setCurrentStep(5)
    } catch (error: any) {
      console.error('Error saving vesting schedules:', error)
      toast.error(error.message || 'Failed to save vesting schedules')
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

      // Move to Step 6: Sources
      calculateCompletedSteps()
      setCurrentStep(6)
    } catch (error: any) {
      console.error('Error saving emission model:', error)
      toast.error(error.message || 'Failed to save emission model')
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

      // Delete existing sources first
      await supabase.from('data_sources').delete().eq('token_id', tokenId)

      // Save new sources
      if (data.sources.length > 0) {
        const sourcesToSave = data.sources.map((source) => ({
          token_id: tokenId,
          source_type: source.source_type,
          document_name: source.document_name,
          url: source.url,
          version: source.version || null,
          verified_at: source.verified_at || null,
        }))

        const { error } = await supabase.from('data_sources').insert(sourcesToSave)
        if (error) throw error
      }

      // Calculate final completeness score
      const finalCompleteness = await calculateFinalCompleteness()
      await supabase.from('tokens').update({ completeness: finalCompleteness }).eq('id', tokenId)
      setFinalScore(finalCompleteness)

      // Move to completion page (step 7)
      setCurrentStep(7)
    } catch (error: any) {
      console.error('Error saving data sources:', error)
      toast.error(error.message || 'Failed to save data sources')
    } finally {
      setLoading(false)
    }
  }

  // Calculate final completeness score based on all data
  const calculateFinalCompleteness = async () => {
    let score = 0

    try {
      // Fetch token data
      const { data: tokenData } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', tokenId)
        .single()

      if (!tokenData) return 0

      // Step 1: Identity (20 points max)
      if (tokenData.name && tokenData.ticker && tokenData.chain) score += 10
      if (tokenData.contract_address) score += 5
      if (tokenData.tge_date) score += 5

      // Step 2: Supply (15 points max)
      const { data: supplyData } = await supabase
        .from('supply_metrics')
        .select('*')
        .eq('token_id', tokenId)
        .single()

      if (supplyData?.max_supply) score += 10
      if (supplyData?.max_supply && (supplyData?.initial_supply || supplyData?.tge_supply)) score += 5

      // Step 3: Allocations (20 points max)
      const { data: allocData } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', tokenId)

      if (allocData && allocData.length >= 3) score += 10
      const totalPercentage = allocData?.reduce((sum, seg) => sum + (seg.percentage || 0), 0) || 0
      if (Math.abs(totalPercentage - 100) < 0.01) score += 10

      // Step 4: Vesting (20 points max)
      const { data: vestingData } = await supabase
        .from('vesting_schedules')
        .select('*')
        .in('allocation_id', allocData?.map(a => a.id) || [])

      if (vestingData && vestingData.length > 0) score += 20

      // Step 5: Emission (10 points max)
      const { data: emissionData } = await supabase
        .from('emission_models')
        .select('*')
        .eq('token_id', tokenId)
        .single()

      if (emissionData?.type) {
        score += 5
        if (emissionData.annual_inflation_rate || emissionData.has_burn || emissionData.has_buyback) {
          score += 5
        }
      }

      // Step 6: Sources (10 points max)
      const { data: sourcesData } = await supabase
        .from('data_sources')
        .select('*')
        .eq('token_id', tokenId)

      if (sourcesData && sourcesData.length >= 1) score += 10

      return Math.min(score, 100)
    } catch (error) {
      console.error('Error calculating completeness:', error)
      return 0
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

  // Go back to previous step
  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  // Prevent scroll from changing number input values
  const preventScrollChange = (e: React.WheelEvent<HTMLInputElement>) => {
    e.currentTarget.blur()
  }

  // Handle frequency change - auto-fill for immediate vesting
  const handleFrequencyChange = (allocationId: string, frequency: string) => {
    if (frequency === 'immediate') {
      step4Form.setValue(`schedules.${allocationId}.cliff_months`, '0')
      step4Form.setValue(`schedules.${allocationId}.duration_months`, '0')
      step4Form.setValue(`schedules.${allocationId}.hatch_percentage`, '100')
      step4Form.setValue(`schedules.${allocationId}.cliff_unlock_percentage`, '')
    } else if (step4Form.getValues(`schedules.${allocationId}.hatch_percentage`) === '100') {
      // Reset if switching away from immediate
      step4Form.setValue(`schedules.${allocationId}.hatch_percentage`, '')
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

  // Show loading state while loading token data
  if (loadingTokenData) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto pb-12">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-lg">Loading token data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {isEditMode ? 'Edit Token' : 'Add New Token'}
        </h1>
        <p className="text-muted-foreground mt-2">
          Fill in the tokenomics data step by step
        </p>
      </div>

      {/* Stepper */}
      <TokenFormStepper
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={handleStepNavigation}
      />

      {/* Step 1: Token Identity */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Token Identity</CardTitle>
            <CardDescription>
              Basic information about the token project
            </CardDescription>
          </CardHeader>
          <CardContent>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                  {/* Category */}
                  <FormField
                    control={step1Form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                </div>

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
                        <PopoverContent className="w-auto p-0" align="start">
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
                <div className="flex justify-between pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push('/dashboard')}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Next: Supply Metrics
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Supply Metrics */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Supply Metrics</CardTitle>
            <CardDescription>
              Token supply information and circulation data
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                          <PopoverContent className="w-auto p-0" align="start">
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
                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={handleBack} disabled={loading}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Next: Allocations
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Allocations */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Token Allocations</CardTitle>
            <CardDescription>
              Distribution breakdown across different segments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...step3Form}>
              <form onSubmit={step3Form.handleSubmit(onSubmitStep3)} className="space-y-6">
                {/* Total Percentage Badge */}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
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
                            onClick={() => remove(index)}
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
                                <FormLabel>Segment Type *</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={handleBack} disabled={loading}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Next: Vesting
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Vesting Schedules */}
      {currentStep === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Vesting Schedules</CardTitle>
            <CardDescription>
              Configure unlock schedules for each allocation segment
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                        Segments like liquidity and community are pre-filled with immediate vesting (100% at TGE).
                        Adjust as needed for your tokenomics.
                      </p>
                    </div>
                  </div>

                  {/* Vesting Schedules Accordion */}
                  <Accordion type="multiple" className="space-y-4">
                    {allocations.map((allocation, index) => {
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
                            <div className="flex items-center justify-between w-full pr-4">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="font-mono">
                                  {allocation.segment_type.replace('_', ' ').toUpperCase()}
                                </Badge>
                                <span className="font-medium">{allocation.label}</span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
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

                              {/* Hatch Percentage (TGE Unlock) */}
                              <FormField
                                control={step4Form.control}
                                name={`${scheduleKey}.hatch_percentage` as any}
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
                                  {step4Form.watch(`${scheduleKey}.hatch_percentage` as any) || '0'}% unlocked at TGE
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

                  {/* Actions */}
                  <div className="flex justify-between pt-4">
                    <Button type="button" variant="outline" onClick={handleBack} disabled={loading}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          Next: Emission
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 5: Emission Model */}
      {currentStep === 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Emission Model</CardTitle>
            <CardDescription>
              Token inflation, deflation, and economic mechanisms
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                      <FormItem className="flex flex-row items-center justify-between">
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
                      <FormItem className="flex flex-row items-center justify-between">
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
                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={handleBack} disabled={loading}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Next: Sources
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Data Sources */}
      {currentStep === 6 && (
        <Card>
          <CardHeader>
            <CardTitle>Data Sources</CardTitle>
            <CardDescription>
              References and documentation for this tokenomics data
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                                    <PopoverContent className="w-auto p-0" align="start">
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

                {/* Actions */}
                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={handleBack} disabled={loading}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Complete & Review
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Step 7: Completion Page */}
      {currentStep === 7 && (
        <Card className="border-primary/20">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Token Created Successfully!</CardTitle>
            <CardDescription>
              Your tokenomics data has been saved and is ready for review
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Completion Summary */}
            <div className="grid gap-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">Token Name</span>
                <span className="font-semibold">{step1Form.watch('name')}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">Ticker</span>
                <span className="font-mono font-bold text-primary">{step1Form.watch('ticker')}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <span className="text-sm font-medium">Completeness Score</span>
                <Badge className="text-lg px-3 py-1 bg-primary">
                  {finalScore !== null ? `${finalScore}%` : 'Calculating...'}
                </Badge>
              </div>
            </div>

            {/* Info Message */}
            <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">What's next?</p>
                <p className="text-muted-foreground mt-1">
                  You can view the detailed token page, add more tokens, or return to the dashboard to manage your data.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              {tokenId && (
                <Button
                  className="flex-1"
                  size="lg"
                  onClick={() => router.push(`/tokens/${tokenId}`)}
                >
                  View Token Details
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              )}
              <Button
                variant="outline"
                className="flex-1"
                size="lg"
                onClick={() => router.push(`/dashboard`)}
              >
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Go to Dashboard
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                size="lg"
                onClick={() => router.push('/tokens/new')}
              >
                <Plus className="mr-2 h-5 w-5" />
                Add Another Token
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
