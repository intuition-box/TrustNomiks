import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeVestingFrequency } from '@/types/form'
import type { ClusterScores } from '@/lib/utils/completeness'
import type { TokenWorkspaceData } from './token-workspace'

export interface DataRoomTokenListItem {
  id: string
  name: string
  ticker: string
  chain: string | null
  coingecko_id: string | null
  coingecko_image: string | null
  tge_date: string | null
  category: string | null
  status: string
  completeness: number
  cluster_scores: ClusterScores | null
}

/**
 * Loads everything a Data Room workspace needs for one token: supply,
 * allocations, vesting (second hop, keyed by allocation ids) and emission.
 * Shared by the single-token explorer and the compare board.
 */
export async function fetchWorkspaceData(
  supabase: SupabaseClient,
  token: DataRoomTokenListItem,
): Promise<TokenWorkspaceData> {
  const [supplyRes, allocRes, emissionRes] = await Promise.all([
    supabase
      .from('supply_metrics')
      .select('max_supply, initial_supply, tge_supply, circulating_supply')
      .eq('token_id', token.id)
      .single(),
    supabase
      .from('allocation_segments')
      .select('id, segment_type, label, percentage, token_amount')
      .eq('token_id', token.id)
      .order('percentage', { ascending: false }),
    supabase
      .from('emission_models')
      .select('type, annual_inflation_rate, has_burn, has_buyback')
      .eq('token_id', token.id)
      .single(),
  ])

  const allocationIds = allocRes.data?.map((a) => a.id) || []
  let vestingData: TokenWorkspaceData['vesting_schedules'] = []
  if (allocationIds.length > 0) {
    const { data } = await supabase
      .from('vesting_schedules')
      .select(
        'allocation_id, cliff_months, duration_months, frequency, tge_percentage, cliff_unlock_percentage',
      )
      .in('allocation_id', allocationIds)

    vestingData = (data || []).map((v) => ({
      ...v,
      frequency: normalizeVestingFrequency(v.frequency),
    }))
  }

  return {
    id: token.id,
    name: token.name,
    ticker: token.ticker,
    chain: token.chain,
    coingecko_id: token.coingecko_id,
    coingecko_image: token.coingecko_image,
    tge_date: token.tge_date,
    status: token.status,
    cluster_scores: token.cluster_scores,
    supply_metrics: supplyRes.data || null,
    allocation_segments: allocRes.data || [],
    vesting_schedules: vestingData,
    emission_models: emissionRes.data || null,
  }
}
