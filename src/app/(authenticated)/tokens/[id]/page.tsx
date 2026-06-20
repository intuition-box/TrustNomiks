'use client'

import { useEffect, useMemo, useState } from 'react'
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
  ChevronDown,
  Plus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
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
import {
  computeVestingTimeline,
  type AllocationWithVesting,
} from '@/lib/utils/vesting-timeline'
import { cn } from '@/lib/utils'
import {
  formatCategoryLabel,
  formatSectorLabel,
  formatSegmentTypeLabel,
  formatRiskFlagTypeLabel,
  getRiskFlagTypeDescription,
  normalizeRiskSeverity,
  normalizeVestingFrequency,
} from '@/types/form'
import { toast } from 'sonner'
import { TokenPriceCard } from '@/components/token-price-card'
import { PublishPanel } from '@/components/intuition/publish-panel'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import { SectionCard } from '@/components/composite/section-card'
import { DataBadge, StatusPill, RiskPill, type TokenStatus } from '@/components/composite/data-badge'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import { EmptyState } from '@/components/composite/empty-state'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { LiveGraph, type LiveGraphData } from '@/components/brand/live-graph'
import { AllocationDonutChart } from '@/components/charts/allocation-donut-chart'
import { UnlockTimelineChart } from '@/components/charts/unlock-timeline-chart'

