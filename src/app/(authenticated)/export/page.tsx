'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { PageHeader } from '@/components/composite/page-header'
import { EmptyState } from '@/components/composite/empty-state'
import { ErrorState } from '@/components/composite/error-state'
import { WalletGate } from '@/components/composite/wallet-gate'
import { RoleGate } from '@/components/composite/role-gate'
import { DataBadge } from '@/components/composite/data-badge'
import { ClusterMeter } from '@/components/patterns/cluster-meter'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import { GraphLoader } from '@/components/patterns/graph-loader'
import { ArrowRight, Download, FileJson, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  convertMultipleTokensToTriples,
  downloadTriplesAsJSON,
  type Triple,
  type CompleteTokenData,
} from '@/lib/utils/triples-export'
import { MyExportsBlock } from '@/components/intuition/my-exports-block'
import type { ClusterScores } from '@/lib/utils/completeness'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'

interface TokenSummary {
  id: string
  name: string
  ticker: string
  chain?: string
  status: string
  completeness: number
  cluster_scores: ClusterScores | null
  created_at: string
  updated_at: string
}

/** Classify a triple into its data family so the review reads in taxonomy colors.
 *  Specific families first: "percentage Of Max Supply" is allocation, not supply. */
function tripleFamily(predicate: string): NodeType {
  const p = predicate.toLowerCase()
  if (/vesting|cliff|duration|tge percentage|start date/.test(p))
    return 'vesting'
  if (/allocation|segment|percentage|token amount|wallet address|label/.test(p))
    return 'allocation'
  if (/emission|inflation|burn|buyback/.test(p)) return 'emission'
  if (/source|document|url|verified/.test(p)) return 'data_source'
  if (/risk|severity|flag/.test(p)) return 'risk_flag'
  return 'token'
}

const FAMILY_ORDER: NodeType[] = [
  'token',
  'allocation',
  'vesting',
  'emission',
  'data_source',
  'risk_flag',
]

const FAMILY_TITLES: Partial<Record<NodeType, string>> = {
  token: 'Identity & supply',
  allocation: 'Allocations',
  vesting: 'Vesting',
  emission: 'Emission',
  data_source: 'Sources & provenance',
  risk_flag: 'Risk flags',
}

function formatObject(object: Triple['object']): string {
  if (typeof object === 'object') return JSON.stringify(object)
  return String(object)
}

type ExportTab = 'pipeline' | 'runs'

