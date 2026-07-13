'use client'

import { useEffect, useRef } from 'react'
import { computeScores } from '@/lib/utils/completeness'
import { toDateOnly } from '@/lib/utils/date'
import { humanizeWriteError } from '@/lib/utils/supabase-error'
import { type StudioSectionKey } from '@/features/studio/studio-spine'
import type { CoinGeckoProfile } from '@/types/coingecko'
import {
  toSupportedCategory,
  toSupportedSector,
  isSectorCompatibleWithCategory,
  toSupportedSegmentType,
  normalizeVestingFrequency,
  normalizeRiskSeverity,
  getSectorOption,
  type ClaimType,
  type TokenIdentityFormData,
  type SupplyMetricsFormData,
  type AllocationsFormData,
  type VestingSchedulesFormData,
  type EmissionModelFormData,
  type DataSourcesFormData,
  type RiskFlagsFormData,
} from '@/types/form'
import type { ChallengeType } from '@/types/challenges'
import { getFieldDef } from '@/lib/claims/field-registry'
import { decodeFieldValue } from '@/features/claims/challenge-value'
import { toast } from 'sonner'
import {
  type SaveOpts,
  SECTION_ORDER,
  CHAIN_PLATFORM,
  formatNumber,
  calculateTokenAmount,
  parseDecimal,
} from './form-helpers'
import { calculateCompleteness, buildStep4Schedules } from './completeness'
import { COMPLETION_STEP, type TokenFormState } from './use-token-form-state'

/**
 * Every save/submit handler plus the studio's autosave, navigation and
 * autofill orchestration. Takes the state bag from useTokenFormState() so the
 * two hooks share a single source of truth for forms, refs and optimistic-lock
 * state. See docs/refactor-plan-token-routes-20260620.md — highest-risk parts
 * 2, 3 and 4 (destructive delete→insert reseeding, the step-transition
 * coupling into the completion screen, and the shared handleRpcError) all live
 * here.
 */
