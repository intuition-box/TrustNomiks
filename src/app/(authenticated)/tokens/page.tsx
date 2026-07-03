'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageHeader } from '@/components/composite/page-header'
import { StatTile } from '@/components/composite/stat-tile'
import { EmptyState } from '@/components/composite/empty-state'
import { ErrorState } from '@/components/composite/error-state'
import { DataBadge, StatusPill } from '@/components/composite/data-badge'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import { ClusterMeter } from '@/components/patterns/cluster-meter'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { CompareTray, COMPARE_MAX } from '@/components/patterns/compare-tray'
import { cn } from '@/lib/utils'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Hexagon,
  Pencil,
  Plus,
  Search,
} from 'lucide-react'
import type { Token, TokenStats, TokenStatus, SortField, SortDirection } from '@/types/token'

const ITEMS_PER_PAGE = 20
const TARGET_TOKENS = 300

type StatusFilter = TokenStatus | 'all'

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'validated', label: 'Validated' },
]

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Not set'
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TokensPage() {
  return (
    <Suspense fallback={<GraphLoader className="mx-auto mt-24" label="Loading the registry…" />}>
      <TokensRegistry />
    </Suspense>
  )
}

function TokensRegistry() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const initialStatus = (() => {
    const s = searchParams.get('status')
    return s === 'draft' || s === 'in_review' || s === 'validated' ? (s as TokenStatus) : 'all'
  })()

  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>(initialStatus)
  const [sortField, setSortField] = useState<SortField>('completeness')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [compareIds, setCompareIds] = useState<string[]>([])

  const fetchTokens = useCallback(async () => {
    setLoading(true)
    setFetchFailed(false)
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Error fetching tokens:', error)
      setFetchFailed(true)
      setLoading(false)
      return
    }
    setTokens(data ?? [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  const stats: TokenStats = useMemo(
    () => ({
      total: tokens.length,
      validated: tokens.filter((t) => t.status === 'validated').length,
      in_review: tokens.filter((t) => t.status === 'in_review').length,
      draft: tokens.filter((t) => t.status === 'draft').length,
    }),
    [tokens],
  )

  const filteredTokens = useMemo(() => {
    let result = [...tokens]
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.ticker.toLowerCase().includes(q),
      )
    }
    if (status !== 'all') {
      result = result.filter((t) => t.status === status)
    }
    result.sort((a, b) => {
      const rawA = a[sortField]
      const rawB = b[sortField]
      if (rawA == null) return 1
      if (rawB == null) return -1
      const aValue = typeof rawA === 'string' ? rawA.toLowerCase() : rawA
      const bValue = typeof rawB === 'string' ? rawB.toLowerCase() : rawB
      if (sortDirection === 'asc') return aValue > bValue ? 1 : -1
      return aValue < bValue ? 1 : -1
    })
    return result
  }, [tokens, search, status, sortField, sortDirection])

  // Reset paging when the visible set changes shape.
  useEffect(() => {
    setCurrentPage(1)
  }, [search, status, sortField, sortDirection])

  const totalPages = Math.ceil(filteredTokens.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedTokens = filteredTokens.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection(field === 'completeness' || field === 'updated_at' ? 'desc' : 'asc')
    }
  }

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= COMPARE_MAX) return prev
      return [...prev, id]
    })
  }

  const compareTokens = compareIds
    .map((id) => tokens.find((t) => t.id === id))
    .filter((t): t is Token => Boolean(t))
    .map((t) => ({ id: t.id, name: t.name, ticker: t.ticker }))

  const goToToken = (id: string) => router.push(`/tokens/${id}`)

  const SortHeader = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={className}
      aria-sort={sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="inline-flex items-center gap-1 font-medium transition-colors hover:text-foreground"
      >
        {children}
        {sortField !== field ? (
          <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />
        ) : sortDirection === 'asc' ? (
          <ArrowUp className="h-3 w-3 text-primary" aria-hidden />
        ) : (
          <ArrowDown className="h-3 w-3 text-primary" aria-hidden />
        )}
      </button>
    </TableHead>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tokens"
        description="Browse, filter and compare every structured token in the registry."
        actions={
          <Button variant="brand" onClick={() => router.push('/tokens/new')}>
            <Plus className="h-4 w-4" aria-hidden />
            Add token
          </Button>
        }
      />

      {/* KPI rail: each tile is also a status filter */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total tokens"
          value={stats.total}
          hint={`${Math.round((stats.total / TARGET_TOKENS) * 100)}% of the ${TARGET_TOKENS} goal`}
          icon={Hexagon}
          accentVar="--data-hub"
          progress={(stats.total / TARGET_TOKENS) * 100}
          brandProgress
          onClick={() => setStatus('all')}
          className={cn(status === 'all' && 'border-border-strong ring-1 ring-primary/40')}
        />
        <StatTile
          label="Validated"
          value={stats.validated}
          hint="ready to explore & publish"
          icon={CheckCircle2}
          accentVar="--status-validated"
          onClick={() => setStatus('validated')}
          className={cn(status === 'validated' && 'border-border-strong ring-1 ring-primary/40')}
        />
        <StatTile
          label="In review"
          value={stats.in_review}
          hint="under validation"
          icon={Clock}
          accentVar="--status-review"
          onClick={() => setStatus('in_review')}
          className={cn(status === 'in_review' && 'border-border-strong ring-1 ring-primary/40')}
        />
        <StatTile
          label="Drafts"
          value={stats.draft}
          hint="resume to complete"
          icon={FileText}
          accentVar="--status-draft"
          onClick={() => setStatus('draft')}
          className={cn(status === 'draft' && 'border-border-strong ring-1 ring-primary/40')}
        />
      </div>

      {/* The registry */}
      <section className="overflow-hidden rounded-xl border bg-surface-1">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search by name or ticker…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search tokens"
            />
          </div>
          <div
            className="grid grid-cols-4 gap-1 rounded-lg bg-surface-2 p-1 sm:w-auto"
            role="group"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={status === f.value}
                onClick={() => setStatus(f.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm',
                  status === f.value
                    ? 'bg-surface-3 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <GraphLoader className="mx-auto my-16" label="Loading the registry…" />
        ) : fetchFailed ? (
          <ErrorState
            className="m-4"
            title="The registry did not load"
            message="The token list could not be fetched. Your data is safe."
            onRetry={fetchTokens}
          />
        ) : tokens.length === 0 ? (
          <EmptyState
            className="m-4"
            title="No tokens yet"
            description="Structure your first token and watch the graph grow from it."
            actions={
              <Button variant="brand" onClick={() => router.push('/tokens/new')}>
                <Plus className="h-4 w-4" aria-hidden />
                Add your first token
              </Button>
            }
            onboardingHint="Get started: structure your first token"
          />
        ) : filteredTokens.length === 0 ? (
          <EmptyState
            className="m-4"
            title="No tokens match"
            description="Nothing in the registry matches this search and status."
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setStatus('all')
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <SortHeader field="name">Token</SortHeader>
                    <SortHeader field="chain">Chain</SortHeader>
                    <TableHead>Category</TableHead>
                    <SortHeader field="completeness">Completeness</SortHeader>
                    <SortHeader field="status">Status</SortHeader>
                    <SortHeader field="updated_at">Updated</SortHeader>
                    <TableHead>
                      <span className="sr-only">Row actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTokens.map((token) => {
                    const comparing = compareIds.includes(token.id)
                    return (
                      <TableRow
                        key={token.id}
                        onClick={() => goToToken(token.id)}
                        className="group cursor-pointer"
                      >
                        <TableCell className="py-2.5">
                          <span className="flex items-center gap-2.5">
                            <NodeGlyph type="token" size={12} aria-hidden />
                            <span className="min-w-0">
                              <span className="block max-w-[220px] truncate font-medium leading-tight">
                                {token.name}
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">{token.ticker}</span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          {token.chain ? (
                            <DataBadge type="chain" label={token.chain} />
                          ) : (
                            <span className="text-xs text-faint-foreground">Not set</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5">
                          {token.category ? (
                            <DataBadge type="category" label={token.category} />
                          ) : (
                            <span className="text-xs text-faint-foreground">Not set</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <ClusterMeter
                            scores={token.cluster_scores}
                            percent={token.completeness || 0}
                            identityComplete={Boolean(token.name && token.ticker)}
                          />
                        </TableCell>
                        <TableCell className="py-2.5">
                          <StatusPill status={token.status} />
                        </TableCell>
                        <TableCell className="tabular py-2.5 text-xs text-muted-foreground">
                          {formatDate(token.updated_at)}
                        </TableCell>
                        <TableCell className="py-2.5">
                          <span
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => router.push(`/tokens/new?id=${token.id}`)}
                              aria-label={`Edit ${token.name}`}
                              className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-2 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleCompare(token.id)}
                              disabled={!comparing && compareIds.length >= COMPARE_MAX}
                              aria-pressed={comparing}
                              aria-label={
                                comparing
                                  ? `Remove ${token.name} from comparison`
                                  : `Add ${token.name} to comparison`
                              }
                              title={
                                !comparing && compareIds.length >= COMPARE_MAX
                                  ? `Compare up to ${COMPARE_MAX} tokens`
                                  : undefined
                              }
                              className={cn(
                                'rounded-md border px-1.5 py-1 text-xs font-medium transition-colors disabled:opacity-40',
                                comparing
                                  ? 'border-primary/50 bg-primary/10 text-primary'
                                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                              )}
                            >
                              {comparing ? '✓' : '+'}
                            </button>
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y md:hidden">
              {paginatedTokens.map((token) => (
                <li key={token.id}>
                  <button
                    type="button"
                    onClick={() => goToToken(token.id)}
                    className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-2/60"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <NodeGlyph type="token" size={12} aria-hidden />
                        <span className="truncate font-medium">{token.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{token.ticker}</span>
                      </span>
                      <StatusPill status={token.status} />
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <ClusterMeter
                        scores={token.cluster_scores}
                        percent={token.completeness || 0}
                        identityComplete={Boolean(token.name && token.ticker)}
                      />
                      <span className="tabular text-xs text-muted-foreground">
                        {formatDate(token.updated_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {/* Footer strip: meta + paging */}
            <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="tabular text-xs text-muted-foreground">
                {filteredTokens.length} token{filteredTokens.length === 1 ? '' : 's'}
                {totalPages > 1 && (
                  <>
                    {' · '}
                    {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredTokens.length)} shown
                  </>
                )}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                    Previous
                  </Button>
                  <span className="tabular px-1 text-sm">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <CompareTray
        tokens={compareTokens}
        onRemove={(id) => setCompareIds((prev) => prev.filter((x) => x !== id))}
        onClear={() => setCompareIds([])}
      />
    </div>
  )
}
