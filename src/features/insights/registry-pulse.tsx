'use client'

import Link from 'next/link'
import { Hexagon, Sparkles, TriangleAlert, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RegistryPulse } from '@/lib/insights/build-insights'
import type { ClusterScores } from '@/lib/utils/completeness'

interface RegistryPulseBandProps {
  pulse: RegistryPulse
  /** total open challenges across the registry (from useOpenChallengeCountByToken) */
  openChallenges: number
  isContributor: boolean
  className?: string
}

/** Cluster → its taxonomy token (mirrors CLUSTER_COLORS semantics). */
const CLUSTER_CSS_VAR: Record<keyof ClusterScores, string> = {
  identity: '--data-token',
  supply: '--data-supply',
  allocation: '--data-allocation',
  vesting: '--data-vesting',
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
}

function Cell({
  label,
  children,
  caption,
}: {
  label: string
  children: React.ReactNode
  caption?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface-1 p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {caption && (
        <span className="text-xs text-faint-foreground">{caption}</span>
      )}
    </div>
  )
}

/**
 * The screener's opening line: what the registry knows, how it moved, where it
 * is weakest, and what is being disputed. Replaces the KPI tiles duplicated
 * from the dashboard; status filtering lives in the table's segmented control.
 */
export function RegistryPulseBand({
  pulse,
  openChallenges,
  isContributor,
  className,
}: RegistryPulseBandProps) {
  const weakestVar = pulse.weakest
    ? CLUSTER_CSS_VAR[pulse.weakest.key]
    : '--data-vesting'

  return (
    <section
      aria-label="Registry pulse"
      className={cn(
        'grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {/* Milestone: the unified /300 vocabulary (structured primary, validated secondary) */}
      <Cell
        label="Registry"
        caption={`${pulse.validated} validated · ${pulse.goalPct}% of goal`}
      >
        <span className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{
              backgroundColor:
                'color-mix(in oklab, hsl(var(--data-hub)) 14%, transparent)',
              color: 'hsl(var(--data-hub))',
            }}
          >
            <Hexagon className="h-4 w-4" aria-hidden />
          </span>
          <span className="tabular text-2xl font-semibold leading-none">
            {pulse.total}
            <span className="text-sm font-normal text-faint-foreground">
              {' '}
              / {pulse.target} structured
            </span>
          </span>
        </span>
        <span
          className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2"
          aria-hidden
        >
          <span
            className="block h-full rounded-full bg-gradient-brand"
            style={{
              width: `${Math.min(100, (pulse.total / pulse.target) * 100)}%`,
            }}
          />
        </span>
      </Cell>

      {/* Momentum: additions this week, or the last landing when the week is quiet */}
      <Cell
        label="This week"
        caption={
          pulse.additions7d > 0
            ? `token${pulse.additions7d === 1 ? '' : 's'} added to the graph`
            : pulse.lastAdded
              ? `last added ${formatShortDate(pulse.lastAdded.createdAt)}`
              : 'the graph is waiting for its first token'
        }
      >
        <span className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{
              backgroundColor:
                'color-mix(in oklab, hsl(var(--data-token)) 14%, transparent)',
              color: 'hsl(var(--data-token))',
            }}
          >
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          {pulse.additions7d > 0 ? (
            <span className="tabular text-2xl font-semibold leading-none">
              +{pulse.additions7d}
            </span>
          ) : (
            <span className="min-w-0 truncate text-base font-semibold leading-tight">
              {pulse.lastAdded ? (
                <>
                  {pulse.lastAdded.name}{' '}
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {pulse.lastAdded.ticker}
                  </span>
                </>
              ) : (
                'Quiet'
              )}
            </span>
          )}
        </span>
      </Cell>

      {/* Weakest cluster: where the next contribution lands hardest */}
      <Cell
        label="Weakest cluster"
        caption={
          pulse.weakest ? (
            isContributor ? (
              <Link
                href="/tokens/new"
                className="text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Contribute data →
              </Link>
            ) : (
              `${pulse.weakest.missing} token${pulse.weakest.missing === 1 ? '' : 's'} incomplete`
            )
          ) : (
            'every cluster is complete'
          )
        }
      >
        <span className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: `hsl(var(${weakestVar}))` }}
            aria-hidden
          />
          {pulse.weakest ? (
            <span className="text-base font-semibold leading-tight">
              {pulse.weakest.label}
              <span className="tabular ml-1.5 text-sm font-normal text-muted-foreground">
                {pulse.weakest.missing} missing
              </span>
            </span>
          ) : (
            <span className="text-base font-semibold leading-tight">
              All complete
            </span>
          )}
        </span>
      </Cell>

      {/* Disputes: consensus at work */}
      <Cell
        label="Disputes"
        caption={
          openChallenges > 0 ? (
            <Link href="/dashboard" className="text-primary hover:underline">
              Review challenges →
            </Link>
          ) : (
            'no claim is currently contested'
          )
        }
      >
        <span className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md"
            style={{
              backgroundColor: `color-mix(in oklab, hsl(var(${openChallenges > 0 ? '--data-risk' : '--status-validated'})) 14%, transparent)`,
              color: `hsl(var(${openChallenges > 0 ? '--data-risk' : '--status-validated'}))`,
            }}
          >
            {openChallenges > 0 ? (
              <TriangleAlert className="h-4 w-4" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            )}
          </span>
          <span className="tabular text-2xl font-semibold leading-none">
            {openChallenges}
            <span className="text-sm font-normal text-faint-foreground">
              {' '}
              open
            </span>
          </span>
        </span>
      </Cell>
    </section>
  )
}
