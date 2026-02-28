'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import {
  ArrowLeft,
  Edit,
  Trash2,
  Download,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Tag,
  BarChart2,
  PieChart,
  TrendingUp,
  Database,
  Settings2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { convertTokenToTriples, downloadTriplesAsJSON } from '@/lib/utils/triples-export'
import { CLUSTER_LABELS, CLUSTER_MAX } from '@/lib/utils/completeness'
import type { ClusterScores } from '@/lib/utils/completeness'
import { cn } from '@/lib/utils'
import {
  formatCategoryLabel,
  formatSectorLabel,
  formatSegmentTypeLabel,
  normalizeVestingFrequency,
} from '@/types/form'
import { toast } from 'sonner'

interface TokenData {
  id: string
  name: string
  ticker: string
  chain: string | null
  contract_address: string | null
  tge_date: string | null
  category: string | null
  sector: string | null
  status: string
  completeness: number
  cluster_scores: { identity: number; supply: number; allocation: number; vesting: number } | null
  notes: string | null
  created_at: string
  supply_metrics: {
    max_supply: string | null
    initial_supply: string | null
    tge_supply: string | null
    circulating_supply: string | null
    circulating_date: string | null
    source_url: string | null
  } | null
  allocation_segments: Array<{
    id: string
    segment_type: string
    label: string
    percentage: number
    token_amount: string | null
    wallet_address: string | null
  }>
  vesting_schedules: Array<{
    allocation_id: string
    cliff_months: number
    duration_months: number
    frequency: string
    tge_percentage: number
    cliff_unlock_percentage: number
    allocation: {
      label: string
    }
  }>
  emission_models: {
    type: string
    annual_inflation_rate: number | null
    has_burn: boolean
    burn_details: string | null
    has_buyback: boolean
    buyback_details: string | null
    notes: string | null
  } | null
  data_sources: Array<{
    id: string
    source_type: string
    document_name: string
    url: string
    version: string | null
    verified_at: string | null
  }>
  claim_sources: Array<{
    claim_type: string
    claim_id: string | null
    data_source_id: string
    // Supabase returns joined rows as an array even for many-to-one FK joins
    data_source: Array<{
      document_name: string
      source_type: string
      url: string
    }>
  }>
}