export default function ExportPage() {
  const supabase = createClient()

  const [tab, setTab] = useState<ExportTab>('pipeline')
  const [tokens, setTokens] = useState<TokenSummary[]>([])
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(
    new Set(),
  )
  const [loading, setLoading] = useState(true)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [generatedTriples, setGeneratedTriples] = useState<Triple[]>([])
  const [showRaw, setShowRaw] = useState(false)

  const fetchTokens = async () => {
    setLoading(true)
    setFetchFailed(false)
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('status', 'validated')
      .order('name', { ascending: true })
    if (error) {
      console.error('Error fetching tokens:', error)
      setFetchFailed(true)
      setLoading(false)
      return
    }
    setTokens(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchTokens()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetPreview = () => {
    setGeneratedTriples([])
    setShowRaw(false)
  }

  const toggleToken = (tokenId: string) => {
    const newSelected = new Set(selectedTokenIds)
    if (newSelected.has(tokenId)) {
      newSelected.delete(tokenId)
    } else {
      newSelected.add(tokenId)
    }
    setSelectedTokenIds(newSelected)
    resetPreview()
  }

  const allSelected =
    tokens.length > 0 && selectedTokenIds.size === tokens.length

  const toggleAll = () => {
    setSelectedTokenIds(
      allSelected ? new Set() : new Set(tokens.map((t) => t.id)),
    )
    resetPreview()
  }

  // Fetch complete data for selected tokens
  const fetchCompleteTokenData = async (
    tokenId: string,
  ): Promise<CompleteTokenData | null> => {
    try {
      // Token must be fetched first (gate on existence)
      const { data: tokenData, error: tokenError } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', tokenId)
        .single()

      if (tokenError || !tokenData) return null

      // Fetch all independent related data in parallel
      const [
        supplyResult,
        allocResult,
        emissionResult,
        sourcesResult,
        riskResult,
      ] = await Promise.all([
        supabase
          .from('supply_metrics')
          .select('*')
          .eq('token_id', tokenId)
          .maybeSingle(),
        supabase
          .from('allocation_segments')
          .select('*')
          .eq('token_id', tokenId)
          .order('percentage', { ascending: false }),
        supabase
          .from('emission_models')
          .select('*')
          .eq('token_id', tokenId)
          .maybeSingle(),
        supabase.from('data_sources').select('*').eq('token_id', tokenId),
        supabase.from('risk_flags').select('*').eq('token_id', tokenId),
      ])

      const allocationIds =
        allocResult.data?.map((a: { id: string }) => a.id) || []

      // Vesting needs allocation IDs; claim_sources is independent but grouped here for clarity
      const [vestingResult, claimSourcesResult] = await Promise.all([
        supabase
          .from('vesting_schedules')
          .select(
            `
            *,
            allocation:allocation_segments!vesting_schedules_allocation_id_fkey(id, label, segment_type)
          `,
          )
          .in('allocation_id', allocationIds.length > 0 ? allocationIds : ['']),
        supabase.from('claim_sources').select('*').eq('token_id', tokenId),
      ])

      return {
        token: tokenData,
        supply: supplyResult.data || undefined,
        allocations: allocResult.data || [],
        vesting: vestingResult.data || [],
        emission: emissionResult.data || undefined,
        sources: sourcesResult.data || [],
        risk_flags: riskResult.data || [],
        claim_sources: claimSourcesResult.data || [],
      }
    } catch (err) {
      console.error(`Error fetching data for token ${tokenId}:`, err)
      return null
    }
  }

  // Generate triples for selected tokens (batched parallel fetch)
  const generateTriples = async () => {
    if (selectedTokenIds.size === 0) return

    setExporting(true)
    try {
      const tokenIds = Array.from(selectedTokenIds)
      const BATCH_SIZE = 5
      const selectedTokensData: CompleteTokenData[] = []

      for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
        const batch = tokenIds.slice(i, i + BATCH_SIZE)
        const results = await Promise.all(
          batch.map((id) => fetchCompleteTokenData(id)),
        )
        for (const result of results) {
          if (result) selectedTokensData.push(result)
        }
      }

      const triples = convertMultipleTokensToTriples(selectedTokensData)
      setGeneratedTriples(triples)
      toast.success(`${triples.length} triples ready to review`)
    } catch (err) {
      console.error('Error generating triples:', err)
      toast.error('Failed to generate triples')
    } finally {
      setExporting(false)
    }
  }

  const handleDownload = () => {
    if (generatedTriples.length === 0) return
    const timestamp = new Date().toISOString().split('T')[0]
    downloadTriplesAsJSON(
      generatedTriples,
      `trustnomiks-export-${timestamp}.json`,
    )
  }

  const groupedTriples = useMemo(() => {
    const groups = new Map<NodeType, Triple[]>()
    generatedTriples.forEach((triple) => {
      const family = tripleFamily(triple.predicate)
      const list = groups.get(family) ?? []
      list.push(triple)
      groups.set(family, list)
    })
    return FAMILY_ORDER.filter((f) => groups.has(f)).map((f) => ({
      family: f,
      triples: groups.get(f)!,
    }))
  }, [generatedTriples])

  const selectedTokens = tokens.filter((t) => selectedTokenIds.has(t.id))
  const fileSizeKb =
    generatedTriples.length > 0
      ? JSON.stringify(generatedTriples).length / 1024
      : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Publish & Export"
        description="One selection, two deliveries: download JSON triples, or light the graph up on-chain."
        actions={
          <div
            className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1"
            role="tablist"
            aria-label="Export views"
          >
            {(['pipeline', 'runs'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                  tab === t
                    ? 'bg-surface-3 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'pipeline' ? 'Pipeline' : 'Runs'}
              </button>
            ))}
          </div>
        }
      />

      {tab === 'runs' ? (
        <MyExportsBlock />
      ) : (
        <>
          {/* Step 1 · Select */}
          <section className="overflow-hidden rounded-xl border bg-surface-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">
                  <span className="text-faint-foreground">1 ·</span> Select
                  validated tokens
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Only validated tokens can leave the workshop.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="tabular text-xs text-muted-foreground">
                  {selectedTokenIds.size} of {tokens.length} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAll}
                  disabled={tokens.length === 0}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </Button>
              </div>
            </div>

            {loading ? (
              <GraphLoader
                className="mx-auto my-12"
                label="Loading validated tokens…"
              />
            ) : fetchFailed ? (
              <ErrorState
                className="m-4"
                title="The token list did not load"
                message="Validated tokens could not be fetched. Your data is safe."
                onRetry={fetchTokens}
              />
            ) : tokens.length === 0 ? (
              <EmptyState
                className="m-4"
                title="Nothing validated yet"
                description="Validate a token from its detail page and it will appear here, ready to publish or export."
                actions={
                  <Button variant="outline" asChild>
                    <Link href="/tokens">Open the registry</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="max-h-96 divide-y overflow-y-auto">
                {tokens.map((token) => (
                  <li
                    key={token.id}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60"
                  >
                    <Checkbox
                      id={token.id}
                      checked={selectedTokenIds.has(token.id)}
                      onCheckedChange={() => toggleToken(token.id)}
                    />
                    <label
                      htmlFor={token.id}
                      className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <NodeGlyph type="token" size={11} aria-hidden />
                        <span className="truncate font-medium">
                          {token.name}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {token.ticker}
                        </span>
                      </span>
                      {token.chain && (
                        <DataBadge type="chain" label={token.chain} />
                      )}
                      <ClusterMeter
                        className="ml-auto"
                        scores={token.cluster_scores}
                        percent={token.completeness || 0}
                        identityComplete={Boolean(token.name && token.ticker)}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Step 2 · Review */}
          <section className="overflow-hidden rounded-xl border bg-surface-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">
                  <span className="text-faint-foreground">2 ·</span> Review the
                  claims
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Every fact becomes a subject · predicate · object triple,
                  readable before it ships.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {generatedTriples.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowRaw((v) => !v)}
                    className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  >
                    {showRaw ? 'Readable view' : 'Raw JSON'}
                  </button>
                )}
                <Button
                  size="sm"
                  onClick={generateTriples}
                  disabled={selectedTokenIds.size === 0 || exporting}
                >
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <FileJson className="h-4 w-4" aria-hidden />
                  )}
                  {generatedTriples.length > 0
                    ? 'Regenerate'
                    : 'Generate triples'}
                </Button>
              </div>
            </div>

            {generatedTriples.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                {selectedTokenIds.size === 0
                  ? 'Select at least one token above, then generate its triples.'
                  : 'Generate the triples to review them here.'}
              </p>
            ) : showRaw ? (
              <div className="p-4">
                <div className="max-h-96 overflow-auto rounded-lg bg-surface-2 p-4">
                  <pre className="font-mono text-xs">
                    {JSON.stringify(generatedTriples, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="max-h-[480px] space-y-4 overflow-y-auto p-4">
                {groupedTriples.map((group) => (
                  <div key={group.family}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-faint-foreground">
                      <NodeGlyph type={group.family} size={10} aria-hidden />
                      {FAMILY_TITLES[group.family]}
                      <span className="tabular normal-case tracking-normal">
                        · {group.triples.length}
                      </span>
                    </p>
                    <ul className="space-y-0.5">
                      {group.triples.slice(0, 50).map((triple, i) => (
                        <li
                          key={i}
                          className="flex flex-wrap items-baseline gap-x-2 rounded px-2 py-1 text-xs odd:bg-surface-2/50"
                        >
                          <span className="font-medium">{triple.subject}</span>
                          <span className="text-muted-foreground">
                            {triple.predicate}
                          </span>
                          <span className="tabular break-all font-mono">
                            {formatObject(triple.object)}
                          </span>
                        </li>
                      ))}
                      {group.triples.length > 50 && (
                        <li className="tabular px-2 py-1 text-[11px] text-faint-foreground">
                          +{group.triples.length - 50} more in the file
                        </li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {generatedTriples.length > 0 && (
              <p className="tabular border-t px-5 py-2.5 text-xs text-muted-foreground">
                {generatedTriples.length} triples · {selectedTokenIds.size}{' '}
                token{selectedTokenIds.size === 1 ? '' : 's'} ·{' '}
                {fileSizeKb.toFixed(1)} KB
              </p>
            )}
          </section>

          {/* Step 3 · Deliver */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-xl border bg-surface-1 p-5">
              <h2 className="text-sm font-semibold">
                <span className="text-faint-foreground">3a ·</span> Download
                JSON
              </h2>
              <p className="text-sm text-muted-foreground">
                Machine-readable triples for pipelines, agents and analysis. No
                wallet involved.
              </p>
              <Button
                className="mt-auto w-fit"
                onClick={handleDownload}
                disabled={generatedTriples.length === 0}
              >
                <Download className="h-4 w-4" aria-hidden />
                Download JSON
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border bg-surface-1 p-5">
              <h2 className="text-sm font-semibold">
                <span className="text-faint-foreground">3b ·</span> Publish
                on-chain
              </h2>
              <RoleGate
                title="Link a wallet to publish"
                reason="Publishing writes atoms and triples on-chain from your wallet, one token at a time, from its publish panel."
              >
                <WalletGate
                  title="Connect to publish"
                  reason="Publishing writes atoms and triples on-chain from your wallet, one token at a time, from its publish panel."
                >
                  {selectedTokens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Select tokens above, then open each one&apos;s publish
                      panel.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selectedTokens.slice(0, 6).map((token) => (
                        <li key={token.id}>
                          <Link
                            href={`/tokens/${token.id}`}
                            className="group flex items-center justify-between gap-2 rounded-md border bg-surface-2/60 px-3 py-2 text-sm transition-colors hover:bg-surface-2"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <NodeGlyph type="token" size={11} aria-hidden />
                              <span className="truncate">{token.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {token.ticker}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                              Open publish panel
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          </Link>
                        </li>
                      ))}
                      {selectedTokens.length > 6 && (
                        <li className="tabular text-xs text-faint-foreground">
                          +{selectedTokens.length - 6} more selected
                        </li>
                      )}
                    </ul>
                  )}
                </WalletGate>
              </RoleGate>
            </div>
          </section>

          {/* Rail credit, demoted to a footnote */}
          <details className="rounded-lg border border-dashed bg-surface-1 px-4 py-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer select-none text-xs font-medium">
              About the triples format
            </summary>
            <div className="mt-2 space-y-2">
              <p>
                Each fact ships as a subject · predicate · object triple, the
                shape the Intuition knowledge graph ingests. It keeps every
                claim machine-readable and verifiable.
              </p>
              <p className="rounded bg-surface-2 p-2 font-mono text-xs">
                {
                  '{ "subject": "ETH", "predicate": "has Max Supply", "object": "120000000" }'
                }
              </p>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
