/**
 * Factory scoring contract.
 *
 * `computeScores` (cluster-scores.ts, shared with the screener) caps a fully
 * complete Factory design at 80/100: the contract_address +5 and the Sources
 * +10 are unreachable for a private design (no deployed contract, no
 * attestation sources). Factory therefore has its own named scorer whose raw
 * ceiling is 80, rescaled to /100 through the single FACTORY_RESCALE constant.
 *
 * CONTRACT: every Factory consumer of a completeness number (the persisted
 * finish handler, the live score in the form-state hook, the spine section
 * maxes, the completion screen denominator, the interim completeness persisted
 * by the save handlers) must go through computeFactoryScore/FACTORY_RESCALE.
 * Never a hand-rolled Math.min(100, ...) over a raw sum.
 *
 * Emission is a first-class Factory cluster (FactoryClusterScores extends the
 * shared ClusterScores with a required `emission`); the screener's
 * ClusterScores stays untouched.
 */
import type { ClusterScores } from './cluster-scores'

export interface FactoryClusterScores extends ClusterScores {
  emission: number // max 10
}

export const FACTORY_CLUSTER_MAX: FactoryClusterScores = {
  identity: 15,
  supply: 15,
  allocation: 20,
  vesting: 20,
  emission: 10,
}

export const FACTORY_CLUSTER_LABELS: Record<
  keyof FactoryClusterScores,
  string
> = {
  identity: 'Identity',
  supply: 'Supply',
  allocation: 'Allocation',
  vesting: 'Vesting',
  emission: 'Emission',
}

/** Raw ceiling of a complete design (identity 15 + supply 15 + allocation 20 +
 *  vesting 20 + emission 10). */
export const FACTORY_MAX_RAW_SCORE = 80

/** The one rescale factor from the 80-point raw space to /100. Applied exactly
 *  once, inside computeFactoryScore. */
export const FACTORY_RESCALE = 100 / FACTORY_MAX_RAW_SCORE

/**
 * Compute per-cluster scores for a Factory design. Mirrors computeScores'
 * weights with the two unreachable terms removed: identity has no
 * contract_address +5 (max 15, not 20) and there is no Sources +10; Emission
 * is scored as its own cluster instead of an extras bucket.
 */
export function computeFactoryScore(data: {
  project: {
    name: string | null
    ticker: string | null
    chain: string | null
    tge_date: string | null
  }
  supply: {
    max_supply: number | null
    initial_supply?: number | null
    tge_supply?: number | null
  } | null
  allocations: { id: string; percentage: number }[]
  vestingCount: number
  emission: {
    type: string | null
    annual_inflation_rate?: number | null
    has_burn?: boolean | null
    has_buyback?: boolean | null
  } | null
}): { clusterScores: FactoryClusterScores; totalScore: number } {
  const clusters: FactoryClusterScores = {
    identity: 0,
    supply: 0,
    allocation: 0,
    vesting: 0,
    emission: 0,
  }

  // Identity (max 15)
  if (data.project.name && data.project.ticker && data.project.chain)
    clusters.identity += 10
  if (data.project.tge_date) clusters.identity += 5

  // Supply (max 15)
  if (data.supply?.max_supply) {
    clusters.supply += 10
    if (data.supply.initial_supply || data.supply.tge_supply)
      clusters.supply += 5
  }

  // Allocation (max 20)
  if (data.allocations.length >= 3) clusters.allocation += 10
  const totalPct = data.allocations.reduce(
    (sum, s) => sum + (s.percentage || 0),
    0,
  )
  if (Math.abs(totalPct - 100) < 0.01) clusters.allocation += 10

  // Vesting (max 20)
  if (data.vestingCount > 0) clusters.vesting += 20

  // Emission (max 10)
  if (data.emission?.type) {
    clusters.emission += 5
    if (
      data.emission.annual_inflation_rate ||
      data.emission.has_burn ||
      data.emission.has_buyback
    ) {
      clusters.emission += 5
    }
  }

  const raw =
    clusters.identity +
    clusters.supply +
    clusters.allocation +
    clusters.vesting +
    clusters.emission

  const totalScore = Math.min(100, Math.round(raw * FACTORY_RESCALE))

  return { clusterScores: clusters, totalScore }
}
