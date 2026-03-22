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
  AlertTriangle,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { DashboardKnowledgeGraphCard } from '@/components/knowledge-graph/dashboard-knowledge-graph-card'
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
}

const CLUSTER_COLORS: Record<keyof ClusterScores, { indicator: string; dot: string; text: string }> = {
  identity:   { indicator: 'bg-violet-500', dot: 'bg-violet-400', text: 'text-violet-600 dark:text-violet-400' },
  supply:     { indicator: 'bg-sky-500',    dot: 'bg-sky-400',    text: 'text-sky-600 dark:text-sky-400'    },
  allocation: { indicator: 'bg-amber-500',  dot: 'bg-amber-400',  text: 'text-amber-600 dark:text-amber-400'  },
  vesting:    { indicator: 'bg-emerald-500',dot: 'bg-emerald-400',text: 'text-emerald-600 dark:text-emerald-400' },
}

export default function DashboardPage() {
  const [tokens, setTokens] = useState<DashboardToken[]>([])
  const [loading, setLoading] = useState(true)
  const [completenessOpen, setCompletenessOpen] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tokens')
        .select('id, name, ticker, status, completeness, cluster_scores')
        .order('created_at', { ascending: false })
      if (error) throw error
      setTokens(data || [])
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Failed to load dashboard data. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

  const stats = {
    total:     tokens.length,
    validated: tokens.filter((t) => t.status === 'validated').length,
    in_review: tokens.filter((t) => t.status === 'in_review').length,
    draft:     tokens.filter((t) => t.status === 'draft').length,
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
        <div className="bg-gradient-to-br from-indigo-100 dark:from-indigo-500/5 via-muted/10 to-transparent px-6 py-5">
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
        <Card className="border border-violet-500/30 overflow-hidden shadow-[0_0_20px_rgba(139,92,246,0.12)] bg-gradient-to-br from-violet-100 dark:from-violet-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-violet-100 dark:bg-violet-500/10">
              <LayoutDashboard className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Out of {TARGET_TOKENS} target</p>
          </CardContent>
        </Card>

        <Card className="border border-emerald-500/30 overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.12)] bg-gradient-to-br from-emerald-100 dark:from-emerald-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Validated</CardTitle>
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-100 dark:bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.validated}</div>
            <p className="text-xs text-muted-foreground mt-1">Ready for export</p>
          </CardContent>
        </Card>

        <Card className="border border-amber-500/30 overflow-hidden shadow-[0_0_20px_rgba(245,158,11,0.12)] bg-gradient-to-br from-amber-100 dark:from-amber-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-amber-100 dark:bg-amber-500/10">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.in_review}</div>
            <p className="text-xs text-muted-foreground mt-1">Under validation</p>
          </CardContent>
        </Card>

        <Card className="border border-sky-500/30 overflow-hidden shadow-[0_0_20px_rgba(14,165,233,0.12)] bg-gradient-to-br from-sky-100 dark:from-sky-500/5 to-transparent">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-sky-100 dark:bg-sky-500/10">
              <FileText className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.draft}</div>
            <p className="text-xs text-muted-foreground mt-1">To complete</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Completeness — collapsible */}
      <Card className="border border-indigo-500/30 overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.12)]">
        <button
          type="button"
          onClick={() => setCompletenessOpen((v) => !v)}
          className="w-full text-left"
        >
          <CardHeader className="border-b border-border/50 pb-4 bg-gradient-to-r from-indigo-100 dark:from-indigo-500/5 to-transparent">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2.5 text-base">
                <span className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-500/10">
                  <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </span>
                Data Completeness
              </CardTitle>
              <div className="flex items-center gap-3">
                <CardDescription className="text-xs">
                  {tokens.length} token{tokens.length !== 1 ? 's' : ''} · avg {avgCompleteness}%
                </CardDescription>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0',
                    completenessOpen && 'rotate-180'
                  )}
                />
              </div>
            </div>
          </CardHeader>
        </button>

        {completenessOpen && (
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

            {tokens.length > 0 && (
              <div className="rounded-lg bg-amber-100 dark:bg-amber-500/5 border border-amber-500/20 px-4 py-3 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300/80">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">Weakest cluster: {CLUSTER_LABELS[weakest.key]}</span>
                  {' '}— {weakest.total - weakest.complete} token{weakest.total - weakest.complete !== 1 ? 's' : ''} missing this data
                  {' '}({Math.round(100 - weakest.rate)}% incomplete)
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Knowledge Graph */}
      <DashboardKnowledgeGraphCard />
    </div>
  )
}
