'use client'

import { CLUSTER_LABELS, CLUSTER_MAX, type ClusterScores } from '@/lib/utils/completeness'
import { cn } from '@/lib/utils'

/** Cluster → semantic data token. Same color = same concept, everywhere. */
const CLUSTER_VAR: Record<keyof ClusterScores, string> = {
  identity: '--data-token',
  supply: '--data-supply',
  allocation: '--data-allocation',
  vesting: '--data-vesting',
}

const CLUSTER_ORDER: Array<keyof ClusterScores> = ['identity', 'supply', 'allocation', 'vesting']

interface ClusterMeterProps {
  scores: ClusterScores | null
  /** overall 0-100, rendered next to the segments */
  percent?: number
  /** identity is complete when name+ticker exist even at partial points */
  identityComplete?: boolean
  className?: string
}

/**
 * Completeness as four data clusters lighting up in their taxonomy colors,
 * instead of an anonymous progress bar. Fill state (solid / faded / hollow)
 * carries the meaning in grayscale too; each segment names itself for AT.
 */
export function ClusterMeter({ scores, percent, identityComplete, className }: ClusterMeterProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="inline-flex items-center gap-[3px]">
        {CLUSTER_ORDER.map((key) => {
          const score = scores?.[key] ?? 0
          const max = CLUSTER_MAX[key]
          const complete = key === 'identity' && identityComplete !== undefined ? identityComplete : score >= max
          const started = score > 0
          const color = `hsl(var(${CLUSTER_VAR[key]}))`
          const label = `${CLUSTER_LABELS[key]}: ${score}/${max} pts`

          return (
            <span
              key={key}
              role="img"
              aria-label={label}
              title={label}
              className="h-[7px] w-3.5 rounded-full border"
              style={
                complete
                  ? { backgroundColor: color, borderColor: color }
                  : started
                    ? {
                        backgroundColor: `color-mix(in oklab, ${color} 35%, transparent)`,
                        borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
                      }
                    : { borderColor: 'hsl(var(--border-strong))' }
              }
            />
          )
        })}
      </span>
      {typeof percent === 'number' && (
        <span className="tabular text-xs font-medium text-muted-foreground">{percent}%</span>
      )}
    </span>
  )
}
