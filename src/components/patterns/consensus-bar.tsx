import { Flag, ThumbsUp } from 'lucide-react'
import { formatEther } from 'viem'

import { cn } from '@/lib/utils'

interface ConsensusBarProps {
  /** tTRUST (wei, as a string) backing the claim: on-chain support */
  forAssetsWei: string
  /** tTRUST (wei, as a string) backing the counter-triple: on-chain dispute */
  againstAssetsWei: string
  className?: string
}

/**
 * Two-segment consensus bar: on-chain support (--success) vs dispute stake
 * (--destructive) for a claim. Proportions are computed with BigInt math so
 * large wei amounts never lose precision; the both-zero case renders a
 * neutral empty bar instead of dividing by zero.
 */
export function ConsensusBar({
  forAssetsWei,
  againstAssetsWei,
  className,
}: ConsensusBarProps) {
  const forWei = toSafeBigInt(forAssetsWei)
  const againstWei = toSafeBigInt(againstAssetsWei)
  const total = forWei + againstWei
  const isEmpty = total === BigInt(0)

  const forPercent = toPercent(forWei, total)
  const againstPercent = toPercent(againstWei, total)

  return (
    <div className={cn('space-y-1.5', className)}>
      <div
        role="img"
        aria-label={
          isEmpty
            ? 'No stake yet'
            : `Support ${forPercent}%, dispute ${againstPercent}%`
        }
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        {!isEmpty && forWei > BigInt(0) && (
          <div
            className="h-full bg-success transition-[width] duration-300 ease-out"
            style={{ width: `${forPercent}%` }}
          />
        )}
        {!isEmpty && againstWei > BigInt(0) && (
          <div
            className="h-full bg-destructive transition-[width] duration-300 ease-out"
            style={{ width: `${againstPercent}%` }}
          />
        )}
      </div>

      {isEmpty ? (
        <p className="text-xs text-muted-foreground">No stake yet</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1 text-success">
            <ThumbsUp className="h-3 w-3 shrink-0" aria-hidden />
            Support
            <span className="tabular font-medium">
              {formatEther(forWei)} tTRUST
            </span>
            <span className="tabular text-muted-foreground">
              ({forPercent}%)
            </span>
          </span>
          <span className="inline-flex items-center gap-1 text-destructive">
            <Flag className="h-3 w-3 shrink-0" aria-hidden />
            Dispute
            <span className="tabular font-medium">
              {formatEther(againstWei)} tTRUST
            </span>
            <span className="tabular text-muted-foreground">
              ({againstPercent}%)
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

/** Parses a wei string defensively; negative or malformed input clamps to 0. */
function toSafeBigInt(value: string): bigint {
  try {
    const parsed = BigInt(value)
    return parsed < BigInt(0) ? BigInt(0) : parsed
  } catch {
    return BigInt(0)
  }
}

/** BigInt-safe percentage with one decimal of precision. */
function toPercent(part: bigint, total: bigint): number {
  if (total === BigInt(0)) return 0
  return Number((part * BigInt(1000)) / total) / 10
}