interface TokenData {
  id: string
  name: string
  ticker: string
  chain: string | null
  contract_address: string | null
  coingecko_id: string | null
  coingecko_image: string | null
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
  risk_flags: Array<{
    id: string
    flag_type: string
    severity: string
    is_flagged: boolean
    justification: string | null
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
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [enrichOpen, setEnrichOpen] = useState(false)
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()

  useEffect(() => {
    if (params.id) {
      fetchTokenData(params.id as string)
    }
  }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

      // Fetch risk flags
      const { data: riskFlagsData } = await supabase
        .from('risk_flags')
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
        risk_flags: riskFlagsData || [],
        claim_sources: (claimSourcesData || []) as TokenData['claim_sources'],
      })
    } catch (error: unknown) {
      console.error('Error fetching token:', error)
      toast.error('Failed to load token data')
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (value: string | number | null) => {
    if (!value) return 'Not set'
    const num = value.toString().replace(/,/g, '')
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not set'
    return format(new Date(dateString), 'PPP')
  }

  const STATUS_RANK: Record<string, number> = { draft: 0, in_review: 1, validated: 2 }

  const handleStatusSelect = (newStatus: string) => {
    if (!token) return
    const currentRank = STATUS_RANK[token.status] ?? 0
    const newRank = STATUS_RANK[newStatus] ?? 0
    if (newRank < currentRank) {
      setPendingStatus(newStatus)
    } else {
      handleStatusChange(newStatus)
    }
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
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
          completeness: token.completeness,
          created_at: token.created_at,
          updated_at: token.created_at,
        },
        supply: token.supply_metrics || undefined,
        allocations: token.allocation_segments,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DB row shape from joined query
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- complex triples-export type
        sources: token.data_sources as any,
        risk_flags: token.risk_flags,
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
        return alloc ? `Vesting · ${alloc.label}` : 'Vesting'
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
      'text-blue-600 dark:text-blue-400',
      'text-purple-600 dark:text-purple-400',
      'text-pink-600 dark:text-pink-400',
      'text-orange-600 dark:text-orange-400',
      'text-green-600 dark:text-green-400',
      'text-teal-600 dark:text-teal-400',
      'text-indigo-600 dark:text-indigo-400',
      'text-red-600 dark:text-red-400',
      'text-yellow-600 dark:text-yellow-400',
      'text-cyan-600 dark:text-cyan-400',
    ]
    return colors[index % colors.length]
  }

  // ── Local knowledge-graph: center token + real sub-entities ────────────────
  const graphData: LiveGraphData | null = useMemo(() => {
    if (!token) return null
    const nodes: LiveGraphData['nodes'] = [
      { id: 'token', type: 'token', label: token.ticker || token.name, size: 7 },
    ]
    const links: LiveGraphData['links'] = []

    if (token.chain) {
      nodes.push({ id: 'chain', type: 'chain', label: token.chain, size: 4 })
      links.push({ source: 'token', target: 'chain' })
    }
    token.allocation_segments.forEach((seg) => {
      const id = `alloc-${seg.id}`
      nodes.push({ id, type: 'allocation', label: seg.label, size: 4 })
      links.push({ source: 'token', target: id })
    })
    token.vesting_schedules.forEach((v, i) => {
      const id = `vesting-${v.allocation_id}-${i}`
      nodes.push({ id, type: 'vesting', label: v.allocation.label, size: 3.5 })
      // link vesting to its allocation node when present, else to the token
      const allocId = `alloc-${v.allocation_id}`
      links.push({
        source: nodes.some((n) => n.id === allocId) ? allocId : 'token',
        target: id,
      })
    })
    if (token.emission_models) {
      nodes.push({ id: 'emission', type: 'emission', label: 'Emission', size: 4 })
      links.push({ source: 'token', target: 'emission' })
    }
    token.data_sources.forEach((src) => {
      const id = `source-${src.id}`
      nodes.push({ id, type: 'data_source', label: src.document_name, size: 3.5 })
      links.push({ source: 'token', target: id })
    })
    token.risk_flags.forEach((flag) => {
      const id = `risk-${flag.id}`
      nodes.push({ id, type: 'risk_flag', label: formatRiskFlagTypeLabel(flag.flag_type), size: 3.5 })
      links.push({ source: 'token', target: id })
    })

    return { nodes, links }
  }, [token])

  // ── Vesting unlock timeline (re-housed chart) ──────────────────────────────
  const vestingResult = useMemo(() => {
    if (!token) return null
    const maxSupply = Number((token.supply_metrics?.max_supply ?? '').toString().replace(/,/g, '')) || 0
    if (maxSupply <= 0 || token.vesting_schedules.length === 0) return null

    const allocationsWithVesting: AllocationWithVesting[] = token.allocation_segments.map((alloc) => {
      const vesting = token.vesting_schedules.find((v) => v.allocation_id === alloc.id)
      return {
        label: alloc.label,
        segment_type: alloc.segment_type,
        percentage: alloc.percentage,
        token_amount:
          Number((alloc.token_amount ?? '').toString().replace(/,/g, '')) ||
          (alloc.percentage / 100) * maxSupply,
        vesting: vesting
          ? {
              cliff_months: vesting.cliff_months,
              duration_months: vesting.duration_months,
              frequency: vesting.frequency,
              tge_percentage: vesting.tge_percentage,
              cliff_unlock_percentage: vesting.cliff_unlock_percentage,
            }
          : null,
      }
    })

    return computeVestingTimeline({
      allocations: allocationsWithVesting,
      maxSupply,
      tgeDate: token.tge_date,
    })
  }, [token])

  const vestingSegmentInfos = useMemo(() => {
    if (!vestingResult) return []
    return vestingResult.segmentKeys
      .filter((sk) => !vestingResult.customSegments.includes(sk.key))
      .map((sk) => ({ label: sk.key, segment_type: sk.segment_type }))
  }, [vestingResult])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <GraphLoader label="Loading token…" />
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

  const maxSupplyNum =
    Number((token.supply_metrics?.max_supply ?? '').toString().replace(/,/g, '')) || 0
  const riskSeverity = (s: string): 'low' | 'med' | 'high' => {
    const sev = normalizeRiskSeverity(s)
    return sev === 'medium' ? 'med' : sev
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-16">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push('/dashboard')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </button>

      {/* ── Identity header ─────────────────────────────────────────────── */}
      <header className="overflow-hidden rounded-xl border bg-surface-1">
        <div className="flex flex-col gap-5 p-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {token.coingecko_image ? (
                <img
                  src={token.coingecko_image}
                  alt={token.name}
                  className="h-9 w-9 rounded-full"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : (
                <NodeGlyph type="token" size={20} withGlow />
              )}
              <h1 className="text-3xl font-bold tracking-tight">{token.name}</h1>
              <span className="font-mono text-2xl text-data-token">{token.ticker}</span>
              <StatusPill status={(token.status as TokenStatus)} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {token.chain && <DataBadge type="chain" label={token.chain} />}
              {token.category && (
                <DataBadge type="category" label={formatCategoryLabel(token.category)} />
              )}
              {token.sector && (
                <DataBadge type="sector" label={formatSectorLabel(token.sector)} />
              )}
            </div>

            {/* Completeness bar */}
            <div className="max-w-md space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Completeness</span>
                <span className="tabular font-semibold">{token.completeness}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.min(100, token.completeness)}%`, background: 'var(--gradient-brand)' }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Select onValueChange={handleStatusSelect} value={token.status}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Change status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="validated">Validated</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => router.push(`/tokens/new?id=${token.id}`)}>
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>

            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>

            {/* Delete (existing AlertDialog flow) */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon" aria-label="Delete token">
                  <Trash2 className="h-4 w-4" />
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
          </div>
        </div>
      </header>

      {/* ── Two-column body ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* LEFT, sticky graph + publish */}
        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          {/* Local knowledge graph */}
          <div className="overflow-hidden rounded-xl border bg-surface-1">
            <div className="flex items-center gap-2.5 border-b px-5 py-4">
              <NodeGlyph type="token" size={14} />
              <div>
                <h2 className="text-base font-semibold leading-tight">Knowledge graph</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {token.ticker} and its sourced sub-entities
                </p>
              </div>
            </div>
            <div className="h-[360px] w-full bg-surface-2/40">
              {graphData && <LiveGraph mode="local" data={graphData} />}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t px-5 py-3">
              {([
                ['token', 'Token'],
                ['allocation', 'Allocation'],
                ['vesting', 'Vesting'],
                ['emission', 'Emission'],
                ['data_source', 'Source'],
                ['risk_flag', 'Risk'],
                ['chain', 'Chain'],
              ] as Array<[NodeType, string]>).map(([type, label]) => (
                <span key={type} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <NodeGlyph type={type} size={10} />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Publish, first-class card */}
          {(token.status === 'validated' || token.status === 'in_review') && (
            <PublishPanel tokenId={token.id} tokenStatus={token.status} />
          )}
        </div>

        {/* RIGHT, data sections */}
        <div className="space-y-6">
          {/* Market data */}
          <TokenPriceCard coingeckoId={token.coingecko_id} tokenId={token.id} />

          {/* Identity details */}
          <SectionCard
            title="Identity"
            accent="token"
            description="Core token information"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Contract address</p>
                <p className="mt-1 break-all font-mono text-sm">{token.contract_address || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">TGE date</p>
                <p className="mt-1 text-sm">{formatDate(token.tge_date)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Category</p>
                <p className="mt-1 text-sm">{token.category ? formatCategoryLabel(token.category) : 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Sector</p>
                <p className="mt-1 text-sm">{token.sector ? formatSectorLabel(token.sector) : 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Created</p>
                <p className="mt-1 text-sm">{formatDate(token.created_at)}</p>
              </div>
            </div>
            {token.notes && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground">Notes</p>
                <p className="mt-1 text-sm text-muted-foreground">{token.notes}</p>
              </div>
            )}
            <ClaimSourceBadges claimType="token_identity" />
          </SectionCard>

          {/* Supply, core */}
          <SectionCard
            title="Supply"
            accent="token"
            description="Token supply and circulation data"
          >
            {token.supply_metrics ? (
              <>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Max supply</p>
                    <p className="tabular mt-1 font-mono text-2xl font-semibold">
                      {formatNumber(token.supply_metrics.max_supply)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Initial supply</p>
                    <p className="tabular mt-1 font-mono text-2xl font-semibold">
                      {formatNumber(token.supply_metrics.initial_supply)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">TGE supply</p>
                    <p className="tabular mt-1 font-mono text-2xl font-semibold">
                      {formatNumber(token.supply_metrics.tge_supply)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Circulating supply</p>
                    <p className="tabular mt-1 font-mono text-2xl font-semibold">
                      {formatNumber(token.supply_metrics.circulating_supply)}
                    </p>
                    {token.supply_metrics.circulating_date && (
                      <p className="mt-1 text-xs text-faint-foreground">
                        As of {formatDate(token.supply_metrics.circulating_date)}
                      </p>
                    )}
                  </div>
                </div>
                <ClaimSourceBadges claimType="supply_metrics" />
              </>
            ) : (
              <EmptyState
                title="No supply data yet"
                description="Max supply, initial supply and circulation are missing for this token."
                onboardingHint="Contribute it via the token form (step 2, Supply)."
                actions={
                  <Button variant="outline" onClick={() => router.push(`/tokens/new?id=${token.id}`)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Contribute it
                  </Button>
                }
              />
            )}
          </SectionCard>

          {/* Allocation, core */}
          <SectionCard
            title="Allocation"
            accent="allocation"
            description="Distribution breakdown across segments"
          >
            {token.allocation_segments.length > 0 ? (
              <div className="space-y-6">
                {/* Donut + interactive stacked bar */}
                <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
                  <div className="shrink-0">
                    <AllocationDonutChart
                      segments={token.allocation_segments}
                      maxSupply={token.supply_metrics?.max_supply ?? null}
                      size="sm"
                    />
                  </div>

                  <div className="w-full space-y-1">
                    {/* Stacked bar */}
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

                    {/* Percentage labels below bar */}
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

                    {/* Info strip */}
                    <div className="flex h-6 items-center pl-0.5">
                      {hoveredAllocationIndex !== null && (
                        <div className="flex items-center gap-2">
                          <div className={cn('h-2 w-2 shrink-0 rounded-full', getSegmentColor(hoveredAllocationIndex))} />
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
                </div>

                {/* Segments table */}
                <div className="space-y-2">
                  {token.allocation_segments.map((segment, index) => (
                    <div
                      key={segment.id}
                      className={cn(
                        'flex flex-col gap-3 rounded-lg bg-surface-2 p-3 sm:flex-row sm:items-center sm:justify-between',
                        'cursor-default transition-all duration-75',
                        hoveredAllocationIndex === index && 'ring-1 ring-border-strong',
                        hoveredAllocationIndex !== null && hoveredAllocationIndex !== index && 'opacity-40'
                      )}
                      onMouseEnter={() => setHoveredAllocationIndex(index)}
                      onMouseLeave={() => setHoveredAllocationIndex(null)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn('h-3 w-3 shrink-0 rounded-full', getSegmentColor(index))} />
                        <div>
                          <p className="font-medium">{segment.label}</p>
                          <p className="text-xs capitalize text-muted-foreground">
                            {formatSegmentTypeLabel(segment.segment_type)}
                          </p>
                          <ClaimSourceBadges claimType="allocation_segment" claimId={segment.id} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="tabular font-semibold">{segment.percentage}%</p>
                        <p className="tabular font-mono text-xs text-muted-foreground">
                          {formatNumber(segment.token_amount)} tokens
                        </p>
                        {segment.wallet_address && (
                          <p className="mt-1 font-mono text-xs text-faint-foreground">
                            {segment.wallet_address.slice(0, 6)}...{segment.wallet_address.slice(-4)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                title="No allocation data yet"
                description="The distribution breakdown across segments has not been recorded."
                onboardingHint="Contribute it via the token form (step 3, Allocations)."
                actions={
                  <Button variant="outline" onClick={() => router.push(`/tokens/new?id=${token.id}`)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Contribute it
                  </Button>
                }
              />
            )}
          </SectionCard>

          {/* ── Enrich toggle ────────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setEnrichOpen((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed bg-surface-1 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            aria-expanded={enrichOpen}
          >
            {enrichOpen ? 'Hide enrichment' : 'Enrich'}
            <ChevronDown className={cn('h-4 w-4 transition-transform', enrichOpen && 'rotate-180')} />
          </button>

          {enrichOpen && (
            <div className="space-y-6">
              {/* Vesting */}
              <SectionCard
                title="Vesting"
                accent="vesting"
                description="Unlock schedules for each allocation"
              >
                {token.vesting_schedules.length > 0 ? (
                  <div className="space-y-5">
                    {vestingResult && vestingSegmentInfos.length > 0 && maxSupplyNum > 0 && (
                      <UnlockTimelineChart
                        data={vestingResult.timeline}
                        segments={vestingSegmentInfos}
                        maxSupply={maxSupplyNum}
                        customSegments={vestingResult.customSegments}
                        height={280}
                      />
                    )}
                    <div className="space-y-3">
                      {token.vesting_schedules.map((schedule, index) => (
                        <div key={index} className="flex items-start gap-3 rounded-lg bg-surface-2 p-3">
                          <NodeGlyph type="vesting" size={16} className="mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium">{schedule.allocation.label}</p>
                            <ClaimSourceBadges claimType="vesting_schedule" claimId={schedule.allocation_id} />
                            {schedule.frequency === 'immediate' ? (
                              <p className="mt-1 text-sm text-muted-foreground">
                                100% unlocked immediately at TGE
                              </p>
                            ) : (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {schedule.tge_percentage > 0 && `${schedule.tge_percentage}% at TGE`}
                                {schedule.cliff_months > 0 && `${schedule.tge_percentage > 0 ? ', then ' : ''}${schedule.cliff_months}m cliff`}
                                {schedule.cliff_unlock_percentage > 0 && ` (${schedule.cliff_unlock_percentage}% released at cliff end)`}
                                {schedule.duration_months > 0 && ` → ${schedule.duration_months}m ${schedule.frequency} vesting`}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No vesting schedules yet"
                    description="Unlock schedules per allocation segment have not been recorded."
                    onboardingHint="Contribute it via the token form (step 4, Vesting)."
                    actions={
                      <Button variant="outline" onClick={() => router.push(`/tokens/new?id=${token.id}`)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Contribute it
                      </Button>
                    }
                  />
                )}
              </SectionCard>

              {/* Emission */}
              <SectionCard
                title="Emission"
                accent="emission"
                description="Token economics and inflation mechanics"
              >
                {token.emission_models ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Emission type</p>
                        <p className="mt-1 text-lg font-semibold capitalize">
                          {token.emission_models.type.replace('_', ' ')}
                        </p>
                      </div>
                      {token.emission_models.annual_inflation_rate != null && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Annual inflation rate</p>
                          <p className="tabular mt-1 text-lg font-semibold">
                            {token.emission_models.annual_inflation_rate}%
                          </p>
                        </div>
                      )}
                    </div>

                    {token.emission_models.has_burn && (
                      <div className="rounded-lg border border-orange-500/20 bg-orange-100 p-3 dark:bg-orange-500/10">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="mt-0.5 h-5 w-5 text-orange-500" />
                          <div>
                            <p className="font-medium text-orange-500">Burn mechanism active</p>
                            {token.emission_models.burn_details && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {token.emission_models.burn_details}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {token.emission_models.has_buyback && (
                      <div className="rounded-lg border border-blue-500/20 bg-blue-100 p-3 dark:bg-blue-500/10">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 text-blue-500" />
                          <div>
                            <p className="font-medium text-blue-500">Buyback program active</p>
                            {token.emission_models.buyback_details && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {token.emission_models.buyback_details}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <ClaimSourceBadges claimType="emission_model" />
                  </div>
                ) : (
                  <EmptyState
                    title="No emission model yet"
                    description="Inflation, burn and buyback mechanics have not been recorded."
                    onboardingHint="Contribute it via the token form (step 5, Emission)."
                    actions={
                      <Button variant="outline" onClick={() => router.push(`/tokens/new?id=${token.id}`)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Contribute it
                      </Button>
                    }
                  />
                )}
              </SectionCard>

              {/* Sources / Provenance */}
              <SectionCard
                title="Sources"
                accent="data_source"
                description="References and provenance"
              >
                {token.data_sources.length > 0 ? (
                  <div className="space-y-3">
                    {token.data_sources.map((source, index) => {
                      const claims = getSourceClaims(source.id)
                      return (
                        <div key={index} className="space-y-2 rounded-lg bg-surface-2 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <DataBadge type="data_source" label={source.source_type.replace('_', ' ')} emphasis="outline" />
                            <p className="font-medium">{source.document_name}</p>
                            {source.version && (
                              <span className="text-xs text-faint-foreground">v{source.version}</span>
                            )}
                          </div>

                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 break-all font-mono text-sm text-primary hover:underline"
                          >
                            {source.url.length > 60 ? `${source.url.slice(0, 60)}...` : source.url}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>

                          {(source.verified_at || claims.length > 0) && (
                            <div className="space-y-2 border-t border-border/40 pt-2">
                              {source.verified_at && (
                                <p className="text-xs text-faint-foreground">
                                  Verified {formatDate(source.verified_at)}
                                </p>
                              )}
                              {claims.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="shrink-0 text-xs text-muted-foreground">Used for:</span>
                                  {claims.map((cs, i) => (
                                    <span
                                      key={i}
                                      className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary"
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
                  </div>
                ) : (
                  <EmptyState
                    title="No sources yet"
                    description="No reference documents have been attached to this token."
                    onboardingHint="Contribute it via the token form (step 6, Sources)."
                    actions={
                      <Button variant="outline" onClick={() => router.push(`/tokens/new?id=${token.id}`)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Contribute it
                      </Button>
                    }
                  />
                )}
              </SectionCard>

              {/* Risk flags */}
              <SectionCard
                title="Risk flags"
                accent="risk_flag"
                description="Risk signals identified for this token"
              >
                {token.risk_flags.length > 0 ? (
                  <div className="space-y-3">
                    {token.risk_flags.map((flag) => {
                      const description = getRiskFlagTypeDescription(flag.flag_type)
                      return (
                        <div key={flag.id} className="space-y-2 rounded-lg bg-surface-2 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <RiskPill severity={riskSeverity(flag.severity)} />
                            <p className="font-medium">{formatRiskFlagTypeLabel(flag.flag_type)}</p>
                            {!flag.is_flagged && (
                              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                                Cleared
                              </span>
                            )}
                          </div>
                          {description && (
                            <p className="text-xs text-muted-foreground">{description}</p>
                          )}
                          {flag.justification && (
                            <div className="border-t border-border/40 pt-2">
                              <p className="text-xs font-medium text-muted-foreground">Justification</p>
                              <p className="mt-0.5 text-sm">{flag.justification}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No risk flags recorded"
                    description="No risk signals have been identified for this token."
                    onboardingHint="Add a flag via the token form to surface a risk."
                    actions={
                      <Button variant="outline" onClick={() => router.push(`/tokens/new?id=${token.id}`)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Contribute it
                      </Button>
                    }
                  />
                )}
              </SectionCard>
            </div>
          )}
        </div>
      </div>

      {/* Downgrade confirmation (existing pendingStatus flow) */}
      <AlertDialog open={!!pendingStatus} onOpenChange={(open) => { if (!open) setPendingStatus(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade token status?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to change the status of {token?.name} ({token?.ticker}) from &quot;{token?.status?.replace('_', ' ')}&quot; to &quot;{pendingStatus?.replace('_', ' ')}&quot;. This may require re-validation later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingStatus) { handleStatusChange(pendingStatus); setPendingStatus(null) } }}>
              Confirm Downgrade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
