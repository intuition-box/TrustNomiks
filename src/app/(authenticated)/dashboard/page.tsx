'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  LayoutDashboard,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Search,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Token, TokenStats, TokenFilters, SortField, SortDirection } from '@/types/token'

const ITEMS_PER_PAGE = 20
const TARGET_TOKENS = 300

export default function DashboardPage() {
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
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const router = useRouter()
  const supabase = createClient()

  // Fetch tokens from Supabase
  useEffect(() => {
    fetchTokens()
  }, [])

  // Apply filters and sorting when data or filters change
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

      setTokens(data || [])
      calculateStats(data || [])
    } catch (error) {
      console.error('Error fetching tokens:', error)
      toast.error('Failed to load tokens. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (tokenData: Token[]) => {
    const stats: TokenStats = {
      total: tokenData.length,
      validated: tokenData.filter((t) => t.status === 'validated').length,
      in_review: tokenData.filter((t) => t.status === 'in_review').length,
      draft: tokenData.filter((t) => t.status === 'draft').length,
    }
    setStats(stats)
  }

  const applyFiltersAndSort = () => {
    let result = [...tokens]

    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      result = result.filter(
        (token) =>
          token.name.toLowerCase().includes(searchLower) ||
          token.ticker.toLowerCase().includes(searchLower)
      )
    }

    // Apply status filter
    if (filters.status !== 'all') {
      result = result.filter((token) => token.status === filters.status)
    }

    // Apply sorting
    result.sort((a, b) => {
      let aValue: any = a[sortField]
      let bValue: any = b[sortField]

      // Handle null values
      if (aValue === null) return 1
      if (bValue === null) return -1

      // Convert to string for comparison if needed
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
    setCurrentPage(1) // Reset to first page when filters change
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 opacity-50" />
    return sortDirection === 'asc'
      ? <ArrowUp className="h-4 w-4 text-primary" />
      : <ArrowDown className="h-4 w-4 text-primary" />
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      draft: { variant: 'secondary' as const, label: 'Draft' },
      in_review: { variant: 'default' as const, label: 'In Review' },
      validated: { variant: 'default' as const, label: 'Validated' },
    }

    const config = variants[status as keyof typeof variants] || variants.draft

    return (
      <Badge
        variant={config.variant}
        className={
          status === 'validated'
            ? 'bg-green-500/10 text-green-500 border-green-500/20'
            : status === 'in_review'
            ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
            : ''
        }
      >
        {config.label}
      </Badge>
    )
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

  // Pagination
  const totalPages = Math.ceil(filteredTokens.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedTokens = filteredTokens.slice(startIndex, endIndex)

  const progressPercentage = Math.min(100, Math.round((stats.total / TARGET_TOKENS) * 100))

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

  // Empty state
  if (tokens.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Welcome to TrustNomiks - Token Management Platform
          </p>
        </div>

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Manage and track tokenomics data for your projects
          </p>
        </div>
        <Button onClick={() => router.push('/tokens/new')} size="lg" className="w-full sm:w-auto">
          <Plus className="mr-2 h-5 w-5" />
          Add Token
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Out of {TARGET_TOKENS} target
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Validated</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.validated}</div>
            <p className="text-xs text-muted-foreground mt-1">Ready for export</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.in_review}</div>
            <p className="text-xs text-muted-foreground mt-1">Under validation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drafts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
            <p className="text-xs text-muted-foreground mt-1">To complete</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Overall Progress</span>
              <span className="text-muted-foreground">
                {stats.total}/{TARGET_TOKENS} tokens ({progressPercentage}%)
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ticker..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filters.status === 'all' ? 'default' : 'outline'}
                onClick={() => setFilters({ ...filters, status: 'all' })}
                size="sm"
              >
                All
              </Button>
              <Button
                variant={filters.status === 'draft' ? 'default' : 'outline'}
                onClick={() => setFilters({ ...filters, status: 'draft' })}
                size="sm"
              >
                Drafts
              </Button>
              <Button
                variant={filters.status === 'in_review' ? 'default' : 'outline'}
                onClick={() => setFilters({ ...filters, status: 'in_review' })}
                size="sm"
              >
                In Review
              </Button>
              <Button
                variant={filters.status === 'validated' ? 'default' : 'outline'}
                onClick={() => setFilters({ ...filters, status: 'validated' })}
                size="sm"
              >
                Validated
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Table */}
        <CardContent>
          {filteredTokens.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No tokens match your search criteria
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:text-foreground"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-2">
                        Token
                        <SortIcon field="name" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:text-foreground"
                      onClick={() => handleSort('chain')}
                    >
                      <div className="flex items-center gap-2">
                        Chain
                        <SortIcon field="chain" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:text-foreground"
                      onClick={() => handleSort('completeness')}
                    >
                      <div className="flex items-center gap-2">
                        Completeness
                        <SortIcon field="completeness" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:text-foreground"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-2">
                        Status
                        <SortIcon field="status" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:text-foreground"
                      onClick={() => handleSort('created_at')}
                    >
                      <div className="flex items-center gap-2">
                        Created
                        <SortIcon field="created_at" />
                      </div>
                    </TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTokens.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{token.name}</div>
                          <div className="text-sm text-muted-foreground">{token.ticker}</div>
                        </div>
                      </TableCell>
                      <TableCell>{token.chain || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(100, token.completeness || 0)} className="h-2 w-16" />
                          <span className="text-sm text-muted-foreground">
                            {token.completeness || 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(token.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(token.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {token.completeness < 100 && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => router.push(`/tokens/new?id=${token.id}`)}
                            >
                              Continue
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/tokens/${token.id}`)}
                          >
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground sm:order-1">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredTokens.length)}{' '}
                    of {filteredTokens.length} tokens
                  </p>
                  <div className="flex flex-wrap items-center gap-2 sm:order-2 sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
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
