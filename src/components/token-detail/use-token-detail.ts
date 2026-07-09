'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  computeVestingTimeline,
  type AllocationWithVesting,
} from '@/lib/utils/vesting-timeline'
import {
  formatRiskFlagTypeLabel,
  normalizeVestingFrequency,
} from '@/types/form'
import type { LiveGraphData } from '@/components/brand/live-graph'
import type { TokenData } from './types'
import { getMaxSupplyNum } from './detail-helpers'

/**
 * Fetches the token detail read-model and derives its view-model data
 * (knowledge-graph nodes/links, vesting unlock timeline). Single source of
 * truth for token/loading state — see
 * docs/refactor-plan-token-routes-20260620.md — Part B step 2.
 */
export function useTokenDetail(rawId: string | string[] | undefined) {
  const [token, setToken] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (rawId) {
      fetchTokenData(rawId as string)
    }
  }, [rawId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchTokenData = async (tokenId: string) => {
    try {
      setLoading(true)

      // Fetch token with all related data
      const { data: tokenData, error: tokenError } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', tokenId)
        .single()

      if (tokenError) throw tokenError

      // Fetch supply metrics (row may legitimately not exist yet)
      const { data: supplyData } = await supabase
        .from('supply_metrics')
        .select('*')
        .eq('token_id', tokenId)
        .maybeSingle()

      // Fetch allocations
      const { data: allocData } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', tokenId)
        .order('percentage', { ascending: false })

      // Fetch vesting schedules with allocation labels
      const allocationIds = allocData?.map((a) => a.id) || []
      const { data: vestingData } = await supabase
        .from('vesting_schedules')
        .select(
          `
          id,
          allocation_id,
          cliff_months,
          duration_months,
          frequency,
          tge_percentage,
          cliff_unlock_percentage,
          notes,
          allocation:allocation_segments!vesting_schedules_allocation_id_fkey(label)
        `,
        )
        .in('allocation_id', allocationIds)

      // Fetch emission model (row may legitimately not exist yet)
      const { data: emissionData } = await supabase
        .from('emission_models')
        .select('*')
        .eq('token_id', tokenId)
        .maybeSingle()

      // Fetch data sources
      const { data: sourcesData } = await supabase
        .from('data_sources')
        .select('*')
        .eq('token_id', tokenId)

      // Fetch risk flags
      const { data: riskFlagsData } = await supabase
        .from('risk_flags')
        .select('*')
        .eq('token_id', tokenId)

      // Fetch claim_sources (source → claim attribution)
      const { data: claimSourcesData } = await supabase
        .from('claim_sources')
        .select(
          `
          claim_type,
          claim_id,
          data_source_id,
          data_source:data_sources!claim_sources_data_source_id_fkey(document_name, source_type, url)
        `,
        )
        .eq('token_id', tokenId)

      setToken({
        ...tokenData,
        supply_metrics: supplyData || null,
        allocation_segments: allocData || [],
        vesting_schedules: (vestingData || []).map((schedule) => ({
          ...schedule,
          frequency: normalizeVestingFrequency(schedule.frequency),
        })),
        emission_models: emissionData || null,
        data_sources: sourcesData || [],
        risk_flags: riskFlagsData || [],
        claim_sources: (claimSourcesData || []) as TokenData['claim_sources'],
      })
    } catch (error: unknown) {
      console.error('Error fetching token:', error)
      toast.error('Failed to load token data')
    } finally {
      setLoading(false)
    }
  }

  // ── Local knowledge-graph: center token + real sub-entities ────────────────
  const graphData: LiveGraphData | null = useMemo(() => {
    if (!token) return null
    const nodes: LiveGraphData['nodes'] = [
      {
        id: 'token',
        type: 'token',
        label: token.ticker || token.name,
        size: 7,
      },
    ]
    const links: LiveGraphData['links'] = []

    if (token.chain) {
      nodes.push({ id: 'chain', type: 'chain', label: token.chain, size: 4 })
      links.push({ source: 'token', target: 'chain' })
    }
    token.allocation_segments.forEach((seg) => {
      const id = `alloc-${seg.id}`
      nodes.push({ id, type: 'allocation', label: seg.label, size: 4 })
      links.push({ source: 'token', target: id })
    })
    token.vesting_schedules.forEach((v, i) => {
      const id = `vesting-${v.allocation_id}-${i}`
      nodes.push({ id, type: 'vesting', label: v.allocation.label, size: 3.5 })
      // link vesting to its allocation node when present, else to the token
      const allocId = `alloc-${v.allocation_id}`
      links.push({
        source: nodes.some((n) => n.id === allocId) ? allocId : 'token',
        target: id,
      })
    })
    if (token.emission_models) {
      nodes.push({
        id: 'emission',
        type: 'emission',
        label: 'Emission',
        size: 4,
      })
      links.push({ source: 'token', target: 'emission' })
    }
    token.data_sources.forEach((src) => {
      const id = `source-${src.id}`
      nodes.push({
        id,
        type: 'data_source',
        label: src.document_name,
        size: 3.5,
      })
      links.push({ source: 'token', target: id })
    })
    token.risk_flags.forEach((flag) => {
      const id = `risk-${flag.id}`
      nodes.push({
        id,
        type: 'risk_flag',
        label: formatRiskFlagTypeLabel(flag.flag_type),
        size: 3.5,
      })
      links.push({ source: 'token', target: id })
    })

    return { nodes, links }
  }, [token])

  // ── Vesting unlock timeline (re-housed chart) ──────────────────────────────
  const vestingResult = useMemo(() => {
    if (!token) return null
    const maxSupply = getMaxSupplyNum(token)
    if (maxSupply <= 0 || token.vesting_schedules.length === 0) return null

    const allocationsWithVesting: AllocationWithVesting[] =
      token.allocation_segments.map((alloc) => {
        const vesting = token.vesting_schedules.find(
          (v) => v.allocation_id === alloc.id,
        )
        return {
          label: alloc.label,
          segment_type: alloc.segment_type,
          percentage: alloc.percentage,
          token_amount:
            Number((alloc.token_amount ?? '').toString().replace(/,/g, '')) ||
            (alloc.percentage / 100) * maxSupply,
          vesting: vesting
            ? {
                cliff_months: vesting.cliff_months,
                duration_months: vesting.duration_months,
                frequency: vesting.frequency,
                tge_percentage: vesting.tge_percentage,
                cliff_unlock_percentage: vesting.cliff_unlock_percentage,
              }
            : null,
        }
      })

    return computeVestingTimeline({
      allocations: allocationsWithVesting,
      maxSupply,
      tgeDate: token.tge_date,
    })
  }, [token])

  const vestingSegmentInfos = useMemo(() => {
    if (!vestingResult) return []
    return vestingResult.segmentKeys
      .filter((sk) => !vestingResult.customSegments.includes(sk.key))
      .map((sk) => ({ label: sk.key, segment_type: sk.segment_type }))
  }, [vestingResult])

  const maxSupplyNum = token ? getMaxSupplyNum(token) : 0

  return {
    token,
    setToken,
    loading,
    currentUserId,
    graphData,
    vestingResult,
    vestingSegmentInfos,
    maxSupplyNum,
  }
}
