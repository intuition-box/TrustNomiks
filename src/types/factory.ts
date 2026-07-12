import type { FactoryClusterScores } from '@/lib/tokenomics/factory-score'

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
  benchmark_snapshot: Record<string, unknown> | null
  benchmark_snapshot_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string
}
