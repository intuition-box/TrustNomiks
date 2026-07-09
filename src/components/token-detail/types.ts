/**
 * Read-model for the token detail page (tokens/[id]). Mirrors the joined
 * shape fetched in use-token-detail.ts — see
 * docs/refactor-plan-token-routes-20260620.md — Part B step 1.
 */
export interface TokenData {
  id: string
  name: string
  ticker: string
  chain: string | null
  contract_address: string | null
  coingecko_id: string | null
  coingecko_image: string | null
  tge_date: string | null
  category: string | null
  sector: string | null
  status: string
  completeness: number
  cluster_scores: {
    identity: number
    supply: number
    allocation: number
    vesting: number
  } | null
  notes: string | null
  created_at: string
  supply_metrics: {
    max_supply: string | null
    initial_supply: string | null
    tge_supply: string | null
    circulating_supply: string | null
    circulating_date: string | null
    source_url: string | null
  } | null
  allocation_segments: Array<{
    id: string
    segment_type: string
    label: string
    percentage: number
    token_amount: string | null
    wallet_address: string | null
  }>
  vesting_schedules: Array<{
    allocation_id: string
    cliff_months: number
    duration_months: number
    frequency: string
    tge_percentage: number
    cliff_unlock_percentage: number
    allocation: {
      label: string
    }
  }>
  emission_models: {
    type: string
    annual_inflation_rate: number | null
    has_burn: boolean
    burn_details: string | null
    has_buyback: boolean
    buyback_details: string | null
    notes: string | null
  } | null
  data_sources: Array<{
    id: string
    source_type: string
    document_name: string
    url: string
    version: string | null
    verified_at: string | null
  }>
  risk_flags: Array<{
    id: string
    flag_type: string
    severity: string
    is_flagged: boolean
    justification: string | null
  }>
  claim_sources: Array<{
    claim_type: string
    claim_id: string | null
    data_source_id: string
    // Supabase returns joined rows as an array even for many-to-one FK joins
    data_source: Array<{
      document_name: string
      source_type: string
      url: string
    }>
  }>
}
