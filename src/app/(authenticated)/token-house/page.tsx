'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, Building2, BarChart2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TokenSelectorCard } from '@/components/token-house/token-selector-card'
import { TokenWorkspace, type TokenWorkspaceData } from '@/components/token-house/token-workspace'
import { computeAssetReadiness, hasAnyVisualAsset } from '@/lib/utils/asset-readiness'
import { CATEGORY_OPTIONS } from '@/types/form'
import { normalizeVestingFrequency } from '@/types/form'
import type { ClusterScores } from '@/lib/utils/completeness'
import { toast } from 'sonner'

interface TokenListItem {
  id: string
  name: string
  ticker: string
  chain: string | null
  coingecko_id: string | null
  coingecko_image: string | null
  tge_date: string | null
  category: string | null
  status: string
  completeness: number
  cluster_scores: ClusterScores | null
}

export default function TokenHousePage() {
  const [tokens, setTokens] = useState<TokenListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [workspaceData, setWorkspaceData] = useState<TokenWorkspaceData | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [cache, setCache] = useState<Record<string, TokenWorkspaceData>>({})

  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [chainFilter, setChainFilter] = useState<string>('all')

  const supabase = createClient()

  // Fetch token list
  useEffect(() => {
    async function fetchTokens() {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('tokens')
          .select(
            'id, name, ticker, chain, coingecko_id, coingecko_image, tge_date, category, status, completeness, cluster_scores'
          )
          .order('name', { ascending: true })

        if (error) throw error
        setTokens(data || [])
      } catch (error) {
        console.error('Error fetching tokens:', error)
        toast.error('Failed to load tokens')
      } finally {
        setLoading(false)
      }
    }
    fetchTokens()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch detailed data when a token is selected
  const fetchTokenDetail = useCallback(
    async (tokenId: string) => {
      // Check cache first
      if (cache[tokenId]) {
        setWorkspaceData(cache[tokenId])
        return
      }

      try {
        setWorkspaceLoading(true)
        const token = tokens.find((t) => t.id === tokenId)
        if (!token) return

        const [supplyRes, allocRes, emissionRes] = await Promise.all([
          supabase
            .from('supply_metrics')
            .select('max_supply, initial_supply, tge_supply, circulating_supply')
            .eq('token_id', tokenId)
            .single(),
          supabase
            .from('allocation_segments')
            .select('id, segment_type, label, percentage, token_amount')
            .eq('token_id', tokenId)
            .order('percentage', { ascending: false }),
          supabase
            .from('emission_models')
            .select('type, annual_inflation_rate, has_burn, has_buyback')
            .eq('token_id', tokenId)
            .single(),
        ])

        // Fetch vesting schedules for allocations
        const allocationIds = allocRes.data?.map((a) => a.id) || []
        let vestingData: TokenWorkspaceData['vesting_schedules'] = []
        if (allocationIds.length > 0) {
          const { data } = await supabase
            .from('vesting_schedules')
            .select(
              'allocation_id, cliff_months, duration_months, frequency, tge_percentage, cliff_unlock_percentage'
            )
            .in('allocation_id', allocationIds)

          vestingData = (data || []).map((v) => ({
            ...v,
            frequency: normalizeVestingFrequency(v.frequency),
          }))
        }

        const wsData: TokenWorkspaceData = {
          id: token.id,
          name: token.name,
          ticker: token.ticker,
          chain: token.chain,
          coingecko_id: token.coingecko_id,
          coingecko_image: token.coingecko_image,
          tge_date: token.tge_date,
          status: token.status,
          cluster_scores: token.cluster_scores,
          supply_metrics: supplyRes.data || null,
          allocation_segments: allocRes.data || [],
          vesting_schedules: vestingData,
          emission_models: emissionRes.data || null,
        }

        setWorkspaceData(wsData)
        setCache((prev) => ({ ...prev, [tokenId]: wsData }))
      } catch (error) {
        console.error('Error fetching token detail:', error)
        toast.error('Failed to load token details')
      } finally {
        setWorkspaceLoading(false)
      }
    },
    [tokens, cache, supabase]
  )

  const handleSelectToken = (tokenId: string) => {
    setSelectedId(tokenId)
    fetchTokenDetail(tokenId)
  }

  // Derive unique chains for filter
  const chains = [...new Set(tokens.map((t) => t.chain).filter(Boolean))] as string[]

  // Filter tokens
  const filteredTokens = tokens.filter((t) => {
    // Must have at least one visual asset
    if (!hasAnyVisualAsset(t.cluster_scores, t.coingecko_id)) return false

    // Search filter
    if (search) {
      const q = search.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.ticker.toLowerCase().includes(q)) return false
    }

    // Category filter
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false

    // Chain filter
    if (chainFilter !== 'all' && t.chain !== chainFilter) return false

    return true
  })

  const readyCount = tokens.filter((t) =>
    hasAnyVisualAsset(t.cluster_scores, t.coingecko_id)
  ).length

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Token House</h1>
          <p className="text-muted-foreground mt-2">Loading tokens...</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
          <div className="h-96 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Building2 className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Token House</h1>
        </div>
        <p className="text-muted-foreground mt-1">
          Visual explorer for tokenomics data.{' '}
          <span className="font-medium text-foreground">{readyCount}</span> token
          {readyCount !== 1 ? 's' : ''} with visual assets.
        </p>
      </div>

      {/* Split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* Left Rail */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-6 lg:self-start">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tokens..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {chains.length > 1 && (
              <Select value={chainFilter} onValueChange={setChainFilter}>
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue placeholder="Chain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All chains</SelectItem>
                  {chains.sort().map((chain) => (
                    <SelectItem key={chain} value={chain}>
                      {chain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Token list */}
          <div className="space-y-1.5 flex-1 min-h-0 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
            {filteredTokens.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No tokens match your filters.
              </div>
            ) : (
              filteredTokens.map((token) => (
                <TokenSelectorCard
                  key={token.id}
                  token={token}
                  assets={computeAssetReadiness(token.cluster_scores, token.coingecko_id)}
                  selected={selectedId === token.id}
                  onClick={() => handleSelectToken(token.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Main Workspace */}
        <div className="min-h-[500px]">
          {!selectedId ? (
            <Card className="h-full border-dashed">
              <CardContent className="h-full flex flex-col items-center justify-center py-20 text-center">
                <BarChart2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">
                  Select a token to explore
                </h3>
                <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                  Choose a token from the list to visualize its allocation breakdown, supply
                  composition, and unlock timeline.
                </p>
              </CardContent>
            </Card>
          ) : workspaceLoading ? (
            <div className="space-y-4">
              <div className="h-12 bg-muted animate-pulse rounded-lg" />
              <div className="h-24 bg-muted animate-pulse rounded-lg" />
              <div className="h-64 bg-muted animate-pulse rounded-lg" />
              <div className="h-64 bg-muted animate-pulse rounded-lg" />
            </div>
          ) : workspaceData ? (
            <TokenWorkspace token={workspaceData} />
          ) : null}
        </div>
      </div>
    </div>
  )
}
