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
  Clock
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
import { toast } from 'sonner'

interface TokenData {
  id: string
  name: string
  ticker: string
  chain: string | null
  contract_address: string | null
  tge_date: string | null
  category: string | null
  status: string
  completeness: number
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
    hatch_percentage: number
    start_date: string | null
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
    source_type: string
    document_name: string
    url: string
    version: string | null
    verified_at: string | null
  }>
}

export default function TokenDetailPage() {
  const [token, setToken] = useState<TokenData | null>(null)
  const [loading, setLoading] = useState(true)
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
          hatch_percentage,
          start_date,
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

      setToken({
        ...tokenData,
        supply_metrics: supplyData || null,
        allocation_segments: allocData || [],
        vesting_schedules: vestingData || [],
        emission_models: emissionData || null,
        data_sources: sourcesData || [],
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
          hatch_percentage: v.hatch_percentage,
          start_date: v.start_date,
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
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight">{token.name}</h1>
            <span className="text-2xl font-mono text-primary">{token.ticker}</span>
            {getStatusBadge(token.status)}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {token.chain && <span>Chain: {token.chain}</span>}
            <span>•</span>
            <span>Created {formatDate(token.created_at)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={() => router.push(`/tokens/${token.id}/edit`)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Completeness Score */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Completeness Score</span>
              <span className="text-sm text-muted-foreground">{token.completeness}%</span>
            </div>
            <Progress value={token.completeness} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Identity Section */}
      <Card>
        <CardHeader>
          <CardTitle>Token Identity</CardTitle>
          <CardDescription>Basic information about the token</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Contract Address</p>
              <p className="text-sm font-mono mt-1">{token.contract_address || '—'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">TGE Date</p>
              <p className="text-sm mt-1">{formatDate(token.tge_date)}</p>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Category</p>
            <p className="text-sm mt-1 capitalize">{token.category?.replace('_', ' ') || '—'}</p>
          </div>
          {token.notes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <p className="text-sm mt-1 text-muted-foreground">{token.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Supply Metrics */}
      {token.supply_metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Supply Metrics</CardTitle>
            <CardDescription>Token supply and circulation data</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6">
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
        <Card>
          <CardHeader>
            <CardTitle>Token Allocations</CardTitle>
            <CardDescription>Distribution breakdown across segments</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Stacked Bar */}
            <div className="space-y-2">
              <div className="flex h-8 w-full overflow-hidden rounded-lg border">
                {token.allocation_segments.map((segment, index) => (
                  <div
                    key={segment.id}
                    className={`${getSegmentColor(index)} flex items-center justify-center text-xs font-medium text-white`}
                    style={{ width: `${segment.percentage}%` }}
                    title={`${segment.label}: ${segment.percentage}%`}
                  >
                    {segment.percentage > 5 && `${segment.percentage}%`}
                  </div>
                ))}
              </div>
            </div>

            {/* Segments List */}
            <div className="space-y-3">
              {token.allocation_segments.map((segment, index) => (
                <div key={segment.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded ${getSegmentColor(index)}`} />
                    <div>
                      <p className="font-medium">{segment.label}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {segment.segment_type.replace('_', ' ')}
                      </p>
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
        <Card>
          <CardHeader>
            <CardTitle>Vesting Schedules</CardTitle>
            <CardDescription>Unlock schedules for each allocation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {token.vesting_schedules.map((schedule, index) => (
              <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <Clock className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">{schedule.allocation.label}</p>
                  {schedule.frequency === 'immediate' ? (
                    <p className="text-sm text-muted-foreground mt-1">
                      100% unlocked immediately at TGE
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      {schedule.hatch_percentage > 0 && `${schedule.hatch_percentage}% at TGE, then `}
                      {schedule.cliff_months > 0 && `${schedule.cliff_months}m cliff → `}
                      {schedule.duration_months}m {schedule.frequency} vesting
                      {schedule.start_date && ` starting ${formatDate(schedule.start_date)}`}
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
        <Card>
          <CardHeader>
            <CardTitle>Emission Model</CardTitle>
            <CardDescription>Token economics and inflation mechanics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
        <Card>
          <CardHeader>
            <CardTitle>Data Sources</CardTitle>
            <CardDescription>References and documentation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {token.data_sources.map((source, index) => (
              <div key={index} className="flex items-start justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">
                      {source.source_type.replace('_', ' ')}
                    </Badge>
                    <p className="font-medium">{source.document_name}</p>
                    {source.version && (
                      <span className="text-xs text-muted-foreground">v{source.version}</span>
                    )}
                  </div>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    {source.url.length > 60 ? `${source.url.slice(0, 60)}...` : source.url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {source.verified_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Verified {formatDate(source.verified_at)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Manage token status and data</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
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
