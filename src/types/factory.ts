import type { FactoryBenchmarkSnapshot } from '@/lib/tokenomics/benchmarks'
import type { FactoryClusterScores } from '@/lib/tokenomics/factory-score'
import type { SimulationResult } from '@/lib/tokenomics/simulation/engine'
import type { FactorySimulationScenarioInput } from '@/lib/tokenomics/simulation/scenario'

/** Design lifecycle: a private draft, or promoted into a real screener token. */
export type FactoryProjectStatus = 'draft' | 'promoted'

/**
 * A Factory design row (factory_projects). Mirrors the screener's Token shape
 * minus contract_address / coingecko_* (a design has no deployed contract),
 * plus the benchmark snapshot pair and an Emission cluster in the scores.
 */
export interface FactoryProject {
  id: string
  name: string
  ticker: string
  chain: string | null
  tge_date: string | null
  category: string | null
  sector: string | null
  status: FactoryProjectStatus
  completeness: number
  cluster_scores: FactoryClusterScores | null
  benchmark_snapshot: FactoryBenchmarkSnapshot | null
  benchmark_snapshot_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string
}

/**
 * A saved stress-test run (factory_simulation_snapshots row): the scenario
 * assumptions plus the full server-computed result. design_updated_at is
 * the design's optimistic-lock timestamp at run time; a mismatch with the
 * current one means the design changed since this run.
 */
export interface FactorySimulationSnapshot {
  id: string
  project_id: string
  name: string
  scenario: FactorySimulationScenarioInput
  result: SimulationResult
  engine_version: string
  design_updated_at: string
  created_at: string
}

/** A revocable public link to a design (factory_share_links row). */
export interface FactoryShareLink {
  id: string
  project_id: string
  slug: string
  created_by: string
  created_at: string
  revoked_at: string | null
}

/**
 * Curated payload of get_shared_factory_design (the anon-callable RPC
 * behind /share/[slug]): the design's substance, no internal scoring, no
 * ownership metadata. Numeric columns arrive as JSON numbers.
 */
export interface FactorySharedDesign {
  project: {
    name: string
    ticker: string
    category: string | null
    sector: string | null
    notes: string | null
    tge_date: string | null
    updated_at: string
  }
  supply: { max_supply: number | null } | null
  allocations: Array<{
    id: string
    segment_type: string | null
    label: string
    percentage: number | null
    token_amount: number | null
  }>
  vesting: Array<{
    allocation_id: string
    cliff_months: number | null
    duration_months: number | null
    frequency: string | null
    tge_percentage: number | null
    cliff_unlock_percentage: number | null
  }>
  emission: {
    type: string | null
    annual_inflation_rate: number | null
    inflation_schedule: Array<{ year: number; rate: number }> | null
  } | null
  funding: Array<{
    round_type: string
    label: string | null
    round_date: string | null
    token_price_usd: number | null
    tokens_sold: number | null
    amount_usd: number | null
  }>
  snapshots: Array<{
    name: string
    scenario: FactorySimulationScenarioInput
    result: SimulationResult
    engine_version: string
    created_at: string
  }>
}
