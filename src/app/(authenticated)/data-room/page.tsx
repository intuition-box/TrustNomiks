'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/composite/page-header'
import { EmptyState } from '@/components/composite/empty-state'
import { ErrorState } from '@/components/composite/error-state'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { TokenSelectorCard } from '@/features/data-room/token-selector-card'
import { TokenWorkspace, type TokenWorkspaceData } from '@/features/data-room/token-workspace'
import { CompareBoard } from '@/features/data-room/compare-board'
import { fetchWorkspaceData, type DataRoomTokenListItem } from '@/features/data-room/fetch-workspace'
import { hasAnyVisualAsset } from '@/lib/utils/asset-readiness'
import { CATEGORY_OPTIONS } from '@/types/form'
import { COMPARE_MAX } from '@/components/patterns/compare-tray'

export default function DataRoomPage() {
  return (
    <Suspense fallback={<GraphLoader className="mx-auto mt-24" label="Opening the data room…" />}>
      <DataRoom />
    </Suspense>
  )
}

function DataRoom() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const compareIds = useMemo(
    () =>
      (searchParams.get('compare') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, COMPARE_MAX),
    [searchParams],
  )
  const compareMode = compareIds.length >= 2

  const [tokens, setTokens] = useState<DataRoomTokenListItem[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listFailed, setListFailed] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('token'))
  const [workspaceData, setWorkspaceData] = useState<TokenWorkspaceData | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceFailed, setWorkspaceFailed] = useState(false)
  const [cache, setCache] = useState<Record<string, TokenWorkspaceData>>({})

  const [compareData, setCompareData] = useState<TokenWorkspaceData[] | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareFailed, setCompareFailed] = useState(false)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [chainFilter, setChainFilter] = useState<string>('all')

  const fetchTokens = useCallback(async () => {
    setListLoading(true)
    setListFailed(false)
    const { data, error } = await supabase
      .from('tokens')
      .select(
        'id, name, ticker, chain, coingecko_id, coingecko_image, tge_date, category, status, completeness, cluster_scores'
      )
      .order('name', { ascending: true })
    if (error) {
      console.error('Error fetching tokens:', error)
      setListFailed(true)
      setListLoading(false)
      return
    }
    setTokens(data || [])
    setListLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchTokens()
  }, [fetchTokens])

  // Single-token workspace fetch
  const fetchTokenDetail = useCallback(
    async (tokenId: string) => {
      if (cache[tokenId]) {
        setWorkspaceData(cache[tokenId])
        return
      }
      const token = tokens.find((t) => t.id === tokenId)
      if (!token) return
      setWorkspaceLoading(true)
      setWorkspaceFailed(false)
      try {
        const wsData = await fetchWorkspaceData(supabase, token)
        setWorkspaceData(wsData)
        setCache((prev) => ({ ...prev, [tokenId]: wsData }))
      } catch (error) {
        console.error('Error fetching token detail:', error)
        setWorkspaceFailed(true)
      } finally {
        setWorkspaceLoading(false)
      }
    },
    [tokens, cache, supabase]
  )

  // Deep-linked ?token= selection once the list arrives
  useEffect(() => {
    if (!compareMode && selectedId && tokens.length > 0 && !workspaceData && !workspaceLoading) {
      fetchTokenDetail(selectedId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, selectedId, compareMode])

  // Compare mode fetch
  useEffect(() => {
    if (!compareMode || tokens.length === 0) return
    let cancelled = false
    const run = async () => {
      setCompareLoading(true)
      setCompareFailed(false)
      try {
        const targets = compareIds
          .map((id) => tokens.find((t) => t.id === id))
          .filter((t): t is DataRoomTokenListItem => Boolean(t))
        const results = await Promise.all(
          targets.map((t) => cache[t.id] ?? fetchWorkspaceData(supabase, t))
        )
        if (cancelled) return
        setCompareData(results)
        setCache((prev) => {
          const next = { ...prev }
          results.forEach((r) => {
            next[r.id] = r
          })
          return next
        })
      } catch (error) {
        console.error('Error fetching comparison data:', error)
        if (!cancelled) setCompareFailed(true)
      } finally {
        if (!cancelled) setCompareLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode, compareIds.join(','), tokens])

  const handleSelectToken = (tokenId: string) => {
    setSelectedId(tokenId)
    const params = new URLSearchParams(window.location.search)
    params.set('token', tokenId)
    params.delete('compare')
    router.replace(`?${params.toString()}`, { scroll: false })
    fetchTokenDetail(tokenId)
  }

  const updateCompare = (ids: string[]) => {
    const params = new URLSearchParams(window.location.search)
    if (ids.length >= 2) {
      params.set('compare', ids.join(','))
    } else {
      params.delete('compare')
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const chains = [...new Set(tokens.map((t) => t.chain).filter(Boolean))] as string[]

  const filteredTokens = tokens.filter((t) => {
    if (search) {
      const q = search.toLowerCase()
      if (!t.name.toLowerCase().includes(q) && !t.ticker.toLowerCase().includes(q)) return false
    }
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    if (chainFilter !== 'all' && t.chain !== chainFilter) return false
    return true
  })

  const readyCount = tokens.filter((t) => hasAnyVisualAsset(t.cluster_scores, t.coingecko_id)).length

  if (listLoading) {
    return <GraphLoader className="mx-auto mt-24" label="Opening the data room…" />
  }

  if (listFailed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Data Room" description="Visualize and compare structured tokenomics." />
        <ErrorState
          title="The data room did not load"
          message="The token list could not be fetched. Your data is safe."
          onRetry={fetchTokens}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Room"
        description={
          compareMode
            ? `Comparing ${compareIds.length} tokens side by side.`
            : 'Visualize and compare structured tokenomics.'
        }
        meta={
          <p className="tabular text-xs text-muted-foreground">
            {tokens.length} tokens · {readyCount} with charts ready
          </p>
        }
        actions={
          compareMode ? (
            <Button variant="outline" onClick={() => updateCompare([])}>
              Exit comparison
            </Button>
          ) : undefined
        }
      />

      {compareMode ? (
        compareLoading ? (
          <GraphLoader className="mx-auto my-16" label="Lining the tokens up…" />
        ) : compareFailed ? (
          <ErrorState
            title="The comparison did not load"
            message="One of the selected tokens could not be fetched."
            onRetry={() => updateCompare(compareIds)}
          />
        ) : compareData && compareData.length >= 2 ? (
          <CompareBoard
            tokens={compareData}
            onRemove={(id) => updateCompare(compareIds.filter((x) => x !== id))}
          />
        ) : (
          <EmptyState
            title="Not enough tokens to compare"
            description="Pick at least two tokens from the registry's compare tray."
            actions={
              <Button variant="outline" onClick={() => router.push('/tokens')}>
                Open the registry
              </Button>
            }
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
          {/* Left rail: every token, thin ones included */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                placeholder="Search tokens…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
                aria-label="Search tokens"
              />
            </div>

            <div className="flex gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-8 flex-1 text-xs">
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

              <Select value={chainFilter} onValueChange={setChainFilter} disabled={chains.length <= 1}>
                <SelectTrigger className="h-8 flex-1 text-xs">
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
            </div>

            <div className="min-h-0 max-h-[calc(100vh-260px)] flex-1 space-y-1.5 overflow-y-auto pr-1">
              {filteredTokens.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No tokens match these filters.
                </div>
              ) : (
                filteredTokens.map((token) => (
                  <TokenSelectorCard
                    key={token.id}
                    token={token}
                    ready={hasAnyVisualAsset(token.cluster_scores, token.coingecko_id)}
                    selected={selectedId === token.id}
                    onClick={() => handleSelectToken(token.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Workspace */}
          <div className="min-h-[500px]">
            {!selectedId ? (
              <EmptyState
                className="h-full"
                title="Pick a token to explore"
                description="Its allocation breakdown, supply composition and unlock timeline render instantly from the structured data."
                onboardingHint="Compare tokens from the registry: select 2 to 4 with the + buttons"
              />
            ) : workspaceLoading ? (
              <div className="space-y-4">
                <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
                <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
                <div className="h-64 animate-pulse rounded-lg bg-surface-2" />
                <div className="h-64 animate-pulse rounded-lg bg-surface-2" />
              </div>
            ) : workspaceFailed ? (
              <ErrorState
                title="This token's charts did not load"
                message="Its data could not be fetched. Your data is safe."
                onRetry={() => selectedId && fetchTokenDetail(selectedId)}
              />
            ) : workspaceData ? (
              <TokenWorkspace token={workspaceData} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
