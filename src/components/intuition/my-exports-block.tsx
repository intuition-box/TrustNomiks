'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  RotateCcw,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { WalletConnectButton } from '@/components/wallet-connect-button'
import { RunDetailDialog } from './run-detail-dialog'
import type { MyRunsResponse, MyRunSummary } from '@/types/intuition'
import type { RunStatus } from '@/lib/intuition/types'

const DEFAULT_PAGE_SIZE = 20

const STATUS_VARIANTS: Record<RunStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  partial: 'secondary',
  failed: 'destructive',
  running: 'outline',
  pending: 'outline',
}

export function MyExportsBlock() {
  const { address, isConnected } = useAccount()

  const [data, setData] = useState<MyRunsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [openRunId, setOpenRunId] = useState<string | null>(null)

  const fetchRuns = useCallback(
    async (targetPage: number) => {
      if (!address) return

      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/intuition/my-runs?wallet=${address}&page=${targetPage}&pageSize=${DEFAULT_PAGE_SIZE}`,
        )
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        const json = (await res.json()) as MyRunsResponse
        setData(json)
        setPage(json.page)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load your publish history'
        setError(msg)
        toast.error(msg)
      } finally {
        setLoading(false)
      }
    },
    [address],
  )

  useEffect(() => {
    if (isConnected && address) {
      fetchRuns(1)
    } else {
      setData(null)
      setPage(1)
    }
  }, [isConnected, address, fetchRuns])

  // ── Render: wallet not connected ────────────────────────────────────────

  if (!isConnected || !address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            My Exports
          </CardTitle>
          <CardDescription>
            Your on-chain publish history, filtered by the currently connected wallet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Connect your wallet to see the runs you have published to Intuition testnet.
          </p>
          <WalletConnectButton />
        </CardContent>
      </Card>
    )
  }

  // ── Render: loaded / loading / error ────────────────────────────────────

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const canPrev = page > 1
  const canNext = data ? page < totalPages : false

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              My Exports
            </CardTitle>
            <CardDescription>
              Publish runs for wallet{' '}
              <code className="text-xs">
                {address.slice(0, 6)}…{address.slice(-4)}
              </code>
              .
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchRuns(page)}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Aggregates */}
        {data && (
          <AggregatesRow
            distinctTokens={data.aggregates.distinctTokens}
            totalAtoms={data.aggregates.totalAtomsCreated}
            totalTriples={data.aggregates.totalTriplesCreated}
            totalRuns={data.aggregates.totalRuns}
            runsByStatus={data.aggregates.runsByStatus}
          />
        )}

        <Separator />

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Loading (initial) */}
        {loading && !data && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your publish history…
          </div>
        )}

        {/* Empty state */}
        {data && data.runs.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            This wallet has no publish runs yet. Publish a token from its detail page to get started.
          </div>
        )}

        {/* Runs list */}
        {data && data.runs.length > 0 && (
          <div className="space-y-3">
            {data.runs.map((run) => (
              <RunCard key={run.runId} run={run} onViewRun={setOpenRunId} />
            ))}
          </div>
        )}

        {/* Drill-down dialog */}
        <RunDetailDialog
          runId={openRunId}
          open={openRunId !== null}
          onClose={() => setOpenRunId(null)}
        />

        {/* Pagination */}
        {data && data.total > data.pageSize && (
          <div className="flex items-center justify-between border-t pt-3">
            <p className="text-sm text-muted-foreground">
              Page {data.page} of {totalPages} — {data.total} run{data.total === 1 ? '' : 's'} total
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchRuns(page - 1)}
                disabled={!canPrev || loading}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchRuns(page + 1)}
                disabled={!canNext || loading}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function AggregatesRow({
  distinctTokens,
  totalAtoms,
  totalTriples,
  totalRuns,
  runsByStatus,
}: {
  distinctTokens: number
  totalAtoms: number
  totalTriples: number
  totalRuns: number
  runsByStatus: Record<RunStatus, number>
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Tokens published" value={distinctTokens} />
      <Stat label="Atoms created" value={totalAtoms} />
      <Stat label="Triples created" value={totalTriples} />
      <Stat
        label="Runs"
        value={totalRuns}
        hint={
          <div className="flex flex-wrap gap-1">
            {(['completed', 'partial', 'failed', 'running'] as const).map((s) =>
              runsByStatus[s] > 0 ? (
                <Badge key={s} variant={STATUS_VARIANTS[s]} className="text-[10px]">
                  {runsByStatus[s]} {s}
                </Badge>
              ) : null,
            )}
          </div>
        }
      />
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      {hint && <div className="mt-2">{hint}</div>}
    </div>
  )
}

function RunCard({
  run,
  onViewRun,
}: {
  run: MyRunSummary
  onViewRun?: (runId: string) => void
}) {
  const canResume = run.status === 'partial' || run.status === 'failed'

  const started = new Date(run.startedAt)
  const completed = run.completedAt ? new Date(run.completedAt) : null

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{run.tokenName}</span>
          <Badge variant="secondary">{run.tokenTicker}</Badge>
          <Badge variant={STATUS_VARIANTS[run.status]}>{run.status}</Badge>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{started.toLocaleString()}</span>
          {completed && <span>·&nbsp;completed {completed.toLocaleString()}</span>}
          <span>·&nbsp;{run.txHashCount} tx</span>
        </div>

        <div className="flex flex-wrap gap-3 pt-1 text-xs">
          <CounterChip label="atoms" created={run.atomsCreated} failed={run.atomsFailed} />
          <CounterChip label="triples" created={run.triplesCreated} failed={run.triplesFailed} />
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onViewRun?.(run.runId)}
          disabled={!onViewRun}
        >
          <Eye className="mr-1 h-4 w-4" />
          View graph
        </Button>
        {canResume && (
          <Link href={`/tokens/${run.tokenId}`}>
            <Button size="sm" variant="default">
              <RotateCcw className="mr-1 h-4 w-4" />
              Resume
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}

function CounterChip({
  label,
  created,
  failed,
}: {
  label: string
  created: number
  failed: number
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-medium tabular-nums">{created}</span>
      <span className="text-muted-foreground">{label} created</span>
      {failed > 0 && (
        <span className="text-red-600 tabular-nums dark:text-red-400">· {failed} failed</span>
      )}
    </span>
  )
}