export function useTokenSaveHandlers(state: TokenFormState) {
  const {
    router,
    searchParams,
    isEditMode,
    supabase,
    tokenId,
    setTokenId,
    maxSupply,
    setMaxSupply,
    setTgeDate,
    allocations,
    setAllocations,
    setLoading,
    finalScore,
    setFinalScore,
    initialUpdatedAt,
    setInitialUpdatedAt,
    setCurrentStep,
    setIdentityGuideTarget,
    segmentGuideRowIndex,
    setSegmentGuideRowIndex,
    calculateCompletedSteps,
    step1Form,
    step2Form,
    step3Form,
    step4Form,
    step5Form,
    step6Form,
    step7Form,
    append,
    appendSource,
    appendRisk,
    activeSection,
    setActiveSection,
    setAutosave,
    activeSectionRef,
    tokenIdRef,
    autosaveTimerRef,
    autoDraftBusyRef,
    enqueueSave,
    sectionFormsRef,
    saveSectionRef,
    allocationsRef,
    autosaveActiveRef,
    prefillFromChallengeRef,
  } = state

  const handleRpcError = (error: {
    code?: string
    message?: string
  }): boolean => {
    if (error.message?.includes('FORBIDDEN') || error.code === '42501') {
      toast.error('You do not have permission to modify this token.')
      return true
    }
    if (error.message?.includes('CONFLICT') || error.code === '40001') {
      toast.error(
        'This token was modified by someone else. Please refresh and try again.',
      )
      return true
    }
    // Unique violation on coingecko_id or (chain, contract_address). Reuses the
    // shared copy so the create and edit paths word it identically.
    if (
      error.code === '23505' ||
      error.message?.includes('duplicate key value')
    ) {
      toast.error(humanizeWriteError(error))
      return true
    }
    return false
  }

  // Save Step 1 and create/update token
  const onSubmitStep1 = async (
    data: TokenIdentityFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    try {
      setLoading(true)

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const normalizedCategory = toSupportedCategory(data.category)
      const normalizedSector = toSupportedSector(data.sector)
      const safeSector =
        normalizedCategory &&
        normalizedSector &&
        isSectorCompatibleWithCategory(normalizedCategory, normalizedSector)
          ? normalizedSector
          : null

      // Once a token row exists (edit mode OR the auto-draft insert), every
      // identity save must go through the update RPC. Branching on isEditMode
      // here would re-run the INSERT on each post-draft autosave and mint a
      // duplicate token per keystroke burst.
      if (tokenId) {
        // Update existing token via the RPC: it does the ownership (owner OR
        // moderator) and optimistic-lock checks server-side, atomically, and
        // returns the new updated_at (mirrors the other save_*_tx handlers).
        const { data: newUpdatedAt, error } = await supabase.rpc(
          'save_identity_tx',
          {
            p_token_id: tokenId,
            p_identity: {
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
            },
            p_expected_updated_at: initialUpdatedAt,
          },
        )

        if (error) {
          if (handleRpcError(error)) return false
          throw error
        }

        setInitialUpdatedAt(newUpdatedAt)
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

        // Goes through handleRpcError like every other write: a duplicate token
        // must read as "already in the registry", not as a raw Postgres
        // constraint message.
        if (error) {
          if (handleRpcError(error)) return false
          throw error
        }

        setTokenId(tokenData.id)
        setInitialUpdatedAt(tokenData.updated_at)
      }

      setTgeDate(data.tge_date)
      calculateCompletedSteps()
      if (!opts.silent) {
        toast.success(
          isEditMode
            ? 'Identity updated'
            : 'Token created. All sections are open.',
        )
      }
      return true
    } catch (error: unknown) {
      console.error('Error saving token:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to save token',
      )
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 2 - Supply Metrics
  const onSubmitStep2 = async (
    data: SupplyMetricsFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    try {
      setLoading(true)

      // Store max supply for step 3 calculations
      setMaxSupply(data.max_supply || '')

      // Convert string numbers to bigint strings
      const maxSupplyNum = data.max_supply
        ? BigInt(data.max_supply.replace(/,/g, ''))
        : null
      const initialSupply = data.initial_supply
        ? BigInt(data.initial_supply.replace(/,/g, ''))
        : null
      const tgeSupply = data.tge_supply
        ? BigInt(data.tge_supply.replace(/,/g, ''))
        : null
      const circulatingSupply = data.circulating_supply
        ? BigInt(data.circulating_supply.replace(/,/g, ''))
        : null

      const { data: newUpdatedAt, error } = await supabase.rpc(
        'save_supply_metrics_tx',
        {
          p_token_id: tokenId,
          p_metrics: {
            max_supply: maxSupplyNum ? maxSupplyNum.toString() : null,
            initial_supply: initialSupply ? initialSupply.toString() : null,
            tge_supply: tgeSupply ? tgeSupply.toString() : null,
            circulating_supply: circulatingSupply
              ? circulatingSupply.toString()
              : null,
            circulating_date: data.circulating_date || null,
            source_url: data.source_url || null,
            notes: data.notes || null,
          },
          p_expected_updated_at: initialUpdatedAt,
        },
      )

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(newUpdatedAt)

      calculateCompletedSteps()
      if (!opts.silent) toast.success('Supply metrics saved')
      return true
    } catch (error: unknown) {
      const pgError = error as {
        message?: string
        code?: string
        details?: string
        hint?: string
      } | null
      console.error('Error saving supply metrics:', {
        message: pgError?.message,
        code: pgError?.code,
        details: pgError?.details,
        hint: pgError?.hint,
      })
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save supply metrics',
      )
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 3 - Allocations
  const onSubmitStep3 = async (
    data: AllocationsFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    try {
      setLoading(true)

      const segmentsPayload = data.segments.map((segment) => ({
        id: segment.id || null,
        segment_type: toSupportedSegmentType(segment.segment_type),
        label: segment.label,
        percentage: parseDecimal(segment.percentage),
        token_amount: segment.token_amount
          ? BigInt(String(segment.token_amount).replace(/,/g, '')).toString()
          : null,
        wallet_address: segment.wallet_address || null,
      }))

      // Pre-compute completeness for atomic save
      const s1 = step1Form.getValues()
      const s2 = step2Form.getValues()
      const s3Total = data.segments.reduce(
        (t, s) => t + (parseDecimal(s.percentage) || 0),
        0,
      )
      const clusterScoresStep3 = {
        identity: 10 + (s1.contract_address ? 5 : 0) + (s1.tge_date ? 5 : 0),
        supply: s2.max_supply
          ? 10 + (s2.initial_supply || s2.tge_supply ? 5 : 0)
          : 0,
        allocation:
          (data.segments.length >= 3 ? 10 : 0) +
          (Math.abs(s3Total - 100) < 0.01 ? 10 : 0),
        vesting: 0,
      }
      const completeness = Math.min(
        clusterScoresStep3.identity +
          clusterScoresStep3.supply +
          clusterScoresStep3.allocation +
          clusterScoresStep3.vesting,
        100,
      )

      const { data: rpcResult, error } = await supabase.rpc(
        'save_allocations_tx',
        {
          p_token_id: tokenId,
          p_segments: segmentsPayload,
          p_expected_updated_at: initialUpdatedAt,
          p_completeness: completeness,
          p_cluster_scores: clusterScoresStep3,
        },
      )

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(rpcResult.updated_at)

      // Refresh allocations state from RPC result
      const allocationsWithIds = (rpcResult.segments || []).map(
        (alloc: {
          id: string
          segment_type: string
          label: string
          percentage: number
          token_amount: string | null
          wallet_address: string | null
        }) => ({
          id: alloc.id,
          segment_type: toSupportedSegmentType(alloc.segment_type),
          label: alloc.label,
          percentage: alloc.percentage.toString(),
          token_amount: alloc.token_amount ? String(alloc.token_amount) : '',
          wallet_address: alloc.wallet_address || '',
        }),
      )
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
      const allocationIds = (rpcResult.segments || []).map(
        (s: { id: string }) => s.id,
      )
      const { data: vestingData } = await supabase
        .from('vesting_schedules')
        .select('*')
        .in('allocation_id', allocationIds.length > 0 ? allocationIds : [''])

      step4Form.reset({
        schedules: buildStep4Schedules(
          (rpcResult.segments || []).map(
            (alloc: { id: string; segment_type: string }) => ({
              id: alloc.id,
              segment_type: alloc.segment_type,
            }),
          ),
          vestingData || [],
        ),
      })

      calculateCompletedSteps()
      if (!opts.silent)
        toast.success('Allocations saved. Vesting builds on these segments.')
      return true
    } catch (error: unknown) {
      console.error('Error saving allocations:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to save allocations',
      )
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 4 - Vesting Schedules
  const onSubmitStep4 = async (
    data: VestingSchedulesFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    try {
      setLoading(true)

      const allocationIds = allocations.map((a) => a.id)

      const schedulesToSave = Object.entries(data.schedules).map(
        ([allocationId, schedule]) => ({
          allocation_id: allocationId,
          cliff_months: schedule.cliff_months
            ? parseInt(schedule.cliff_months)
            : 0,
          duration_months: schedule.duration_months
            ? parseInt(schedule.duration_months)
            : 0,
          frequency: normalizeVestingFrequency(schedule.frequency),
          tge_percentage: schedule.tge_percentage
            ? parseDecimal(schedule.tge_percentage)
            : 0,
          cliff_unlock_percentage: schedule.cliff_unlock_percentage
            ? parseDecimal(schedule.cliff_unlock_percentage)
            : 0,
          notes: schedule.notes || null,
        }),
      )

      // Pre-compute completeness for atomic save
      const s1v = step1Form.getValues()
      const s2v = step2Form.getValues()
      const s3v = step3Form.getValues()
      const s3TotalV = s3v.segments.reduce(
        (t, s) => t + (parseDecimal(s.percentage) || 0),
        0,
      )
      const clusterScoresStep4 = {
        identity: 10 + (s1v.contract_address ? 5 : 0) + (s1v.tge_date ? 5 : 0),
        supply: s2v.max_supply
          ? 10 + (s2v.initial_supply || s2v.tge_supply ? 5 : 0)
          : 0,
        allocation:
          (s3v.segments.length >= 3 ? 10 : 0) +
          (Math.abs(s3TotalV - 100) < 0.01 ? 10 : 0),
        vesting: 20,
      }
      const completeness = calculateCompleteness(s1v, s2v, s3v) + 20

      const { data: newUpdatedAt, error } = await supabase.rpc(
        'save_vesting_schedules_tx',
        {
          p_token_id: tokenId,
          p_allocation_ids: allocationIds,
          p_schedules: schedulesToSave,
          p_expected_updated_at: initialUpdatedAt,
          p_completeness: Math.min(completeness, 100),
          p_cluster_scores: clusterScoresStep4,
        },
      )

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
        String(pgError?.message || '').includes(
          'vesting_schedules_frequency_check',
        )
      ) {
        toast.error(
          'Database schema is outdated: apply the vesting frequency migration (yearly).',
        )
      } else if (pgError?.message?.includes('CONFLICT')) {
        toast.error(
          'This token was modified by someone else. Please refresh and try again.',
        )
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to save vesting schedules',
        )
      }
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Step 5 - Emission Model
  const onSubmitStep5 = async (
    data: EmissionModelFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    if (!tokenId) {
      toast.error('Save the token identity first.')
      return false
    }

    try {
      setLoading(true)

      // Prepare inflation schedule as JSONB
      const inflationSchedule =
        data.inflation_schedule && data.inflation_schedule.length > 0
          ? data.inflation_schedule.map((item) => ({
              year: parseInt(item.year),
              rate: parseDecimal(item.rate),
            }))
          : null

      const { data: newUpdatedAt, error } = await supabase.rpc(
        'save_emission_model_tx',
        {
          p_token_id: tokenId,
          p_model: {
            type: data.type,
            annual_inflation_rate: data.annual_inflation_rate
              ? parseDecimal(data.annual_inflation_rate)
              : null,
            inflation_schedule: inflationSchedule,
            has_burn: data.has_burn || false,
            burn_details: data.burn_details || null,
            has_buyback: data.has_buyback || false,
            buyback_details: data.buyback_details || null,
            notes: data.notes || null,
          },
          p_expected_updated_at: initialUpdatedAt,
        },
      )

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
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save emission model',
      )
      return false
    } finally {
      setLoading(false)
    }
  }

  // Calculate final completeness score with an explicit source count
  // Used by Step 6 to compute scores BEFORE the RPC saves the new sources
  const calculateFinalCompletenessWithSourceCount = async (
    sourcesCount: number,
  ): Promise<{
    totalScore: number
    clusterScores: {
      identity: number
      supply: number
      allocation: number
      vesting: number
    }
  }> => {
    try {
      const { data: tokenData } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', tokenId)
        .single()

      if (!tokenData)
        return {
          totalScore: 0,
          clusterScores: { identity: 0, supply: 0, allocation: 0, vesting: 0 },
        }

      const { data: supplyData } = await supabase
        .from('supply_metrics')
        .select('*')
        .eq('token_id', tokenId)
        .maybeSingle()

      const { data: allocData } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', tokenId)

      const { data: vestingData } = await supabase
        .from('vesting_schedules')
        .select('*')
        .in('allocation_id', allocData?.map((a) => a.id) || [])

      const { data: emissionData } = await supabase
        .from('emission_models')
        .select('*')
        .eq('token_id', tokenId)
        .maybeSingle()

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
      return {
        totalScore: 0,
        clusterScores: { identity: 0, supply: 0, allocation: 0, vesting: 0 },
      }
    }
  }

  // Save Step 6 - Data Sources
  const onSubmitStep6 = async (
    data: DataSourcesFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
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
        // DATE column: normalise to a local calendar day so an ISO instant
        // cannot land on the previous day once Postgres truncates it.
        verified_at: toDateOnly(source.verified_at),
      }))

      // Flatten attributions to individual claim_source rows with source index
      const attributionsToSave = (data.attributions || []).flatMap((attr) =>
        attr.data_source_ids.map((idx) => ({
          source_index: parseInt(idx),
          claim_type: attr.claim_type,
          claim_id: attr.claim_id || null,
        })),
      )

      // Pre-compute final completeness BEFORE the RPC
      // Use calculateFinalCompleteness but override sourcesCount with form data
      const { totalScore: finalCompleteness, clusterScores } =
        await calculateFinalCompletenessWithSourceCount(data.sources.length)

      const { data: rpcResult, error } = await supabase.rpc(
        'save_data_sources_tx',
        {
          p_token_id: tokenId,
          p_sources: sourcesToSave,
          p_attributions: attributionsToSave,
          p_expected_updated_at: initialUpdatedAt,
          p_completeness: Math.round(finalCompleteness),
          p_cluster_scores: clusterScores,
        },
      )

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
      const msg =
        error && typeof error === 'object' && 'message' in error
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
  const onSubmitStep7 = async (
    data: RiskFlagsFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
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

      const { data: rpcResult, error } = await supabase.rpc(
        'save_risk_flags_tx',
        {
          p_token_id: tokenId,
          p_flags: flagsToSave,
          p_expected_updated_at: initialUpdatedAt,
        },
      )

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
          const { totalScore } =
            await calculateFinalCompletenessWithSourceCount(
              step6Form.getValues('sources')?.length ?? 0,
            )
          setFinalScore(totalScore)
          setCurrentStep(COMPLETION_STEP)
        }
      }
      return true
    } catch (error: unknown) {
      console.error('Error saving risk flags:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to save risk flags',
      )
      return false
    } finally {
      setLoading(false)
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
    if (
      currentSector &&
      !isSectorCompatibleWithCategory(category, currentSector)
    ) {
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

    step3Form.setValue(
      `segments.${segmentGuideRowIndex}.segment_type`,
      segmentType,
      {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true,
      },
    )
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
      step4Form.setValue(
        `schedules.${allocationId}.cliff_unlock_percentage`,
        '',
      )
    } else if (
      step4Form.getValues(`schedules.${allocationId}.tge_percentage`) === '100'
    ) {
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

  // Latest-ref pattern: the watch subscription mounts once, but each save
  // closes over fresh state (initialUpdatedAt for the optimistic lock).
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

  /** Persist the active section if it is dirty and valid. Powers autosave. */
  autosaveActiveRef.current = async () => {
    const key = activeSectionRef.current
    if (!tokenIdRef.current) return
    const form = sectionFormsRef.current[key]
    if (!form.formState.isDirty) {
      // A queued autosave can outlive its edits (a save that resets its own
      // form to server truth leaves nothing unsaved): do not strand the chip
      // on "Unsaved changes" when the form is pristine.
      setAutosave((a) =>
        a.status === 'pending' ? { status: 'idle', at: a.at } : a,
      )
      return
    }
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
    setAutosave(
      ok ? { status: 'saved', at: Date.now() } : { status: 'error', at: null },
    )
  }

  // One debounced autosave pipeline across all section forms. Only real user
  // edits (type === 'change') schedule a save; programmatic reset/setValue
  // (e.g. rebuilding vesting rows after an allocation save) do not.
  // Arm (or re-arm) the debounced autosave of the active section. Keystroke
  // subscriptions call this, and so do UI controls whose edits go through a
  // programmatic setValue (e.g. the attribution pills), which react-hook-form
  // never reports as type 'change'. Only closes over stable refs/setters, so
  // the mount-time subscription closure below stays correct.
  const queueAutosave = () => {
    if (!tokenIdRef.current) return
    setAutosave((a) =>
      a.status === 'saving' ? a : { status: 'pending', at: a.at },
    )
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(() => {
      void autosaveActiveRef.current()
    }, 1800)
  }

  useEffect(() => {
    const forms = Object.values(sectionFormsRef.current)
    const subs = forms.map((form) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- union of 7 form value shapes
      (form as any).watch((_values: unknown, info: { type?: string }) => {
        if (info?.type !== 'change') return
        queueAutosave()
      }),
    )
    return () => {
      subs.forEach((s: { unsubscribe: () => void }) => s.unsubscribe())
      if (autosaveTimerRef.current)
        window.clearTimeout(autosaveTimerRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Guards prefillFromChallenge against firing twice for the same
  // challengeId (e.g. React StrictMode's double-invoked mount effect).
  const prefilledChallengeIdRef = useRef<string | null>(null)

  // A form's setValue path type is a compile-time union derived from that
  // form's own schema; a challenge's field_key is a runtime string
  // (validated against field-registry.ts, not statically knowable per
  // form), so it can't be expressed as that union. Same escape hatch as the
  // union-typed watch loop above.
  const setChallengedValue = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
    form: any,
    path: string,
    value: string | boolean,
  ) => {
    form.setValue(path, value, { shouldDirty: true })
  }

  /**
   * "Correct in studio" pre-fill (plan §9.2.5): resolve-box-provenance.tsx's
   * CTA appends `?challengeId=` for the just-accepted challenge. Read it
   * here, fetch the challenge, and seed the challenged field with its
   * proposed_value so the owner/moderator reviews + saves instead of
   * re-typing it. Only 'update' challenges carry a proposed_value -- a
   * dispute has none, so there is nothing to pre-fill.
   *
   * Must run AFTER loadTokenData's reset() calls (use-token-form-state.ts's
   * mount effect awaits loadTokenData(editTokenId) before calling this via
   * prefillFromChallengeRef), since reset() replaces the whole form value
   * object and would silently clobber a setValue that ran first.
   */
  const prefillFromChallenge = async () => {
    const challengeId = searchParams.get('challengeId')
    if (!challengeId) return
    if (prefilledChallengeIdRef.current === challengeId) return
    prefilledChallengeIdRef.current = challengeId

    const { data, error } = await supabase
      .from('challenges')
      .select('claim_type, claim_id, field_key, proposed_value, challenge_type')
      .eq('id', challengeId)
      .maybeSingle()

    if (error || !data) {
      console.debug('Studio pre-fill: challenge not found', challengeId, error)
      return
    }
    const challenge = data as {
      claim_type: ClaimType
      claim_id: string | null
      field_key: string
      proposed_value: unknown
      challenge_type: ChallengeType
    }

    // A dispute has no proposed_value -- nothing to pre-fill.
    if (
      challenge.challenge_type !== 'update' ||
      challenge.proposed_value === null
    ) {
      return
    }

    const fieldDef = getFieldDef(challenge.claim_type, challenge.field_key)
    if (!fieldDef) {
      console.debug(
        'Studio pre-fill: field not in registry',
        challenge.claim_type,
        challenge.field_key,
      )
      return
    }
    const decoded = decodeFieldValue(fieldDef.kind, challenge.proposed_value)

    switch (challenge.claim_type) {
      case 'token_identity':
        setChallengedValue(step1Form, challenge.field_key, decoded)
        break
      case 'supply_metrics':
        setChallengedValue(step2Form, challenge.field_key, decoded)
        break
      case 'emission_model':
        setChallengedValue(step5Form, challenge.field_key, decoded)
        break
      case 'allocation_segment': {
        // A positional array -- find the row by id (not index: save can
        // reorder/insert rows), then target that index's field.
        const segments = step3Form.getValues('segments')
        const index = segments.findIndex((s) => s.id === challenge.claim_id)
        if (index < 0) {
          console.debug(
            'Studio pre-fill: allocation row not found',
            challenge.claim_id,
          )
          return
        }
        // segment_type is an enum: a challenge accepted before a legacy
        // value was migrated away could still carry it. Run it through the
        // same normalizer onSubmitStep3 uses before persisting, so an
        // unsupported value falls back to a valid default instead of
        // reaching the form (and later the Zod schema/save) unvalidated.
        const segmentValue =
          challenge.field_key === 'segment_type'
            ? toSupportedSegmentType(
                typeof decoded === 'string' ? decoded : undefined,
              )
            : decoded
        setChallengedValue(
          step3Form,
          `segments.${index}.${challenge.field_key}`,
          segmentValue,
        )
        break
      }
      case 'vesting_schedule': {
        // Unlike segments, step4Form's `schedules` is a
        // Record<allocationId, VestingSchedule> (see vestingSchedulesSchema
        // in @/types/form) -- claim_id (the allocation's id, per
        // completeness.ts) IS the key, so no positional search is needed.
        const schedules = step4Form.getValues('schedules')
        if (!challenge.claim_id || !(challenge.claim_id in schedules)) {
          console.debug(
            'Studio pre-fill: vesting row not found',
            challenge.claim_id,
          )
          return
        }
        // frequency is an enum: a challenge could carry a retired value
        // (e.g. 'quarterly'). Normalize it the same way onSubmitStep4 and
        // handleFrequencyChange do, so a legacy/unsupported value maps to
        // its supported equivalent instead of landing in the form as-is.
        const frequencyValue =
          challenge.field_key === 'frequency'
            ? normalizeVestingFrequency(
                typeof decoded === 'string' ? decoded : undefined,
              )
            : decoded
        setChallengedValue(
          step4Form,
          `schedules.${challenge.claim_id}.${challenge.field_key}`,
          frequencyValue,
        )
        break
      }
      default:
        return
    }

    queueAutosave()
  }

  prefillFromChallengeRef.current = prefillFromChallenge

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
        onSubmitStep1(step1Form.getValues(), { silent: true }),
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
  const goSection = (
    key: StudioSectionKey,
    opts: { skipSave?: boolean } = {},
  ) => {
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
    activeIndex < SECTION_ORDER.length - 1
      ? SECTION_ORDER[activeIndex + 1]
      : null

  /** Footer "Continue": persist the current section (surfacing errors), then advance. */
  const handleContinue = async () => {
    const form = sectionFormsRef.current[activeSection]
    if (activeSection === 'identity' && !tokenId) {
      const valid = await form.trigger()
      if (!valid) return
      const ok = await enqueueSave(() =>
        onSubmitStep1(step1Form.getValues(), { silent: true }),
      )
      if (!ok) return
      setAutosave({ status: 'saved', at: Date.now() })
    } else if (tokenId && form.formState.isDirty) {
      if (activeSection === 'vesting' && allocationsRef.current.length === 0) {
        // nothing to persist yet
      } else {
        const valid = await form.trigger()
        if (!valid) return
        setAutosave((a) => ({ status: 'saving', at: a.at }))
        const ok = await enqueueSave(() =>
          saveSectionRef.current(activeSection),
        )
        setAutosave(
          ok
            ? { status: 'saved', at: Date.now() }
            : { status: 'error', at: null },
        )
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
      const res = await fetch(
        `/api/coingecko/profile?id=${encodeURIComponent(coinId)}`,
      )
      if (!res.ok) return
      const profile: CoinGeckoProfile = await res.json()
      let filled = 0

      if (!step1Form.getValues('name') && profile.name) {
        step1Form.setValue('name', profile.name, {
          shouldDirty: true,
          shouldValidate: true,
        })
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
          ([, platform]) => profile.platforms[platform],
        )
        if (knownPlatforms.length === 1) {
          chain = knownPlatforms[0][0]
          step1Form.setValue('chain', chain, {
            shouldDirty: true,
            shouldValidate: true,
          })
          filled++
        }
      }
      if (
        !step1Form.getValues('contract_address') &&
        chain &&
        CHAIN_PLATFORM[chain]
      ) {
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
        value: number | null,
      ) => {
        if (value == null || value <= 0) return
        if (step2Form.getValues(field)) return
        const formatted = formatNumber(Math.round(value).toString())
        step2Form.setValue(field, formatted, {
          shouldDirty: true,
          shouldValidate: true,
        })
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
          // Left unset on purpose: verified_at means a human checked this
          // source, not that a bot fetched it. Stamping it here would let an
          // autofill vouch for itself, and it gets minted on-chain as such.
          verified_at: undefined,
        })
        filled++
      }

      if (filled > 0) {
        toast.success(
          `Prefilled ${filled} field${filled === 1 ? '' : 's'} from CoinGecko`,
        )
      }
    } catch (error) {
      console.error('CoinGecko autofill failed:', error)
    }
  }

  /** Scale every segment proportionally so the sum lands exactly on 100. */
  const normalizeAllocations = () => {
    const segments = step3Form.getValues('segments')
    const total = segments.reduce(
      (t, s) => t + (parseDecimal(s.percentage) || 0),
      0,
    )
    if (total <= 0) return
    let allocatedSoFar = 0
    segments.forEach((segment, index) => {
      const pct = parseDecimal(segment.percentage) || 0
      const next =
        index === segments.length - 1
          ? Math.max(0, +(100 - allocatedSoFar).toFixed(2))
          : +((pct / total) * 100).toFixed(2)
      allocatedSoFar += next
      step3Form.setValue(`segments.${index}.percentage`, String(next), {
        shouldDirty: true,
        shouldValidate: false,
      })
      step3Form.setValue(
        `segments.${index}.token_amount`,
        calculateTokenAmount(String(next), maxSupply),
        {
          shouldValidate: false,
        },
      )
    })
    setAutosave((a) =>
      a.status === 'saving' ? a : { status: 'pending', at: a.at },
    )
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(() => {
      void autosaveActiveRef.current()
    }, 1200)
  }

  return {
    handleRpcError,
    onSubmitStep1,
    onSubmitStep2,
    onSubmitStep3,
    onSubmitStep4,
    onSubmitStep5,
    onSubmitStep6,
    onSubmitStep7,
    calculateFinalCompletenessWithSourceCount,

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
    queueAutosave,
    autofillFromCoinGecko,
    normalizeAllocations,
  }
}