export default function TokenDetailPage() {
  const [token, setToken] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredAllocationIndex, setHoveredAllocationIndex] = useState<number | null>(null)
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  useEffect(() => {
    if (params.id) {
      fetchTokenData(params.id as string)
    }
  }, [params.id])

  const fetchTokenData = async (tokenId: string) => {
    try {
      setLoading(true)

      // Fetch token with all related data
      const { data: tokenData, error: tokenError } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', tokenId)
        .single()

      if (tokenError) throw tokenError

      // Fetch supply metrics
      const { data: supplyData } = await supabase
        .from('supply_metrics')
        .select('*')
        .eq('token_id', tokenId)
        .single()

      // Fetch allocations
      const { data: allocData } = await supabase
        .from('allocation_segments')
        .select('*')
        .eq('token_id', tokenId)
        .order('percentage', { ascending: false })

      // Fetch vesting schedules with allocation labels
      const allocationIds = allocData?.map(a => a.id) || []
      const { data: vestingData } = await supabase
        .from('vesting_schedules')
        .select(`
          id,
          allocation_id,
          cliff_months,
          duration_months,
          frequency,
          tge_percentage,
          cliff_unlock_percentage,
          notes,
          allocation:allocation_segments!vesting_schedules_allocation_id_fkey(label)
        `)
        .in('allocation_id', allocationIds)

      // Fetch emission model
      const { data: emissionData } = await supabase
        .from('emission_models')
        .select('*')
        .eq('token_id', tokenId)
        .single()

      // Fetch data sources
      const { data: sourcesData } = await supabase
        .from('data_sources')
        .select('*')
        .eq('token_id', tokenId)

      // Fetch claim_sources (source → claim attribution)
      const { data: claimSourcesData } = await supabase
        .from('claim_sources')
        .select(`
          claim_type,
          claim_id,
          data_source_id,
          data_source:data_sources!claim_sources_data_source_id_fkey(document_name, source_type, url)
        `)
        .eq('token_id', tokenId)

      setToken({
        ...tokenData,
        supply_metrics: supplyData || null,
        allocation_segments: allocData || [],
        vesting_schedules: (vestingData || []).map((schedule) => ({
          ...schedule,
          frequency: normalizeVestingFrequency(schedule.frequency),
        })),
        emission_models: emissionData || null,
        data_sources: sourcesData || [],
        claim_sources: (claimSourcesData || []) as TokenData['claim_sources'],
      })
    } catch (error: any) {
      console.error('Error fetching token:', error)
      toast.error('Failed to load token data')
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (value: string | number | null) => {
    if (!value) return '—'
    const num = value.toString().replace(/,/g, '')
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    return format(new Date(dateString), 'PPP')
  }

  const getStatusBadge = (status: string) => {
    const configs = {
      draft: { label: 'Draft', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
      in_review: { label: 'In Review', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' },
      validated: { label: 'Validated', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
    }
    const config = configs[status as keyof typeof configs] || configs.draft

    return <Badge className={config.className}>{config.label}</Badge>
  }

  const handleStatusChange = async (newStatus: string) => {
    if (!token) return

    try {
      const { error } = await supabase
        .from('tokens')
        .update({ status: newStatus })
        .eq('id', token.id)

      if (error) throw error

      setToken({ ...token, status: newStatus })
      toast.success('Status updated successfully')
    } catch (error: any) {
      console.error('Error updating status:', error)
      toast.error('Failed to update status')
    }
  }

  const handleDelete = async () => {
    if (!token) return

    try {
      const { error } = await supabase
        .from('tokens')
        .delete()
        .eq('id', token.id)

      if (error) throw error

      toast.success('Token deleted successfully')
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Error deleting token:', error)
      toast.error('Failed to delete token')
    }
  }

  const handleExport = () => {
    if (!token) return

    try {
      // Prepare data in the format expected by convertTokenToTriples
      const completeTokenData = {
        token: {
          id: token.id,
          name: token.name,
          ticker: token.ticker,
          chain: token.chain || undefined,
          contract_address: token.contract_address || undefined,
          tge_date: token.tge_date || undefined,
          category: token.category || undefined,
          sector: token.sector || undefined,
          notes: token.notes || undefined,
          status: token.status,
          completeness_score: token.completeness,
          created_at: token.created_at,
          updated_at: token.created_at,
        },
        supply: token.supply_metrics || undefined,
        allocations: token.allocation_segments,
        vesting: token.vesting_schedules.map((v: any) => ({
          id: v.id,
          allocation_id: v.allocation_id,
          cliff_months: v.cliff_months,
          duration_months: v.duration_months,
          frequency: v.frequency,
          tge_percentage: v.tge_percentage,
          cliff_unlock_percentage: v.cliff_unlock_percentage,
          notes: v.notes,
          allocation: {
            label: v.allocation.label,
            segment_type: token.allocation_segments.find((a) => a.id === v.allocation_id)?.segment_type || '',
          },
        })),
        emission: token.emission_models || undefined,
        sources: token.data_sources as any,
        risk_flags: [],
      }

      // Convert to triples
      const triples = convertTokenToTriples(completeTokenData)

      // Download as JSON
      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `${token.ticker}-triples-${timestamp}.json`
      downloadTriplesAsJSON(triples, filename)

      toast.success(`Exported ${triples.length} triples for ${token.ticker}`)
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Failed to export triples')
    }
  }

  // Returns the sources attributed to a specific claim
  const getClaimSources = (claimType: string, claimId: string | null) =>
    (token?.claim_sources ?? []).filter(
      cs => cs.claim_type === claimType && cs.claim_id === claimId
    )

  // Returns all claims attributed to a specific source (by source id)
  const getSourceClaims = (sourceId: string) =>
    (token?.claim_sources ?? []).filter(cs => cs.data_source_id === sourceId)

  // Returns a human-readable label for a claim
  const getClaimLabel = (claimType: string, claimId: string | null): string => {
    switch (claimType) {
      case 'token_identity': return 'Token Identity'
      case 'supply_metrics':  return 'Supply Metrics'
      case 'emission_model':  return 'Emission Model'
      case 'allocation_segment': {
        const alloc = token?.allocation_segments.find(a => a.id === claimId)
        return alloc ? alloc.label : 'Allocation'
      }
      case 'vesting_schedule': {
        const alloc = token?.allocation_segments.find(a => a.id === claimId)
        return alloc ? `Vesting — ${alloc.label}` : 'Vesting'
      }
      default: return claimType
    }
  }

  // Small inline badge listing attributed sources for a claim
  const ClaimSourceBadges = ({ claimType, claimId }: { claimType: string; claimId?: string | null }) => {
    const sources = getClaimSources(claimType, claimId ?? null)
    if (sources.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {sources.map((cs, i) => {
          // Supabase returns the joined row as a single-element array
          const ds = Array.isArray(cs.data_source) ? cs.data_source[0] : cs.data_source
          if (!ds) return null
          return (
            <a
              key={i}
              href={ds.url}
              target="_blank"
              rel="noopener noreferrer"
              title={ds.document_name}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10 transition-colors"
            >
              {ds.document_name}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )
        })}
      </div>
    )
  }

  const getSegmentColor = (index: number) => {
    const colors = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-orange-500',
      'bg-green-500',
      'bg-teal-500',
      'bg-indigo-500',
      'bg-red-500',
      'bg-yellow-500',
      'bg-cyan-500',
    ]
    return colors[index % colors.length]
  }

  const getSegmentTextColor = (index: number) => {
    const colors = [
      'text-blue-400',
      'text-purple-400',
      'text-pink-400',
      'text-orange-400',
      'text-green-400',
      'text-teal-400',
      'text-indigo-400',
      'text-red-400',
      'text-yellow-400',
      'text-cyan-400',
    ]
    return colors[index % colors.length]
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Loading...</h1>
          <p className="text-muted-foreground mt-2">Fetching token data...</p>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Token Not Found</h1>
          <p className="text-muted-foreground mt-2">The requested token does not exist.</p>
          <Button onClick={() => router.push('/dashboard')} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {/* Header */}
      <Card className="overflow-hidden border-border/70">
        <div className="bg-gradient-to-br from-muted/50 via-muted/20 to-transparent px-6 py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">{token.name}</h1>
                <span className="text-2xl font-mono text-primary">{token.ticker}</span>
                {getStatusBadge(token.status)}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {token.chain && <span>Chain: {token.chain}</span>}
                {token.chain && <span>•</span>}
                <span>Created {formatDate(token.created_at)}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => router.push('/dashboard')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button onClick={() => router.push(`/tokens/new?id=${token.id}`)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Completeness Score */}
      <Card className="border border-indigo-500/30 overflow-hidden shadow-[0_0_30px_rgba(99,102,241,0.15)]">
        <CardHeader className="border-b border-border/50 pb-5 bg-gradient-to-r from-indigo-500/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10">
                <BarChart2 className="h-4 w-4 text-indigo-400" />
              </span>
              <CardTitle className="text-base">Completeness Score</CardTitle>
            </div>
            <span className="text-2xl font-bold text-indigo-400">{token.completeness}%</span>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <Progress value={token.completeness} className="h-2" />
            {/* Cluster badges */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {(Object.keys(CLUSTER_LABELS) as Array<keyof ClusterScores>).map((key) => {
                const scores = token.cluster_scores
                const score = scores?.[key] ?? 0
                const max = CLUSTER_MAX[key]
                const complete = key === 'identity'
                  ? !!(token.name && token.ticker)
                  : score >= max
                const colorMap: Record<keyof ClusterScores, { active: string; dot: string }> = {
                  identity:   { active: 'border-violet-500/50 bg-violet-500/10 text-violet-400',  dot: 'bg-violet-400' },
                  supply:     { active: 'border-sky-500/50 bg-sky-500/10 text-sky-400',           dot: 'bg-sky-400' },
                  allocation: { active: 'border-amber-500/50 bg-amber-500/10 text-amber-400',     dot: 'bg-amber-400' },
                  vesting:    { active: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-400' },
                }
                const colors = colorMap[key]
                return (
                  <div key={key} className="relative group/cluster">
                    <span className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium cursor-default select-none transition-colors',
                      complete ? colors.active : 'border-border/30 text-muted-foreground/50'
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
        </CardContent>
      </Card>

      {/* Identity Section */}
      <Card className="border border-violet-500/30 overflow-hidden shadow-[0_0_30px_rgba(139,92,246,0.15)]">
        <CardHeader className="border-b border-border/50 pb-5 bg-gradient-to-r from-violet-500/5 to-transparent">
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-violet-500/10">
              <Tag className="h-4 w-4 text-violet-400" />
            </span>
            Token Identity
          </CardTitle>
          <CardDescription>Basic information about the token</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Contract Address</p>
              <p className="text-sm font-mono mt-1">{token.contract_address || '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">TGE Date</p>
              <p className="text-sm mt-1">{formatDate(token.tge_date)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Category</p>
              <p className="text-sm mt-1">{token.category ? formatCategoryLabel(token.category) : '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Sector</p>
              <p className="text-sm mt-1">{token.sector ? formatSectorLabel(token.sector) : '—'}</p>
            </div>
          </div>
          {token.notes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <p className="text-sm mt-1 text-muted-foreground">{token.notes}</p>
            </div>
          )}
          <ClaimSourceBadges claimType="token_identity" />
        </CardContent>
      </Card>

      {/* Supply Metrics */}
      {token.supply_metrics && (
        <Card className="border border-sky-500/30 overflow-hidden shadow-[0_0_30px_rgba(14,165,233,0.15)]">
          <CardHeader className="border-b border-border/50 pb-5 bg-gradient-to-r from-sky-500/5 to-transparent">
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-sky-500/10">
                <BarChart2 className="h-4 w-4 text-sky-400" />
              </span>
              Supply Metrics
            </CardTitle>
            <CardDescription>Token supply and circulation data</CardDescription>
            <ClaimSourceBadges claimType="supply_metrics" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-2 pt-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Max Supply</p>
              <p className="text-2xl font-bold mt-1">{formatNumber(token.supply_metrics.max_supply)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Initial Supply</p>
              <p className="text-2xl font-bold mt-1">{formatNumber(token.supply_metrics.initial_supply)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">TGE Supply</p>
              <p className="text-2xl font-bold mt-1">{formatNumber(token.supply_metrics.tge_supply)}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Circulating Supply</p>
              <p className="text-2xl font-bold mt-1">{formatNumber(token.supply_metrics.circulating_supply)}</p>
              {token.supply_metrics.circulating_date && (
                <p className="text-xs text-muted-foreground mt-1">
                  As of {formatDate(token.supply_metrics.circulating_date)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Allocations */}
      {token.allocation_segments.length > 0 && (
        <Card className="border border-indigo-500/30 overflow-hidden shadow-[0_0_30px_rgba(99,102,241,0.15)]">
          <CardHeader className="border-b border-border/50 pb-5 bg-gradient-to-r from-indigo-500/5 to-transparent">
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-500/10">
                <PieChart className="h-4 w-4 text-indigo-400" />
              </span>
              Token Allocations
            </CardTitle>
            <CardDescription>Distribution breakdown across segments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Stacked Bar + Labels + Info strip */}
            <div className="space-y-1">
              {/* Bar */}
              <div className="flex h-6 w-full overflow-hidden rounded-lg border">
                {token.allocation_segments.map((segment, index) => (
                  <div
                    key={segment.id}
                    className={cn(
                      getSegmentColor(index),
                      'cursor-pointer transition-opacity duration-75',
                      hoveredAllocationIndex !== null && hoveredAllocationIndex !== index
                        ? 'opacity-25'
                        : 'opacity-100'
                    )}
                    style={{ width: `${segment.percentage}%` }}
                    onMouseEnter={() => setHoveredAllocationIndex(index)}
                    onMouseLeave={() => setHoveredAllocationIndex(null)}
                  />
                ))}
              </div>

              {/* Percentage labels below bar — one per segment, same widths */}
              <div className="flex w-full">
                {token.allocation_segments.map((segment, index) => (
                  <div
                    key={segment.id}
                    style={{ width: `${segment.percentage}%` }}
                    className={cn(
                      'text-center cursor-pointer transition-opacity duration-75',
                      hoveredAllocationIndex !== null && hoveredAllocationIndex !== index
                        ? 'opacity-25'
                        : 'opacity-100'
                    )}
                    onMouseEnter={() => setHoveredAllocationIndex(index)}
                    onMouseLeave={() => setHoveredAllocationIndex(null)}
                  >
                    {segment.percentage >= 4 && (
                      <span className={cn('text-xs font-semibold tabular-nums', getSegmentTextColor(index))}>
                        {segment.percentage}%
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Info strip — fixed height to avoid layout shift */}
              <div className="h-6 flex items-center pl-0.5">
                {hoveredAllocationIndex !== null && (
                  <div className="flex items-center gap-2">
                    <div className={cn('w-2 h-2 rounded-full shrink-0', getSegmentColor(hoveredAllocationIndex))} />
                    <span className="text-sm font-medium">
                      {token.allocation_segments[hoveredAllocationIndex].label}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {token.allocation_segments[hoveredAllocationIndex].percentage}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Segments List */}
            <div className="space-y-2">
              {token.allocation_segments.map((segment, index) => (
                <div
                  key={segment.id}
                  className={cn(
                    'flex flex-col gap-3 rounded-lg bg-muted p-3 sm:flex-row sm:items-center sm:justify-between',
                    'cursor-default transition-all duration-75',
                    hoveredAllocationIndex === index && 'ring-1 ring-border',
                    hoveredAllocationIndex !== null && hoveredAllocationIndex !== index && 'opacity-40'
                  )}
                  onMouseEnter={() => setHoveredAllocationIndex(index)}
                  onMouseLeave={() => setHoveredAllocationIndex(null)}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('w-3 h-3 rounded-full shrink-0', getSegmentColor(index))} />
                    <div>
                      <p className="font-medium">{segment.label}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {formatSegmentTypeLabel(segment.segment_type)}
                      </p>
                      <ClaimSourceBadges claimType="allocation_segment" claimId={segment.id} />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{segment.percentage}%</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {formatNumber(segment.token_amount)} tokens
                    </p>
                    {segment.wallet_address && (
                      <p className="text-xs text-muted-foreground font-mono mt-1">
                        {segment.wallet_address.slice(0, 6)}...{segment.wallet_address.slice(-4)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Vesting Schedules */}
      {token.vesting_schedules.length > 0 && (
        <Card className="border border-amber-500/30 overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.15)]">
          <CardHeader className="border-b border-border/50 pb-5 bg-gradient-to-r from-amber-500/5 to-transparent">
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-amber-500/10">
                <Clock className="h-4 w-4 text-amber-400" />
              </span>
              Vesting Schedules
            </CardTitle>
            <CardDescription>Unlock schedules for each allocation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {token.vesting_schedules.map((schedule, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <Clock className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">{schedule.allocation.label}</p>
                  <ClaimSourceBadges claimType="vesting_schedule" claimId={schedule.allocation_id} />
                  {schedule.frequency === 'immediate' ? (
                    <p className="text-sm text-muted-foreground mt-1">
                      100% unlocked immediately at TGE
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      {schedule.tge_percentage > 0 && `${schedule.tge_percentage}% at TGE`}
                      {schedule.cliff_months > 0 && `${schedule.tge_percentage > 0 ? ', then ' : ''}${schedule.cliff_months}m cliff`}
                      {schedule.cliff_unlock_percentage > 0 && ` (${schedule.cliff_unlock_percentage}% released at cliff end)`}
                      {schedule.duration_months > 0 && ` → ${schedule.duration_months}m ${schedule.frequency} vesting`}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Emission Model */}
      {token.emission_models && (
        <Card className="border border-emerald-500/30 overflow-hidden shadow-[0_0_30px_rgba(16,185,129,0.15)]">
          <CardHeader className="border-b border-border/50 pb-5 bg-gradient-to-r from-emerald-500/5 to-transparent">
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-emerald-500/10">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
              </span>
              Emission Model
            </CardTitle>
            <CardDescription>Token economics and inflation mechanics</CardDescription>
            <ClaimSourceBadges claimType="emission_model" />
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Emission Type</p>
              <p className="text-lg font-semibold mt-1 capitalize">
                {token.emission_models.type.replace('_', ' ')}
              </p>
            </div>

            {token.emission_models.annual_inflation_rate && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Annual Inflation Rate</p>
                <p className="text-lg font-semibold mt-1">{token.emission_models.annual_inflation_rate}%</p>
              </div>
            )}

            {token.emission_models.has_burn && (
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-500">Burn Mechanism Active</p>
                    {token.emission_models.burn_details && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {token.emission_models.burn_details}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {token.emission_models.has_buyback && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-500">Buyback Program Active</p>
                    {token.emission_models.buyback_details && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {token.emission_models.buyback_details}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Sources */}
      {token.data_sources.length > 0 && (
        <Card className="border border-cyan-500/30 overflow-hidden shadow-[0_0_30px_rgba(6,182,212,0.15)]">
          <CardHeader className="border-b border-border/50 pb-5 bg-gradient-to-r from-cyan-500/5 to-transparent">
            <CardTitle className="flex items-center gap-2.5">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-cyan-500/10">
                <Database className="h-4 w-4 text-cyan-400" />
              </span>
              Data Sources
            </CardTitle>
            <CardDescription>References and documentation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {token.data_sources.map((source, index) => {
              const claims = getSourceClaims(source.id)
              return (
                <div key={index} className="p-3 bg-muted rounded-lg space-y-2">
                  {/* Source header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="capitalize shrink-0">
                      {source.source_type.replace('_', ' ')}
                    </Badge>
                    <p className="font-medium">{source.document_name}</p>
                    {source.version && (
                      <span className="text-xs text-muted-foreground">v{source.version}</span>
                    )}
                  </div>

                  {/* URL */}
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {source.url.length > 60 ? `${source.url.slice(0, 60)}...` : source.url}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>

                  {/* Footer: verified date + claim chips */}
                  {(source.verified_at || claims.length > 0) && (
                    <div className="pt-2 border-t border-border/40 space-y-2">
                      {source.verified_at && (
                        <p className="text-xs text-muted-foreground">
                          Verified {formatDate(source.verified_at)}
                        </p>
                      )}
                      {claims.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-muted-foreground shrink-0">Used for:</span>
                          {claims.map((cs, i) => (
                            <span
                              key={i}
                              className="text-xs rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-primary"
                            >
                              {getClaimLabel(cs.claim_type, cs.claim_id)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card className="border border-rose-500/30 overflow-hidden shadow-[0_0_30px_rgba(244,63,94,0.15)]">
        <CardHeader className="border-b border-border/50 pb-5 bg-gradient-to-r from-rose-500/5 to-transparent">
          <CardTitle className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-7 h-7 rounded-md bg-rose-500/10">
              <Settings2 className="h-4 w-4 text-rose-400" />
            </span>
            Actions
          </CardTitle>
          <CardDescription>Manage token status and data</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 pt-6">
          {/* Change Status */}
          <Select onValueChange={handleStatusChange} defaultValue={token.status}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Change status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="validated">Validated</SelectItem>
            </SelectContent>
          </Select>

          {/* Export */}
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export JSON Triples
          </Button>

          {/* Delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="ml-auto">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Token
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the token
                  <span className="font-semibold"> {token.name} ({token.ticker})</span> and all its associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
