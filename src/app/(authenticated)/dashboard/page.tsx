'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Users,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import type { User } from '@supabase/supabase-js'
import { CLUSTER_LABELS, CLUSTER_MAX } from '@/lib/utils/completeness'
import type { ClusterScores } from '@/lib/utils/completeness'

const TARGET_TOKENS = 300

type DashboardToken = {
  id: string
  name: string
  ticker: string
  status: 'draft' | 'in_review' | 'validated'
  completeness: number
  cluster_scores: { identity: number; supply: number; allocation: number; vesting: number } | null
  created_by: string
}

const CLUSTER_COLORS: Record<keyof ClusterScores, { indicator: string; dot: string; text: string }> = {
  identity:   { indicator: 'bg-violet-500', dot: 'bg-violet-400', text: 'text-violet-400' },
  supply:     { indicator: 'bg-sky-500',    dot: 'bg-sky-400',    text: 'text-sky-400'    },
  allocation: { indicator: 'bg-amber-500',  dot: 'bg-amber-400',  text: 'text-amber-400'  },
  vesting:    { indicator: 'bg-emerald-500',dot: 'bg-emerald-400',text: 'text-emerald-400' },
}

const TIERS = [
  { label: 'Novice',      emoji: '🌱', min: 0,  max: 2,          color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
  { label: 'Contributor', emoji: '🏅', min: 3,  max: 9,          color: 'text-violet-400',  border: 'border-violet-500/40',  bg: 'bg-violet-500/10'  },
  { label: 'Expert',      emoji: '⭐', min: 10, max: 24,         color: 'text-sky-400',     border: 'border-sky-500/40',     bg: 'bg-sky-500/10'     },
  { label: 'Master',      emoji: '🔥', min: 25, max: 49,         color: 'text-orange-400',  border: 'border-orange-500/40',  bg: 'bg-orange-500/10'  },
  { label: 'Legend',      emoji: '👑', min: 50, max: Infinity,   color: 'text-yellow-400',  border: 'border-yellow-500/40',  bg: 'bg-yellow-500/10'  },
]

function getTierIndex(count: number) {
  const idx = TIERS.findIndex((t) => count >= t.min && count <= t.max)
  return idx >= 0 ? idx : 0
}

export default function DashboardPage() {
  const [tokens, setTokens] = useState<DashboardToken[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [tokensResult, userResult] = await Promise.all([
        supabase
          .from('tokens')
          .select('id, name, ticker, status, completeness, cluster_scores, created_by')
          .order('created_at', { ascending: false }),
        supabase.auth.getUser(),
      ])
      if (tokensResult.error) throw tokensResult.error
      setTokens(tokensResult.data || [])
      setCurrentUser(userResult.data.user)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load dashboard data. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

  // — Stats
  const stats = {
    total:      tokens.length,
    validated:  tokens.filter((t) => t.status === 'validated').length,
    in_review:  tokens.filter((t) => t.status === 'in_review').length,
    draft:      tokens.filter((t) => t.status === 'draft').length,
  }

  // — Cluster completeness
  const clusterStats = (Object.keys(CLUSTER_MAX) as Array<keyof ClusterScores>).map((key) => {
    const max = CLUSTER_MAX[key]
    const complete = tokens.filter((t) =>
      key === 'identity' ? !!(t.name && t.ticker) : (t.cluster_scores?.[key] ?? 0) >= max
    ).length
    const totalScore = tokens.reduce((sum, t) => sum + (t.cluster_scores?.[key] ?? 0), 0)
    const avgScore = tokens.length > 0 ? totalScore / tokens.length : 0
    const rate = tokens.length > 0 ? (complete / tokens.length) * 100 : 0
    return { key, complete, total: tokens.length, avgScore, max, rate }
  })
  const weakest = clusterStats.reduce((a, b) => (a.rate <= b.rate ? a : b))
  const avgCompleteness = tokens.length > 0
    ? Math.round(tokens.reduce((sum, t) => sum + (t.completeness || 0), 0) / tokens.length)
    : 0

  // — User contribution
  const userTokens = currentUser ? tokens.filter((t) => t.created_by === currentUser.id) : []
  const userAvgCompleteness = userTokens.length > 0
    ? Math.round(userTokens.reduce((sum, t) => sum + (t.completeness || 0), 0) / userTokens.length)
    : 0
  const sharePercent = tokens.length > 0 ? Math.round((userTokens.length / tokens.length) * 100) : 0
  const tierIndex = getTierIndex(userTokens.length)
  const tier = TIERS[tierIndex]
  const nextTier = tierIndex < TIERS.length - 1 ? TIERS[tierIndex + 1] : null

  // — Leaderboard
  const leaderboardMap = new Map<string, { count: number; totalCompleteness: number }>()
  for (const t of tokens) {
    if (!t.created_by) continue
    const entry = leaderboardMap.get(t.created_by) ?? { count: 0, totalCompleteness: 0 }
    entry.count++
    entry.totalCompleteness += t.completeness || 0
    leaderboardMap.set(t.created_by, entry)
  }
  const leaderboard = Array.from(leaderboardMap.entries())
    .map(([userId, data]) => ({
      userId,
      count: data.count,
      avgCompleteness: Math.round(data.totalCompleteness / data.count),
      isCurrentUser: userId === currentUser?.id,
    }))
    .sort((a, b) => b.count - a.count || b.avgCompleteness - a.avgCompleteness)
  const maxCount = leaderboard[0]?.count ?? 1

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border border-indigo-500/30 overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.12)]">
        <div className="bg-gradient-to-br from-indigo-500/5 via-muted/10 to-transparent px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="text-muted-foreground">Manage and track tokenomics data for your projects</p>
            </div>
            <Button onClick={() => router.push('/tokens/new')} size="lg" className="w-full sm:w-auto">
              <Plus className="mr-2 h-5 w-5" />
              Add Token
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-violet-500/30 overflow-hidden shadow-[0_0_20px_rgba(139,92,246,0.12)] bg-gradient-to-br from-violet-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-violet-500/10">
              <LayoutDashboard className="h-4 w-4 text-violet-400" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Out of {TARGET_TOKENS} target</p>
          </CardContent>
        </Card>

        <Card className="border border-emerald-500/30 overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.12)] bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Validated</CardTitle>
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.validated}</div>
            <p className="text-xs text-muted-foreground mt-1">Ready for export</p>
          </CardContent>
        </Card>

        <Card className="border border-amber-500/30 overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.12)] bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-400" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.in_review}</div>
            <p className="text-xs text-muted-foreground mt-1">Under validation</p>
          </CardContent>
        </Card>

        <Card className="border border-sky-500/30 overflow-hidden shadow-[0_0_20px_rgba(14,165,233,0.12)] bg-gradient-to-br from-sky-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-sky-500/10">
              <FileText className="h-4 w-4 text-sky-400" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.draft}</div>
            <p className="text-xs text-muted-foreground mt-1">To complete</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Completeness by Cluster */}
      <Card className="border border-indigo-500/30 overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.12)]">
        <CardHeader className="border-b border-border/50 pb-4 bg-gradient-to-r from-indigo-500/5 to-transparent">
          <CardTitle className="flex items-center gap-2.5 text-base">
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10">
              <TrendingUp className="h-4 w-4 text-indigo-400" />
            </span>
            Data Completeness
          </CardTitle>
          <CardDescription>
            {tokens.length} token{tokens.length !== 1 ? 's' : ''} · avg {avgCompleteness}% completeness across all clusters
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5 space-y-5">
          {clusterStats.map(({ key, complete, total, avgScore, max, rate }) => {
            const colors = CLUSTER_COLORS[key]
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', colors.dot)} />
                    <span className="text-sm font-medium">{CLUSTER_LABELS[key]}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground tabular-nums">
                      {complete}/{total}
                      <span className="hidden sm:inline"> tokens complete</span>
                    </span>
                    <span className={cn('font-bold tabular-nums w-8 text-right', colors.text)}>
                      {Math.round(rate)}%
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', colors.indicator)}
                    style={{ width: `${Math.min(100, rate)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground text-right">
                  avg {avgScore.toFixed(1)} / {max} pts
                </p>
              </div>
            )
          })}

          {/* Weakest cluster callout */}
          {tokens.length > 0 && (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-300/80">
                <span className="font-semibold text-amber-400">Weakest cluster: {CLUSTER_LABELS[weakest.key]}</span>
                {' '}— {weakest.total - weakest.complete} token{weakest.total - weakest.complete !== 1 ? 's' : ''} missing this data
                {' '}({Math.round(100 - weakest.rate)}% incomplete)
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contribution + Leaderboard */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Your Contribution */}
        <Card className="border border-violet-500/30 overflow-hidden shadow-[0_0_20px_rgba(139,92,246,0.12)]">
          <CardHeader className="border-b border-border/50 pb-4 bg-gradient-to-r from-violet-500/5 to-transparent">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-violet-500/10">
                <Zap className="h-4 w-4 text-violet-400" />
              </span>
              Your Contribution
            </CardTitle>
            <CardDescription>Your impact on the TrustNomiks database</CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {/* Tier + count */}
            <div className="flex items-center gap-4">
              <span className="text-5xl leading-none select-none">{tier.emoji}</span>
              <div>
                <p className={cn('text-2xl font-bold', tier.color)}>{tier.label}</p>
                <p className="text-xs text-muted-foreground">Level {tierIndex + 1} / {TIERS.length}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-3xl font-bold">{userTokens.length}</p>
                <p className="text-xs text-muted-foreground">tokens added</p>
              </div>
            </div>

            {/* Share of DB */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Your share of the database</span>
                <span className="font-semibold tabular-nums">{sharePercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, sharePercent)}%` }}
                />
              </div>
            </div>

            {/* Avg completeness */}
            <div className="flex items-center justify-between rounded-lg bg-muted/30 border border-border/40 px-3 py-2.5">
              <span className="text-xs text-muted-foreground">Avg completeness of your tokens</span>
              <span className="text-sm font-bold">{userAvgCompleteness}%</span>
            </div>

            {/* Next milestone */}
            {nextTier && userTokens.length > 0 && (
              <div className={cn('rounded-lg border px-3 py-2.5 text-xs', nextTier.bg, nextTier.border)}>
                <span className="text-muted-foreground">
                  {nextTier.min - userTokens.length} more token{nextTier.min - userTokens.length !== 1 ? 's' : ''} to unlock
                </span>
                {' '}
                <span className={cn('font-semibold', nextTier.color)}>
                  {nextTier.emoji} {nextTier.label}
                </span>
              </div>
            )}

            {/* Tier ladder */}
            <div className="flex items-center gap-1 flex-wrap pt-1">
              {TIERS.map((t, i) => (
                <div key={t.label} className="flex items-center gap-1">
                  <span className={cn(
                    'text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all',
                    i === tierIndex
                      ? cn(t.color, t.border, t.bg)
                      : i < tierIndex
                        ? cn(t.color, 'border-transparent opacity-50')
                        : 'text-muted-foreground/30 border-transparent'
                  )}>
                    {t.emoji} {t.label}
                  </span>
                  {i < TIERS.length - 1 && (
                    <span className="text-muted-foreground/25 text-[10px]">›</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <Card className="border border-indigo-500/30 overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.12)]">
          <CardHeader className="border-b border-border/50 pb-4 bg-gradient-to-r from-indigo-500/5 to-transparent">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10">
                <Trophy className="h-4 w-4 text-indigo-400" />
              </span>
              Leaderboard
            </CardTitle>
            <CardDescription>Top contributors ranked by token count</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            {leaderboard.length === 0 ? (
              <div className="py-10 text-center">
                <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No contributions yet</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {leaderboard.map((entry, index) => {
                  const medals = ['🥇', '🥈', '🥉']
                  const barWidth = Math.round((entry.count / maxCount) * 100)
                  return (
                    <div
                      key={entry.userId}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-colors',
                        entry.isCurrentUser
                          ? 'bg-indigo-500/10 border-indigo-500/30'
                          : 'bg-muted/20 border-border/30'
                      )}
                    >
                      {/* Rank */}
                      <span className="w-6 text-center shrink-0 text-base leading-none select-none">
                        {index < 3
                          ? medals[index]
                          : <span className="text-xs text-muted-foreground font-bold">#{index + 1}</span>
                        }
                      </span>

                      {/* Identity + bar */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">
                            {entry.isCurrentUser
                              ? (currentUser?.email ?? 'You')
                              : `Contributor ···${entry.userId.slice(-6)}`}
                          </p>
                          {entry.isCurrentUser && (
                            <span className="text-[10px] text-indigo-400 font-semibold bg-indigo-500/10 border border-indigo-500/20 rounded-full px-1.5 py-px shrink-0">
                              you
                            </span>
                          )}
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              entry.isCurrentUser ? 'bg-indigo-500' : 'bg-muted-foreground/30'
                            )}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">{entry.count} <span className="text-xs font-normal text-muted-foreground">tokens</span></p>
                        <p className="text-[10px] text-muted-foreground">{entry.avgCompleteness}% avg</p>
                      </div>
                    </div>
                  )
                })}

                {leaderboard.length === 1 && (
                  <p className="text-xs text-muted-foreground/40 text-center pt-2">
                    More contributors will appear here
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
