'use client'

import { useEffect } from 'react'
import { buildPromotedTokenScore } from '@/lib/tokenomics/promote'
import {
  computeFactoryScore,
  toSupportedCategory,
  toSupportedSector,
  isSectorCompatibleWithCategory,
  toSupportedSegmentType,
  normalizeVestingFrequency,
  getSectorOption,
  buildStep4Schedules,
  calculateTokenAmount,
  parseDecimal,
  type SaveOpts,
  type TokenIdentityFormData,
  type SupplyMetricsFormData,
  type AllocationsFormData,
  type VestingSchedulesFormData,
  type EmissionModelFormData,
  type FundingRoundsFormData,
  deriveTgeUnlock,
  formatNumber,
} from '@/lib/tokenomics'
import { toast } from 'sonner'
import {
  FACTORY_SECTION_ORDER,
  type FactoryFormSectionKey,
  type FactorySectionKey,
} from './sections'
import {
  COMPLETION_STEP,
  type FactoryFormState,
} from './use-factory-form-state'

/**
 * Every save/submit handler plus the builder's autosave, navigation and
 * auto-draft orchestration. Takes the state bag from useFactoryFormState() so
 * the two hooks share a single source of truth for forms, refs and
 * optimistic-lock state. Twin of useTokenSaveHandlers — see the DRIFT LEDGER
 * in use-factory-form-state.ts. Stripped relative to the screener (do NOT
 * re-add): sources/risk handlers, challenge pre-fill, CoinGecko autofill.
 *
 * Every persisted completeness/cluster_scores value goes through
 * computeFactoryScore (the FACTORY_RESCALE contract) — never a hand-rolled
 * sum. That covers the creation insert, the allocation and vesting interim
 * saves, the emission save and the finish moment.
 */
