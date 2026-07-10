import {
  CLUSTER_LABELS,
  CLUSTER_MAX,
  type ClusterScores,
} from '@/lib/utils/completeness'
import { TARGET_TOKENS } from './constants'

/** Minimal structural shape needed from a registry token (Token satisfies it). */
export interface RegistryPulseToken {
  name: string
  ticker: string
  status: 'draft' | 'in_review' | 'validated'
  created_at: string
  cluster_scores: ClusterScores | null
}

export interface WeakestCluster {
  key: keyof ClusterScores
  label: string
  /** tokens whose cluster is not yet complete */
  missing: number
}

export interface RegistryPulse {
  total: number
  target: number
  goalPct: number
  validated: number
  /** tokens created in the trailing 7 days */
  additions7d: number
  /** most recent addition, for the sparse state when additions7d is 0 */
  lastAdded: { name: string; ticker: string; createdAt: string } | null
  /** lowest completion-rate cluster across the registry (null when empty or all complete) */
  weakest: WeakestCluster | null
}

const CLUSTER_KEYS = Object.keys(CLUSTER_MAX) as Array<keyof ClusterScores>

/**
 * Pure aggregation over the registry list (no fetching): the numbers behind
 * the screener's pulse band. Same weakest-cluster semantics as the dashboard's
 * "next best action" (completion rate per cluster, lowest wins).
 */
export function buildRegistryPulse(
  tokens: readonly RegistryPulseToken[],
  now: Date,
): RegistryPulse {
  const total = tokens.length
  const validated = tokens.filter((t) => t.status === 'validated').length

  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000
  const additions7d = tokens.filter(
    (t) => new Date(t.created_at).getTime() >= weekAgo,
  ).length

  let lastAdded: RegistryPulse['lastAdded'] = null
  for (const t of tokens) {
    if (!lastAdded || t.created_at > lastAdded.createdAt) {
      lastAdded = { name: t.name, ticker: t.ticker, createdAt: t.created_at }
    }
  }

  let weakest: WeakestCluster | null = null
  if (total > 0) {
    let worstRate = 1
    for (const key of CLUSTER_KEYS) {
      const complete = tokens.filter(
        (t) => (t.cluster_scores?.[key] ?? 0) >= CLUSTER_MAX[key],
      ).length
      const rate = complete / total
      if (rate < 1 && rate < worstRate) {
        worstRate = rate
        weakest = { key, label: CLUSTER_LABELS[key], missing: total - complete }
      }
    }
  }

  return {
    total,
    target: TARGET_TOKENS,
    goalPct: Math.round((total / TARGET_TOKENS) * 100),
    validated,
    additions7d,
    lastAdded,
    weakest,
  }
}
