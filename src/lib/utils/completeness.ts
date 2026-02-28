export interface ClusterScores {
  identity: number   // max 20
  supply: number     // max 15
  allocation: number // max 20
  vesting: number    // max 20
}

export const CLUSTER_MAX: ClusterScores = {
  identity: 20,
  supply: 15,
  allocation: 20,
  vesting: 20,
}

export const CLUSTER_LABELS: Record<keyof ClusterScores, string> = {
  identity: 'Identity',
  supply: 'Supply',
  allocation: 'Allocation',
  vesting: 'Vesting',
}

export const CLUSTER_COLORS: Record<keyof ClusterScores, string> = {
  identity: 'violet',
  supply: 'sky',
  allocation: 'amber',
  vesting: 'emerald',
}

export function isClusterComplete(scores: ClusterScores): Record<keyof ClusterScores, boolean> {
  return {
    identity: scores.identity >= CLUSTER_MAX.identity,
    supply: scores.supply >= CLUSTER_MAX.supply,
    allocation: scores.allocation >= CLUSTER_MAX.allocation,
    vesting: scores.vesting >= CLUSTER_MAX.vesting,
  }
}

export function isVisualizationReady(scores: ClusterScores): boolean {
  const complete = isClusterComplete(scores)
  return complete.identity && complete.supply && complete.allocation && complete.vesting
}

/**
 * Compute per-cluster scores from raw DB data fetched in calculateFinalCompleteness.
 * Returns both the cluster breakdown and the full score (including Emission + Sources).
 */
export function computeScores(data: {
  token: {
    name: string | null
    ticker: string | null
    chain: string | null
    contract_address: string | null
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
  sourcesCount: number
}): { clusterScores: ClusterScores; totalScore: number } {
  const clusters: ClusterScores = { identity: 0, supply: 0, allocation: 0, vesting: 0 }

  // Identity (max 20)
  if (data.token.name && data.token.ticker && data.token.chain) clusters.identity += 10
  if (data.token.contract_address) clusters.identity += 5
  if (data.token.tge_date) clusters.identity += 5

  // Supply (max 15)
  if (data.supply?.max_supply) {
    clusters.supply += 10
    if (data.supply.initial_supply || data.supply.tge_supply) clusters.supply += 5
  }

  // Allocation (max 20)
  if (data.allocations.length >= 3) clusters.allocation += 10
  const totalPct = data.allocations.reduce((sum, s) => sum + (s.percentage || 0), 0)
  if (Math.abs(totalPct - 100) < 0.01) clusters.allocation += 10

  // Vesting (max 20)
  if (data.vestingCount > 0) clusters.vesting += 20

  // Non-cluster extras
  let extras = 0
  if (data.emission?.type) {
    extras += 5
    if (data.emission.annual_inflation_rate || data.emission.has_burn || data.emission.has_buyback) {
      extras += 5
    }
  }
  if (data.sourcesCount >= 1) extras += 10

  const totalScore = Math.min(
    clusters.identity + clusters.supply + clusters.allocation + clusters.vesting + extras,
    100
  )

  return { clusterScores: clusters, totalScore }
}
