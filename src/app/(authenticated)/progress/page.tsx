'use client'

import { useMemo } from 'react'
import { PageHeader } from '@/components/composite/page-header'
import { StatTile } from '@/components/composite/stat-tile'
import { EmptyState } from '@/components/composite/empty-state'
import { ErrorState } from '@/components/composite/error-state'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { cn } from '@/lib/utils'
import { Coins, Hexagon, Percent } from 'lucide-react'
import { useContributionData } from '@/hooks/use-contribution-data'
import { CONTRIBUTION_TIERS, getTierIndex } from '@/lib/contribution/tiers'
import { buildLeaderboard } from '@/lib/contribution/leaderboard'

/** A node filling up: ○ → ◔ → ◑ → ◕ → ● in the primary color. */
function TierGlyph({
  level,
  size = 14,
  className,
}: {
  level: number
  size?: number
  className?: string
}) {
  const fraction = level / (CONTRIBUTION_TIERS.length - 1)
  const r = size * 0.36
  const c = size / 2
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className={cn('shrink-0 text-primary', className)}
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={size * 0.12}
      />
      {fraction > 0 && (
        <path d={pieSlice(c, c, r * 0.82, fraction)} fill="currentColor" />
      )}
    </svg>
  )
}

function pieSlice(cx: number, cy: number, r: number, fraction: number): string {
  if (fraction >= 1) {
    return `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`
  }
  const angle = fraction * Math.PI * 2 - Math.PI / 2
  const x = cx + r * Math.cos(angle)
  const y = cy + r * Math.sin(angle)
  const largeArc = fraction > 0.5 ? 1 : 0
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y} Z`
}

export default function ProgressPage() {
  const { tokens, currentUser, profiles, loading, fetchFailed, refetch } =
    useContributionData()

  const userTokens = useMemo(
    () =>
      currentUser ? tokens.filter((t) => t.created_by === currentUser.id) : [],
    [tokens, currentUser],
  )
  const userAvgCompleteness =
    userTokens.length > 0
      ? Math.round(
          userTokens.reduce((sum, t) => sum + (t.completeness || 0), 0) /
            userTokens.length,
        )
      : 0
  const sharePercent =
    tokens.length > 0
      ? Math.round((userTokens.length / tokens.length) * 100)
      : 0
  const tierIndex = getTierIndex(userTokens.length)
  const tier = CONTRIBUTION_TIERS[tierIndex]
  const nextTier =
    tierIndex < CONTRIBUTION_TIERS.length - 1
      ? CONTRIBUTION_TIERS[tierIndex + 1]
      : null

  const leaderboard = useMemo(
    () => buildLeaderboard(tokens, currentUser?.id),
    [tokens, currentUser],
  )
  const maxCount = leaderboard[0]?.count ?? 1

  const contributorName = (
    userId: string,
    index: number,
    isCurrentUser: boolean,
  ) => {
    const profile = profiles.get(userId)
    if (profile?.display_name) return profile.display_name
    if (isCurrentUser) return currentUser?.email ?? 'You'
    return `Contributor #${index + 1}`
  }

  if (loading) {
    return (
      <GraphLoader className="mx-auto mt-24" label="Loading your standing…" />
    )
  }

  if (fetchFailed) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Progress"
          description="Your contribution tier, and how you rank in the graph."
        />
        <ErrorState
          title="Your progress did not load"
          message="The contribution data could not be fetched. Your data is safe."
          onRetry={refetch}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress"
        description="Your contribution tier, and how you rank in the graph."
      />

      {/* Stats rail */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Tokens added"
          value={userTokens.length}
          hint={`${tier.label}, tier ${tierIndex + 1} of ${CONTRIBUTION_TIERS.length}`}
          icon={Coins}
          accentVar="--data-token"
        />
        <StatTile
          label="Share of the registry"
          value={`${sharePercent}%`}
          hint={`${tokens.length} tokens in total`}
          icon={Percent}
          accentVar="--data-hub"
          progress={sharePercent}
        />
        <StatTile
          label="Avg completeness"
          value={`${userAvgCompleteness}%`}
          hint="across your tokens"
          icon={Hexagon}
          accentVar="--primary"
        />
      </div>

      {/* Tier ladder, in the product's own glyphs */}
      <section className="overflow-hidden rounded-xl border bg-surface-1">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Contribution tier</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Climb the ladder by structuring more tokens.
          </p>
        </div>
        <div className="p-5">
          <ul className="space-y-1">
            {CONTRIBUTION_TIERS.map((t, i) => (
              <li
                key={t.label}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                  i === tierIndex
                    ? 'bg-surface-2 font-medium text-foreground'
                    : i < tierIndex
                      ? 'text-muted-foreground'
                      : 'text-faint-foreground',
                )}
                aria-current={i === tierIndex ? 'true' : undefined}
              >
                <TierGlyph
                  level={i}
                  className={cn(i > tierIndex && 'opacity-40')}
                />
                <span className="flex-1">{t.label}</span>
                <span className="tabular text-xs">
                  {t.max === Infinity ? `${t.min}+` : `${t.min}-${t.max}`}{' '}
                  tokens
                </span>
              </li>
            ))}
          </ul>
          {nextTier && userTokens.length > 0 && (
            <p className="tabular mt-2 text-xs text-muted-foreground">
              {nextTier.min - userTokens.length} more token
              {nextTier.min - userTokens.length === 1 ? '' : 's'} to reach{' '}
              {nextTier.label}.
            </p>
          )}
        </div>
      </section>

      {/* Leaderboard */}
      <section className="overflow-hidden rounded-xl border bg-surface-1">
        <div className="border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Leaderboard</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Contributors ranked by structured tokens, then completeness.
          </p>
        </div>
        {leaderboard.length === 0 ? (
          <EmptyState
            className="m-4 border-0"
            title="No contributions yet"
            description="The first structured token starts the ranking."
          />
        ) : (
          <ul className="divide-y">
            {leaderboard.map((entry, index) => {
              const barWidth = Math.round((entry.count / maxCount) * 100)
              return (
                <li
                  key={entry.userId}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3',
                    entry.isCurrentUser && 'bg-primary/5',
                  )}
                >
                  <span
                    className={cn(
                      'tabular w-8 shrink-0 text-center font-mono text-xs',
                      index < 3
                        ? 'font-semibold text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    #{index + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">
                        {contributorName(
                          entry.userId,
                          index,
                          entry.isCurrentUser,
                        )}
                      </p>
                      {entry.isCurrentUser && (
                        <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">
                          you
                        </span>
                      )}
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          entry.isCurrentUser
                            ? 'bg-primary'
                            : 'bg-muted-foreground/30',
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold">
                      {entry.count}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        token{entry.count === 1 ? '' : 's'}
                      </span>
                    </p>
                    <p className="tabular text-[10px] text-muted-foreground">
                      {entry.avgCompleteness}% avg
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
