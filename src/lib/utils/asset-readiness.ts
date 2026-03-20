import { isClusterComplete } from '@/lib/utils/completeness'
import type { ClusterScores } from '@/lib/utils/completeness'

export type VisualAsset =
  | 'allocation_breakdown'
  | 'supply_composition'
  | 'unlock_timeline'
  | 'circulating_vs_max'
  | 'market_overlay'

export interface AssetReadiness {
  asset: VisualAsset
  ready: boolean
  missingClusters: string[]
  label: string
  chipColor: string // Tailwind class
  /** Phase 2+ assets are defined but not yet rendered in the workspace. */
  phase: 1 | 2
}

/**
 * Asset definitions: which clusters each visual asset requires.
 *
 * phase 1 = rendered now in the workspace
 * phase 2 = planned, not yet implemented (hidden from chips & CTA)
 */
const ASSET_DEFINITIONS: Array<{
  asset: VisualAsset
  requiredClusters: (keyof ClusterScores)[]
  requiresCoingecko: boolean
  label: string
  chipColor: string
  phase: 1 | 2
}> = [
  {
    asset: 'allocation_breakdown',
    requiredClusters: ['allocation'],
    requiresCoingecko: false,
    label: 'Alloc',
    chipColor: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
    phase: 1,
  },
  {
    asset: 'supply_composition',
    requiredClusters: ['supply', 'allocation'],
    requiresCoingecko: false,
    label: 'Supply',
    chipColor: 'bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/30',
    phase: 1,
  },
  {
    asset: 'unlock_timeline',
    requiredClusters: ['supply', 'allocation', 'vesting'],
    requiresCoingecko: false,
    label: 'Unlock',
    chipColor: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    phase: 1,
  },
  {
    asset: 'circulating_vs_max',
    requiredClusters: ['supply'],
    requiresCoingecko: false,
    label: 'Circ.',
    chipColor: 'bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/30',
    phase: 1,
  },
  {
    asset: 'market_overlay',
    requiredClusters: ['supply'],
    requiresCoingecko: true,
    label: 'USD',
    chipColor: 'bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30',
    phase: 2,
  },
]

/**
 * Compute which visual assets are available for a given token
 * based on its cluster scores and CoinGecko linkage.
 */
export function computeAssetReadiness(
  clusterScores: ClusterScores | null,
  coingeckoId: string | null
): AssetReadiness[] {
  if (!clusterScores) {
    return ASSET_DEFINITIONS.map((def) => ({
      asset: def.asset,
      ready: false,
      missingClusters: def.requiredClusters as string[],
      label: def.label,
      chipColor: def.chipColor,
      phase: def.phase,
    }))
  }

  const complete = isClusterComplete(clusterScores)

  return ASSET_DEFINITIONS.map((def) => {
    const missingClusters = def.requiredClusters.filter((c) => !complete[c])
    const clustersReady = missingClusters.length === 0
    const coingeckoReady = !def.requiresCoingecko || !!coingeckoId

    return {
      asset: def.asset,
      ready: clustersReady && coingeckoReady,
      missingClusters: [
        ...missingClusters,
        ...(def.requiresCoingecko && !coingeckoId ? ['coingecko'] : []),
      ],
      label: def.label,
      chipColor: def.chipColor,
      phase: def.phase,
    }
  })
}

/**
 * Check if a token has at least one Phase 1 visual asset ready.
 */
export function hasAnyVisualAsset(
  clusterScores: ClusterScores | null,
  coingeckoId: string | null
): boolean {
  return computeAssetReadiness(clusterScores, coingeckoId).some(
    (a) => a.ready && a.phase === 1
  )
}

/**
 * Check if a specific asset is ready.
 */
export function isAssetReady(
  asset: VisualAsset,
  clusterScores: ClusterScores | null,
  coingeckoId: string | null
): boolean {
  return computeAssetReadiness(clusterScores, coingeckoId).find((a) => a.asset === asset)?.ready ?? false
}
