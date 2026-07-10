'use client'

import { useMemo } from 'react'
import { PageHeader } from '@/components/composite/page-header'
import { StatTile } from '@/components/composite/stat-tile'
import { EmptyState } from '@/components/composite/empty-state'
import { ErrorState } from '@/components/composite/error-state'
import { UserMark } from '@/components/composite/user-mark'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { TierEmblem } from '@/components/patterns/tier-emblem'
import { cn } from '@/lib/utils'
import { Coins, Hexagon, Percent } from 'lucide-react'
import { useContributionData } from '@/hooks/use-contribution-data'
import { CONTRIBUTION_TIERS, getTierIndex } from '@/lib/contribution/tiers'
import { buildLeaderboard } from '@/lib/contribution/leaderboard'
import { useTierMoment } from '@/features/insights/use-pulse-moments'

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

  const myAdditions7d = useMemo(() => {
    const weekAgo = new Date().getTime() - 7 * 24 * 60 * 60 * 1000
    return userTokens.filter((t) => new Date(t.created_at).getTime() >= weekAgo)
      .length
  }, [userTokens])

  // Tier-up moment: one toast max per session, watermarked per browser
  useTierMoment(tierIndex, tier.label, !loading && !fetchFailed)

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

      {/* The ascension hero: your emblem, your tier, the next summit */}
      <section className="relative overflow-hidden rounded-xl border bg-surface-1">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-brand-soft opacity-30"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <TierEmblem
            level={tierIndex}
            size={96}
            progress={
              nextTier
                ? (userTokens.length - tier.min) / (nextTier.min - tier.min)
                : 1
            }
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-faint-foreground">
              Your tier · {tierIndex + 1} of {CONTRIBUTION_TIERS.length}
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">
              {tier.label}
            </h2>
            <p className="tabular text-sm text-muted-foreground">
              {userTokens.length} token{userTokens.length === 1 ? '' : 's'}{' '}
              structured
              {nextTier ? (
                <>
                  {' · '}
                  <span className="text-foreground">
                    {nextTier.min - userTokens.length} more
                  </span>{' '}
                  to reach {nextTier.label}
                </>
              ) : (
                ' · the summit of the ladder'
              )}
            </p>
          </div>

          {/* The ladder as a path: past lit, present ringed, future faint */}
          <div className="overflow-x-auto">
            <ol className="flex items-start gap-0" aria-label="Tier ladder">
              {CONTRIBUTION_TIERS.map((t, i) => (
                <li key={t.label} className="flex items-start">
                  {i > 0 && (
                    <span
                      aria-hidden
                      className={cn(
                        'mt-5 block h-px w-5 sm:w-7',
                        i <= tierIndex ? 'bg-primary/60' : 'bg-border-strong',
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      'flex w-16 flex-col items-center gap-1 text-center',
                      i > tierIndex && 'opacity-40',
                    )}
                    aria-current={i === tierIndex ? 'step' : undefined}
                  >
                    <span
                      className={cn(
                        'rounded-full',
                        i === tierIndex &&
                          'bg-primary/10 ring-1 ring-primary/40',
                      )}
                    >
                      <TierEmblem level={i} size={40} />
                    </span>
                    <span
                      className={cn(
                        'text-[10px] leading-tight',
                        i === tierIndex
                          ? 'font-semibold text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {t.label}
                    </span>
                    <span className="tabular text-[9px] text-faint-foreground">
                      {t.max === Infinity ? `${t.min}+` : `${t.min}-${t.max}`}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Stats rail */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Tokens added"
          value={userTokens.length}
          hint={`${tier.label}, tier ${tierIndex + 1} of ${CONTRIBUTION_TIERS.length}`}
          icon={Coins}
          accentVar="--data-token"
          delta={myAdditions7d > 0 ? `+${myAdditions7d} this week` : undefined}
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
                  <UserMark seed={entry.userId} size={30} />
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
