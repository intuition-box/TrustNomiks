'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Edit,
  FileText,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Token, TokenStats, TokenFilters, SortField, SortDirection } from '@/types/token'
import { CLUSTER_LABELS, CLUSTER_MAX } from '@/lib/utils/completeness'
import type { ClusterScores } from '@/lib/utils/completeness'

const ITEMS_PER_PAGE = 20
const TARGET_TOKENS = 300

export default function TokensPage() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [filteredTokens, setFilteredTokens] = useState<Token[]>([])
  const [stats, setStats] = useState<TokenStats>({
    total: 0,
    validated: 0,
    in_review: 0,
    draft: 0,
  })
  const [filters, setFilters] = useState<TokenFilters>({
    search: '',
    status: 'all',
  })
  const [sortField, setSortField] = useState<SortField>('completeness')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    fetchTokens()
  }, [])

  useEffect(() => {
    applyFiltersAndSort()
  }, [tokens, filters, sortField, sortDirection])

  const fetchTokens = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      const tokenData = data || []
      setTokens(tokenData)
      setStats({
        total: tokenData.length,
        validated: tokenData.filter((t) => t.status === 'validated').length,
        in_review: tokenData.filter((t) => t.status === 'in_review').length,
        draft: tokenData.filter((t) => t.status === 'draft').length,
      })
    } catch (error) {
      console.error('Error fetching tokens:', error)
      toast.error('Failed to load tokens. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

  const applyFiltersAndSort = () => {
    let result = [...tokens]

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      result = result.filter(
        (token) =>
          token.name.toLowerCase().includes(searchLower) ||
          token.ticker.toLowerCase().includes(searchLower)
      )
    }

    if (filters.status !== 'all') {
      result = result.filter((token) => token.status === filters.status)
    }

    result.sort((a, b) => {
      let aValue: any = a[sortField]
      let bValue: any = b[sortField]

      if (aValue === null) return 1
      if (bValue === null) return -1

      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase()
        bValue = bValue.toLowerCase()
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    setFilteredTokens(result)
    setCurrentPage(1)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection(field === 'completeness' ? 'desc' : 'asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />
  }

  const getStatusBadge = (status: string) => {
    const configs = {
      draft: { label: 'Draft', className: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
      in_review: { label: 'In Review', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      validated: { label: 'Validated', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    }
    const config = configs[status as keyof typeof configs] || configs.draft
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const getStatusRowStyle = (status: string) => {
    switch (status) {
      case 'validated': return 'border-l-emerald-500/70 border border-emerald-500/20 hover:bg-emerald-500/5'
      case 'in_review': return 'border-l-amber-500/70 border border-amber-500/20 hover:bg-amber-500/5'
      default:          return 'border-l-slate-500/30 border border-border hover:bg-muted/30'
    }
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return '-'
      return date.toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return '-'
    }
  }

  const totalPages = Math.ceil(filteredTokens.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedTokens = filteredTokens.slice(startIndex, endIndex)

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tokens</h1>
          <p className="text-muted-foreground mt-2">Loading...</p>
        </div>
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <div className="space-y-6">
        <Card className="border border-indigo-500/30 overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.12)]">
          <div className="bg-gradient-to-br from-indigo-500/5 via-muted/10 to-transparent px-6 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight">Tokens</h1>
                <p className="text-muted-foreground">Browse and manage all tokenomics entries</p>
              </div>
              <Button onClick={() => router.push('/tokens/new')} size="lg" className="w-full sm:w-auto">
                <Plus className="mr-2 h-5 w-5" />
                Add Token
              </Button>
            </div>
          </div>
        </Card>

        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No tokens yet</h3>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              Get started by adding your first token to structure its tokenomics data
            </p>
            <Button onClick={() => router.push('/tokens/new')} size="lg">
              <Plus className="mr-2 h-5 w-5" />
              Add your first token
            </Button>
          </CardContent>
        </Card>
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
              <h1 className="text-3xl font-bold tracking-tight">Tokens</h1>
              <p className="text-muted-foreground">Browse and manage all tokenomics entries</p>
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

      {/* Token Registry */}
      <Card className="border border-indigo-500/30 overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.12)]">
        <CardHeader className="border-b border-border/50 pb-5 bg-gradient-to-r from-indigo-500/5 to-transparent">
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10">
              <Layers className="h-4 w-4 text-indigo-400" />
            </span>
            Token Registry
          </CardTitle>
          <CardDescription>
            {filteredTokens.length} token{filteredTokens.length !== 1 ? 's' : ''} — search, filter and sort
          </CardDescription>
        </CardHeader>

        {/* Filter Controls */}
        <div className="px-6 py-5 border-b border-border/40 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ticker..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'draft', 'in_review', 'validated'] as const).map((status) => {
              const isActive = filters.status === status
              const config = {
                all:       { label: 'All',       active: 'bg-violet-500/15 border-violet-500/50 text-violet-300',   inactive: 'border-border/40 text-muted-foreground hover:border-violet-500/30 hover:text-violet-400 hover:bg-violet-500/5'  },
                draft:     { label: 'Draft',     active: 'bg-sky-500/15 border-sky-500/50 text-sky-300',            inactive: 'border-border/40 text-muted-foreground hover:border-sky-500/30 hover:text-sky-400 hover:bg-sky-500/5'        },
                in_review: { label: 'In Review', active: 'bg-amber-500/15 border-amber-500/50 text-amber-300',      inactive: 'border-border/40 text-muted-foreground hover:border-amber-500/30 hover:text-amber-400 hover:bg-amber-500/5'    },
                validated: { label: 'Validated', active: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300',inactive: 'border-border/40 text-muted-foreground hover:border-emerald-500/30 hover:text-emerald-400 hover:bg-emerald-500/5'},
              }[status]
              return (
                <button
                  key={status}
                  onClick={() => setFilters({ ...filters, status })}
                  className={cn(
                    'px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                    isActive ? config.active : config.inactive
                  )}
                >
                  {config.label}
                </button>
              )
            })}
          </div>
        </div>

        <CardContent className="p-0">
          {filteredTokens.length === 0 ? (
            <div className="text-center py-16">
              <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground">No tokens match your search criteria</p>
            </div>
          ) : (
            <>
              {/* Sort header */}
              <div className="hidden md:flex items-center gap-4 px-6 py-2.5 border-b border-border/40 text-xs text-muted-foreground">
                <button
                  className="md:w-52 shrink-0 flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                  onClick={() => handleSort('name')}
                >
                  Token <SortIcon field="name" />
                </button>
                <button
                  className="flex-1 flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                  onClick={() => handleSort('completeness')}
                >
                  Completeness <SortIcon field="completeness" />
                </button>
                <button
                  className="w-28 flex items-center gap-1 font-medium hover:text-foreground transition-colors ml-20"
                  onClick={() => handleSort('status')}
                >
                  Status <SortIcon field="status" />
                </button>
                <button
                  className="w-28 flex items-center gap-1 font-medium hover:text-foreground transition-colors"
                  onClick={() => handleSort('created_at')}
                >
                  Created <SortIcon field="created_at" />
                </button>
                <div className="w-36" />
              </div>

              {/* Token rows */}
              <div className="divide-y divide-border/30">
                {paginatedTokens.map((token) => (
                  <div
                    key={token.id}
                    className={cn(
                      'flex flex-col md:flex-row md:items-center gap-4 px-6 py-5 border-l-[3px] transition-colors duration-100',
                      getStatusRowStyle(token.status)
                    )}
                  >
                    {/* Name + ticker + chain */}
                    <div className="md:w-52 shrink-0 min-w-0">
                      <div className="w-fit max-w-full space-y-2 rounded-xl bg-muted/25 px-4 py-3">
                        <p className="font-semibold text-base leading-tight">
                          {token.name}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary bg-primary/10 rounded px-2 py-0.5">
                            {token.ticker}
                          </span>
                          {token.chain && (
                            <span className="text-xs text-muted-foreground bg-muted/50 border border-border/40 rounded px-2 py-0.5">
                              {token.chain}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Completeness */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground md:hidden">Completeness</span>
                        <span className="text-xs font-semibold tabular-nums ml-auto">
                          {token.completeness || 0}%
                        </span>
                      </div>
                      <Progress value={Math.min(100, token.completeness || 0)} className="h-1.5" />
                      {/* Cluster badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(Object.keys(CLUSTER_LABELS) as Array<keyof ClusterScores>).map((key) => {
                          const scores = token.cluster_scores
                          const score = scores?.[key] ?? 0
                          const max = CLUSTER_MAX[key]
                          const complete = key === 'identity'
                            ? !!(token.name && token.ticker)
                            : score >= max
                          const colorMap: Record<keyof ClusterScores, { active: string; dot: string }> = {
                            identity:   { active: 'border-violet-500/20 bg-violet-500/5 text-violet-400/60',   dot: 'bg-violet-400/50' },
                            supply:     { active: 'border-sky-500/20 bg-sky-500/5 text-sky-400/60',            dot: 'bg-sky-400/50' },
                            allocation: { active: 'border-amber-500/20 bg-amber-500/5 text-amber-400/60',      dot: 'bg-amber-400/50' },
                            vesting:    { active: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400/60',dot: 'bg-emerald-400/50' },
                          }
                          const colors = colorMap[key]
                          return (
                            <div key={key} className="relative group/cluster">
                              <span className={cn(
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium cursor-default select-none transition-colors',
                                complete
                                  ? colors.active
                                  : 'border-border/30 text-muted-foreground/50'
                              )}>
                                <span className={cn('w-1.5 h-1.5 rounded-full', complete ? colors.dot : 'bg-muted-foreground/30')} />
                                {CLUSTER_LABELS[key]}
                              </span>
                              {/* Tooltip */}
                              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 opacity-0 group-hover/cluster:opacity-100 transition-opacity duration-150">
                                <div className="bg-popover border border-border/60 rounded-md px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg whitespace-nowrap">
                                  <span className="font-semibold">{CLUSTER_LABELS[key]}</span>
                                  <span className="text-muted-foreground ml-1.5">— {score}/{max} pts</span>
                                </div>
                                <div className="w-2 h-2 bg-popover border-b border-r border-border/60 rotate-45 mx-auto -mt-1" />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Status */}
                    <div className="md:w-28 shrink-0 md:ml-20">
                      {getStatusBadge(token.status)}
                    </div>

                    {/* Created */}
                    <div className="md:w-28 shrink-0">
                      <div className="flex items-center gap-1.5 text-xs bg-muted/40 rounded-md px-2.5 py-1.5 border border-border/30 w-fit">
                        <span className="font-semibold text-foreground/80">{formatDate(token.created_at)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 shrink-0 md:w-36 md:justify-end">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => router.push(`/tokens/new?id=${token.id}`)}
                      >
                        <Edit className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/tokens/${token.id}`)}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-border/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Showing {startIndex + 1}–{Math.min(endIndex, filteredTokens.length)} of {filteredTokens.length} tokens
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm tabular-nums px-2">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
