'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { StatTile } from '@/components/composite/stat-tile'
import { StatusPill, type TokenStatus } from '@/components/composite/data-badge'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { EmptyState } from '@/components/composite/empty-state'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  ArrowRight,
  Compass,
  PenLine,
  Rocket,
  Circle,
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
  status: TokenStatus
  completeness: number
  cluster_scores: { identity: number; supply: number; allocation: number; vesting: number } | null
}

export default function DashboardPage() {
  const [tokens, setTokens] = useState<DashboardToken[]>([])
  const [loading, setLoading] = useState(true)
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
    total: tokens.length,
    validated: tokens.filter((t) => t.status === 'validated').length,
    in_review: tokens.filter((t) => t.status === 'in_review').length,
    draft: tokens.filter((t) => t.status === 'draft').length,
  }

  // weakest cluster, drives the "contribute" bridge
  const clusterStats = (Object.keys(CLUSTER_MAX) as Array<keyof ClusterScores>).map((key) => {
    const max = CLUSTER_MAX[key]
    const complete = tokens.filter((t) =>
      key === 'identity' ? !!(t.name && t.ticker) : (t.cluster_scores?.[key] ?? 0) >= max,
    ).length
    const rate = tokens.length > 0 ? (complete / tokens.length) * 100 : 0
    return { key, complete, total: tokens.length, rate }
  })
  const weakest = clusterStats.length ? clusterStats.reduce((a, b) => (a.rate <= b.rate ? a : b)) : null
  const goalPct = Math.round((stats.total / TARGET_TOKENS) * 100)

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader onAdd={() => router.push('/tokens/new')} />
        <div className="flex min-h-[420px] items-center justify-center rounded-xl border bg-surface-1">
          <GraphLoader label="Indexing your graph…" />
        </div>
      </div>
    )
  }

  const isEmpty = tokens.length === 0

  return (
    <div className="space-y-6">
      <PageHeader onAdd={() => router.push('/tokens/new')} />

      {isEmpty ? (
        <EmptyState
          className="min-h-[420px]"
          title="Your graph starts here"
          description="Structure your first token and watch its supply, allocations and vesting spawn into the living graph."
          onboardingHint='this completes "Contribute your first token"'
          actions={
            <Button variant="brand" size="lg" onClick={() => router.push('/tokens/new')}>
              <Plus className="h-4 w-4" /> Structure your first token
            </Button>
          }
        />
      ) : (
        <>
          {/* BAND 1, KPI rail */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Tokens structured"
              value={stats.total}
              hint={`${goalPct}% of the ${TARGET_TOKENS} goal`}
              icon={Sparkles}
              progress={goalPct}
              brandProgress
            />
            <StatTile
              label="Validated"
              value={stats.validated}
              hint="ready to explore & export"
              icon={CheckCircle2}
              accentVar="--data-vesting"
            />
            <StatTile
              label="In review"
              value={stats.in_review}
              hint="under validation"
              icon={Clock}
              accentVar="--data-allocation"
            />
            <StatTile
              label="Drafts"
              value={stats.draft}
              hint="resume to complete"
              icon={FileText}
              accentVar="--data-chain"
              onClick={() => router.push('/tokens')}
            />
          </div>

          {/* BAND 2, living graph + right column */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DashboardKnowledgeGraphCard />
            </div>
            <div className="space-y-4">
              <NextBestAction
                weakestLabel={weakest && weakest.rate < 100 ? CLUSTER_LABELS[weakest.key] : null}
                weakestMissing={weakest ? weakest.total - weakest.complete : 0}
                validated={stats.validated}
                onContribute={() => router.push('/tokens')}
                onExplore={() => router.push('/tokens')}
              />
              <GettingStarted
                hasToken={stats.total > 0}
                hasValidated={stats.validated > 0}
                onPublish={() => router.push('/export')}
              />
            </div>
          </div>

          {/* BAND 3, recent tokens */}
          <RecentTokens tokens={tokens.slice(0, 6)} onOpen={(id) => router.push(`/tokens/${id}`)} />
        </>
      )}
    </div>
  )
}

/* ── Page header ──────────────────────────────────────────────────────────── */

function PageHeader({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track the graph as it grows toward {TARGET_TOKENS} fully-structured tokens.
        </p>
      </div>
      <Button variant="brand" size="lg" onClick={onAdd} className="w-full sm:w-auto">
        <Plus className="h-5 w-5" /> Add token
      </Button>
    </div>
  )
}

/* ── Next best action, the contributor↔explorer bridge ───────────────────── */

function NextBestAction({
  weakestLabel,
  weakestMissing,
  validated,
  onContribute,
  onExplore,
}: {
  weakestLabel: string | null
  weakestMissing: number
  validated: number
  onContribute: () => void
  onExplore: () => void
}) {
  return (
    <div className="rounded-xl border bg-surface-1 p-4">
      <h2 className="mb-3 text-sm font-semibold">Next best action</h2>
      <div className="space-y-2.5">
        {weakestLabel && weakestMissing > 0 ? (
          <BridgeRow
            accent="--data-allocation"
            icon={PenLine}
            title={`${weakestMissing} token${weakestMissing > 1 ? 's' : ''} missing ${weakestLabel}`}
            cta="Contribute"
            onClick={onContribute}
          />
        ) : (
          <BridgeRow
            accent="--data-token"
            icon={PenLine}
            title="Structure another token"
            cta="Add"
            onClick={onContribute}
          />
        )}
        <BridgeRow
          accent="--data-vesting"
          icon={Compass}
          title={validated > 0 ? `${validated} validated tokens to explore` : 'Explore the knowledge graph'}
          cta="Explore"
          onClick={onExplore}
        />
      </div>
    </div>
  )
}

function BridgeRow({
  accent,
  icon: Icon,
  title,
  cta,
  onClick,
}: {
  accent: string
  icon: typeof Compass
  title: string
  cta: string
  onClick: () => void
}) {
  const color = `hsl(var(${accent}))`
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border bg-surface-2/40 px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-2"
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)`, color }}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{title}</span>
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
        {cta} <ArrowRight className="h-3 w-3" />
      </span>
    </button>
  )
}

/* ── Getting started checklist ────────────────────────────────────────────── */

function GettingStarted({
  hasToken,
  hasValidated,
  onPublish,
}: {
  hasToken: boolean
  hasValidated: boolean
  onPublish: () => void
}) {
  const items = [
    { label: 'See the graph in motion', done: true },
    { label: 'Structure your first token', done: hasToken },
    { label: 'Validate a token', done: hasValidated },
    { label: 'Publish to Intuition', done: false, action: onPublish },
  ]
  const done = items.filter((i) => i.done).length
  return (
    <div className="rounded-xl border bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Get started</h2>
        <span className="tabular text-xs text-muted-foreground">
          {done}/{items.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={item.action}
              disabled={!item.action && item.done}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm',
                item.action && 'hover:bg-surface-2',
              )}
            >
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-data-vesting" />
              ) : item.action ? (
                <Rocket className="h-4 w-4 shrink-0 text-data-token" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-faint-foreground" />
              )}
              <span className={cn(item.done && 'text-muted-foreground line-through')}>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Recent tokens ────────────────────────────────────────────────────────── */

function RecentTokens({ tokens, onOpen }: { tokens: DashboardToken[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-surface-1">
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <NodeGlyph type="token" size={14} /> Recent tokens
        </h2>
        <Link href="/tokens" className="text-xs text-muted-foreground hover:text-foreground">
          View all →
        </Link>
      </div>
      <ul className="divide-y">
        {tokens.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onOpen(t.id)}
              className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <NodeGlyph type="token" size={14} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {t.name} <span className="font-mono text-xs text-faint-foreground">{t.ticker}</span>
                </div>
              </div>
              <div className="hidden w-40 items-center gap-2 sm:flex">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${t.completeness ?? 0}%`, background: 'var(--gradient-brand)' }}
                  />
                </div>
                <span className="tabular w-9 text-right text-xs text-muted-foreground">{t.completeness ?? 0}%</span>
              </div>
              <StatusPill status={t.status} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