export function useFactorySaveHandlers(state: FactoryFormState) {
  const {
    router,
    isEditMode,
    supabase,
    projectId,
    setProjectId,
    maxSupply,
    setMaxSupply,
    allocations,
    setAllocations,
    setLoading,
    setFinalScore,
    initialUpdatedAt,
    setInitialUpdatedAt,
    setProjectStatus,
    setPromotedTokenId,
    setCurrentStep,
    setIdentityGuideTarget,
    segmentGuideRowIndex,
    setSegmentGuideRowIndex,
    completedSteps,
    calculateCompletedSteps,
    step1Form,
    step2Form,
    step3Form,
    step4Form,
    step5Form,
    step6Form,
    append,
    appendRound,
    activeSection,
    setActiveSection,
    setAutosave,
    activeSectionRef,
    projectIdRef,
    autosaveTimerRef,
    autoDraftBusyRef,
    enqueueSave,
    sectionFormsRef,
    saveSectionRef,
    allocationsRef,
    autosaveActiveRef,
    pendingVestingSeedsRef,
  } = state

  const handleRpcError = (error: {
    code?: string
    message?: string
  }): boolean => {
    if (error.message?.includes('FORBIDDEN') || error.code === '42501') {
      toast.error('You do not have permission to modify this design.')
      return true
    }
    if (error.message?.includes('CONFLICT') || error.code === '40001') {
      toast.error(
        'This design was modified in another session. Please refresh and try again.',
      )
      return true
    }
    if (error.message?.includes('READONLY') || error.code === '55000') {
      toast.error('This design has been promoted and is read-only.')
      return true
    }
    if (error.message?.includes('INCOMPLETE')) {
      toast.error(
        'The design must be fully complete (100/100) before promotion.',
      )
      return true
    }
    return false
  }

  /**
   * THE scoring call every persisted completeness goes through.
   * computeFactoryScore only reads truthiness off supply/emission numerics,
   * so formatted form strings map to 1/null sentinels; allocation percentages
   * feed real math (the 100% seal). `vestingSaved` is explicit because during
   * the vesting save itself completedSteps has not been recalculated yet.
   */
  const scoreFromForms = (opts: { vestingSaved: boolean }) => {
    const s1 = step1Form.getValues()
    const s2 = step2Form.getValues()
    const s3 = step3Form.getValues()
    const s5 = step5Form.getValues()
    return computeFactoryScore({
      project: {
        name: s1.name || null,
        ticker: s1.ticker || null,
        category: s1.category || null,
        sector: s1.sector || null,
      },
      supply: s2.max_supply ? { max_supply: 1 } : null,
      allocations: s3.segments.map((s) => ({
        id: s.id ?? '',
        percentage: parseDecimal(s.percentage) || 0,
      })),
      vestingCount: opts.vestingSaved ? 1 : 0,
      emission: s5.type
        ? {
            type: s5.type,
            annual_inflation_rate: s5.annual_inflation_rate ? 1 : null,
            has_burn: s5.has_burn,
            has_buyback: s5.has_buyback,
          }
        : null,
    })
  }

  // Save Section 1 and create/update the design
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

      // Once a design row exists (edit mode OR the auto-draft insert), every
      // identity save must go through the update RPC. Branching on isEditMode
      // here would re-run the INSERT on each post-draft autosave and mint a
      // duplicate design per keystroke burst.
      if (projectId) {
        // Update the existing design via the RPC: it does the ownership and
        // optimistic-lock checks server-side, atomically, and returns the new
        // updated_at (mirrors the other save_factory_*_tx handlers).
        const { data: newUpdatedAt, error } = await supabase.rpc(
          'save_factory_identity_tx',
          {
            p_project_id: projectId,
            p_identity: {
              name: data.name,
              ticker: data.ticker.toUpperCase(),
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
        // Create the design: the ONE sanctioned direct client insert (the
        // contributor-gated owner INSERT policy enforces created_by and the
        // role server-side; children only ever go through the RPCs).
        const { totalScore, clusterScores } = scoreFromForms({
          vestingSaved: false,
        })
        const { data: projectData, error } = await supabase
          .from('factory_projects')
          .insert({
            name: data.name,
            ticker: data.ticker.toUpperCase(),
            category: normalizedCategory || null,
            sector: safeSector,
            notes: data.notes || null,
            status: 'draft',
            completeness: totalScore,
            cluster_scores: clusterScores,
            created_by: user.id,
          })
          .select()
          .single()

        if (error) throw error

        setProjectId(projectData.id)
        setInitialUpdatedAt(projectData.updated_at)
      }

      calculateCompletedSteps()
      if (!opts.silent) {
        toast.success(
          isEditMode
            ? 'Identity updated'
            : 'Design created. All sections are open.',
        )
      }
      return true
    } catch (error: unknown) {
      console.error('Error saving design:', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to save design',
      )
      return false
    } finally {
      setLoading(false)
    }
  }

  // Save Section 2 - Supply Metrics
  const onSubmitStep2 = async (
    data: SupplyMetricsFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    if (!projectId) {
      toast.error('Save the design identity first.')
      return false
    }

    try {
      setLoading(true)

      // Store max supply for allocation calculations
      setMaxSupply(data.max_supply || '')

      const maxSupplyNum = data.max_supply
        ? BigInt(data.max_supply.replace(/,/g, ''))
        : null

      // A design's launch figure is DERIVED from its vesting, never typed:
      // persist the current TGE unlock so the row reflects the design.
      const tgeUnlock = deriveTgeUnlock(
        step3Form.getValues('segments'),
        step4Form.getValues('schedules'),
        data.max_supply || '',
      )

      const { data: newUpdatedAt, error } = await supabase.rpc(
        'save_factory_supply_metrics_tx',
        {
          p_project_id: projectId,
          p_metrics: {
            max_supply: maxSupplyNum ? maxSupplyNum.toString() : null,
            initial_supply: null,
            tge_supply: tgeUnlock.tokens > 0 ? String(tgeUnlock.tokens) : null,
            circulating_supply: null,
            circulating_date: null,
            source_url: null,
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

  // Save Section 3 - Allocations
  const onSubmitStep3 = async (
    data: AllocationsFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    if (!projectId) {
      toast.error('Save the design identity first.')
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

      // Interim persisted completeness, through the contract (vesting counts
      // only if its section already completed — sections save in any order).
      const { totalScore, clusterScores } = scoreFromForms({
        vestingSaved: completedSteps.includes(4),
      })

      const { data: rpcResult, error } = await supabase.rpc(
        'save_factory_allocations_tx',
        {
          p_project_id: projectId,
          p_segments: segmentsPayload,
          p_expected_updated_at: initialUpdatedAt,
          p_completeness: totalScore,
          p_cluster_scores: clusterScores,
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
          (a: { label: string; segment_type: string }) =>
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

      // Read-only: fetch vesting data for the vesting form rebuild
      const allocationIds = (rpcResult.segments || []).map(
        (s: { id: string }) => s.id,
      )
      const { data: vestingData } = await supabase
        .from('factory_vesting_schedules')
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

      // Overlay any benchmark vesting seeds in the same tick as the reset
      // (see pendingVestingSeedsRef in use-factory-form-state.ts). setValue
      // with shouldDirty so the seeded schedule persists on the next vesting
      // save; reset() alone would leave the form pristine and skippable.
      // The ref is NOT consumed here: the allocation form stays dirty after a
      // save, so any later Continue re-runs this reset from DB rows (still
      // vesting-less) and would wipe a one-shot overlay. Seeds stay pending
      // and re-overlay on every rebuild until the vesting save lands them.
      const vestingSeeds = pendingVestingSeedsRef.current
      if (vestingSeeds) {
        for (const alloc of allocationsWithIds) {
          const seed = vestingSeeds[alloc.segment_type]
          if (!seed) continue
          for (const [field, value] of Object.entries(seed)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-hook-form FieldPath cannot resolve dynamic Record<string,...> keys
            step4Form.setValue(`schedules.${alloc.id}.${field}` as any, value, {
              shouldDirty: true,
            })
          }
        }
      }

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

  // Save Section 4 - Vesting Schedules
  const onSubmitStep4 = async (
    data: VestingSchedulesFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    if (!projectId) {
      toast.error('Save the design identity first.')
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

      // Interim persisted completeness, through the contract
      const { totalScore, clusterScores } = scoreFromForms({
        vestingSaved: true,
      })

      const { data: newUpdatedAt, error } = await supabase.rpc(
        'save_factory_vesting_schedules_tx',
        {
          p_project_id: projectId,
          p_allocation_ids: allocationIds,
          p_schedules: schedulesToSave,
          p_expected_updated_at: initialUpdatedAt,
          p_completeness: totalScore,
          p_cluster_scores: clusterScores,
        },
      )

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(newUpdatedAt)

      // The seeded schedules are now persisted rows: stop re-overlaying them.
      pendingVestingSeedsRef.current = null

      calculateCompletedSteps()
      if (!opts.silent) toast.success('Vesting schedules saved')
      return true
    } catch (error: unknown) {
      console.error('Error saving vesting schedules:', error)
      const pgError = error as { code?: string; message?: string } | null
      if (pgError?.message?.includes('CONFLICT')) {
        toast.error(
          'This design was modified in another session. Please refresh and try again.',
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

  // Save Section 5 - Emission Model
  const onSubmitStep5 = async (
    data: EmissionModelFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    if (!projectId) {
      toast.error('Save the design identity first.')
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

      // Emission is a scored Factory cluster, so its save persists the
      // contract score too (unlike the screener, where emission is an extra).
      const { totalScore, clusterScores } = scoreFromForms({
        vestingSaved: completedSteps.includes(4),
      })

      const { data: newUpdatedAt, error } = await supabase.rpc(
        'save_factory_emission_model_tx',
        {
          p_project_id: projectId,
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
          p_completeness: totalScore,
          p_cluster_scores: clusterScores,
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

  // Save Section 6 - Funding rounds (optional, unscored: no completeness params)
  const onSubmitStep6 = async (
    data: FundingRoundsFormData,
    opts: SaveOpts = {},
  ): Promise<boolean> => {
    if (!projectId) {
      toast.error('Save the design identity first.')
      return false
    }

    try {
      setLoading(true)

      const roundsPayload = data.rounds.map((round) => ({
        id: round.id || null,
        round_type: round.round_type,
        label: round.label || null,
        round_date: round.round_date || null,
        token_price_usd: round.token_price_usd
          ? String(parseDecimal(round.token_price_usd))
          : null,
        tokens_sold: round.tokens_sold
          ? BigInt(String(round.tokens_sold).replace(/,/g, '')).toString()
          : null,
        amount_usd: round.amount_usd
          ? String(parseDecimal(round.amount_usd))
          : null,
        notes: round.notes || null,
      }))

      const { data: rpcResult, error } = await supabase.rpc(
        'save_factory_funding_tx',
        {
          p_project_id: projectId,
          p_rounds: roundsPayload,
          p_expected_updated_at: initialUpdatedAt,
        },
      )

      if (error) {
        if (handleRpcError(error)) return false
        throw error
      }

      setInitialUpdatedAt(rpcResult.updated_at)

      // Funding rows have no dependents (unlike allocations and their vesting
      // schedules), so the simplest id-sync is a full reset from server truth.
      step6Form.reset({
        rounds: (rpcResult.rounds || []).map(
          (round: {
            id: string
            round_type: string
            label: string | null
            round_date: string | null
            token_price_usd: string | number | null
            tokens_sold: string | number | null
            amount_usd: string | number | null
            notes: string | null
          }) => ({
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
          }),
        ),
      })

      calculateCompletedSteps()
      if (!opts.silent) toast.success('Funding rounds saved')
      return true
    } catch (error: unknown) {
      console.error('Error saving funding rounds:', error)
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save funding rounds',
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

  // Add new funding round
  const addRound = () => {
    appendRound({
      id: crypto.randomUUID(),
      round_type: '',
      label: '',
      round_date: undefined,
      token_price_usd: '',
      tokens_sold: '',
      amount_usd: '',
      notes: '',
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

  // ── Studio orchestration: autosave, auto-draft, navigation ─────────────────

  // Latest-ref pattern: the watch subscription mounts once, but each save
  // closes over fresh state (initialUpdatedAt for the optimistic lock).
  saveSectionRef.current = async (key: FactoryFormSectionKey) => {
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
      case 'funding':
        return onSubmitStep6(step6Form.getValues(), { silent: true })
    }
  }

  /** Persist the active section if it is dirty and valid. Powers autosave. */
  autosaveActiveRef.current = async () => {
    const key = activeSectionRef.current
    if (!projectIdRef.current) return
    // Projections is a derived view: nothing to persist, nothing dirty.
    if (key === 'projections') return
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
  // Arm (or re-arm) the debounced autosave of the active section. Only closes
  // over stable refs/setters, so the mount-time subscription closure below
  // stays correct.
  const queueAutosave = () => {
    if (!projectIdRef.current) return
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- union of 6 form value shapes
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

  // Auto-draft: the padlock killer. As soon as a valid name + ticker exist,
  // the draft creates itself silently and every section opens.
  const draftNameW = step1Form.watch('name')
  const draftTickerW = step1Form.watch('ticker')
  useEffect(() => {
    if (projectId || isEditMode || autoDraftBusyRef.current) return
    if (!draftNameW?.trim() || !draftTickerW?.trim()) return
    const timer = window.setTimeout(async () => {
      if (autoDraftBusyRef.current || projectIdRef.current) return
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
  }, [draftNameW, draftTickerW, projectId, isEditMode])

  /** Switch sections; the one being left autosaves in the background. */
  const goSection = (
    key: FactorySectionKey,
    opts: { skipSave?: boolean } = {},
  ) => {
    if (key === activeSection) return
    if (!opts.skipSave) void autosaveActiveRef.current()
    setActiveSection(key)
    const params = new URLSearchParams(window.location.search)
    params.set('section', key)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const activeIndex = FACTORY_SECTION_ORDER.indexOf(activeSection)
  const prevSectionKey =
    activeIndex > 0 ? FACTORY_SECTION_ORDER[activeIndex - 1] : null
  const nextSectionKey =
    activeIndex < FACTORY_SECTION_ORDER.length - 1
      ? FACTORY_SECTION_ORDER[activeIndex + 1]
      : null

  /** Footer "Continue": persist the current section (surfacing errors), then advance. */
  const handleContinue = async () => {
    if (activeSection === 'projections') {
      // Derived view, nothing to persist (and, as the last section, the
      // footer shows Finish here anyway).
      if (nextSectionKey) goSection(nextSectionKey, { skipSave: true })
      return
    }
    const form = sectionFormsRef.current[activeSection]
    if (activeSection === 'identity' && !projectId) {
      const valid = await form.trigger()
      if (!valid) return
      const ok = await enqueueSave(() =>
        onSubmitStep1(step1Form.getValues(), { silent: true }),
      )
      if (!ok) return
      setAutosave({ status: 'saved', at: Date.now() })
    } else if (projectId && form.formState.isDirty) {
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

  /** Footer "Finish and review": final save + completion moment. Projections
   * (the last section) has nothing of its own to persist; every form section
   * was flushed by Continue and the leave-section autosave along the way.
   * Funding is still saved here when dirty, as the safety net for a direct
   * spine jump that outran its debounced autosave. */
  const handleFinish = async () => {
    if (!projectId) return
    if (step6Form.formState.isDirty) {
      const valid = await step6Form.trigger()
      if (!valid) return
      const ok = await enqueueSave(() =>
        onSubmitStep6(step6Form.getValues(), {}),
      )
      if (!ok) return
    }
    const { totalScore } = scoreFromForms({
      vestingSaved: completedSteps.includes(4),
    })
    setFinalScore(totalScore)
    setCurrentStep(COMPLETION_STEP)
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

  /**
   * Promote the finished design into a screener token. Irreversible: the RPC
   * re-verifies the 100/100 gate from data, mints the token + children
   * transactionally, and flips the design to read-only 'promoted'. The
   * screener-scale score for the minted token is built here through
   * buildPromotedTokenScore (the shared computeScores) and persisted by the
   * RPC. Returns the new token id, or null on failure.
   */
  const handlePromote = async (): Promise<string | null> => {
    if (!projectId) return null
    try {
      setLoading(true)

      const s1 = step1Form.getValues()
      const s3segments = step3Form.getValues('segments')
      const s5 = step5Form.getValues()
      const maxSupplyValue = step2Form.getValues('max_supply') || ''
      const tgeUnlock = deriveTgeUnlock(
        s3segments,
        step4Form.getValues('schedules'),
        maxSupplyValue,
      )
      const { clusterScores, totalScore } = buildPromotedTokenScore({
        name: s1.name || null,
        ticker: s1.ticker || null,
        hasMaxSupply: Boolean(maxSupplyValue),
        hasTgeSupply: tgeUnlock.tokens > 0,
        allocations: s3segments.map((s) => ({
          id: s.id ?? '',
          percentage: parseDecimal(s.percentage) || 0,
        })),
        vestingCount: completedSteps.includes(4) ? 1 : 0,
        emission: s5.type
          ? {
              type: s5.type,
              annual_inflation_rate: s5.annual_inflation_rate ? 1 : null,
              has_burn: s5.has_burn,
              has_buyback: s5.has_buyback,
            }
          : null,
      })

      const { data, error } = await supabase.rpc('promote_factory_project_tx', {
        p_project_id: projectId,
        p_expected_updated_at: initialUpdatedAt,
        p_token_completeness: totalScore,
        p_token_cluster_scores: clusterScores,
      })

      if (error) {
        if (handleRpcError(error)) return null
        throw error
      }

      const result = data as {
        token_id: string
        updated_at: string
        promoted_at: string
      }
      setInitialUpdatedAt(result.updated_at)
      setProjectStatus('promoted')
      setPromotedTokenId(result.token_id)
      toast.success('Design promoted: the token now lives in the screener')
      return result.token_id
    } catch (error) {
      console.error('Error promoting design:', error)
      toast.error('Failed to promote the design')
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    handleRpcError,
    handlePromote,
    onSubmitStep1,
    onSubmitStep2,
    onSubmitStep3,
    onSubmitStep4,
    onSubmitStep5,
    onSubmitStep6,

    openIdentityGuide,
    closeIdentityGuide,
    applyCategoryFromGuide,
    applySectorFromGuide,
    addSegment,
    openSegmentGuide,
    closeSegmentGuide,
    applySegmentTypeFromGuide,
    addRound,
    preventScrollChange,
    selectInputValue,
    handleFrequencyChange,

    goSection,
    prevSectionKey,
    nextSectionKey,
    handleContinue,
    handleFinish,
    queueAutosave,
    normalizeAllocations,
  }
}
