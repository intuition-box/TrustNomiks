/**
 * Promote-to-screener scoring bridge.
 *
 * A promoted design mints a screener token, and the screener measures
 * completeness with its own scorer (computeScores, raw /100 including
 * chain/contract/tge/sources points a fresh design cannot have). The promote
 * RPC persists whatever the caller passes, so this helper is THE one place
 * that builds the screener-scale score for the minted token — always through
 * the shared computeScores, never hand-rolled (factory-score.ts contract).
 *
 * A design deliberately has no chain, no contract address, no TGE date and no
 * sources: the minted token scores what it honestly is — a rich private draft
 * the owner keeps enriching in the screener studio.
 */
import { computeScores, type ClusterScores } from './cluster-scores'

export interface PromotedTokenScoreInput {
  name: string | null
  ticker: string | null
  hasMaxSupply: boolean
  /** The design's derived TGE unlock lands in supply_metrics.tge_supply. */
  hasTgeSupply: boolean
  allocations: { id: string; percentage: number }[]
  vestingCount: number
  emission: {
    type: string | null
    annual_inflation_rate?: number | null
    has_burn?: boolean | null
    has_buyback?: boolean | null
  } | null
}

export function buildPromotedTokenScore(input: PromotedTokenScoreInput): {
  clusterScores: ClusterScores
  totalScore: number
} {
  return computeScores({
    token: {
      name: input.name,
      ticker: input.ticker,
      chain: null,
      contract_address: null,
      tge_date: null,
    },
    supply: input.hasMaxSupply
      ? { max_supply: 1, tge_supply: input.hasTgeSupply ? 1 : null }
      : null,
    allocations: input.allocations,
    vestingCount: input.vestingCount,
    emission: input.emission,
    sourcesCount: 0,
  })
}
