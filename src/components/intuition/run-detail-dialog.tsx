'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react'
import { GraphCanvas } from '@/components/knowledge-graph/graph-canvas'
import { NODE_CONFIG } from '@/lib/knowledge-graph/node-config'
import { buildRunGraph, type OnChainMeta } from '@/lib/intuition/build-run-graph'
import type { GraphNode, NodeType } from '@/lib/knowledge-graph/graph-types'
import type { KnowledgeGraphResponse } from '@/types/knowledge-graph'
import type { RunDetailResponse } from '@/types/intuition'
import type { PublishStatus, RunStatus } from '@/lib/intuition/types'

interface RunDetailDialogProps {
  runId: string | null
  open: boolean
  onClose: () => void
}

// Status colors — used both as node overrides on the canvas and in the legend.
const STATUS_COLOR: Record<PublishStatus, string> = {
  confirmed: '#10b981', // emerald — matches existing success tone
  failed: '#ef4444', // red
  submitted: '#f59e0b', // amber — in-flight
  pending: '#94a3b8', // slate — not yet touched
}

const RUN_STATUS_VARIANT: Record<RunStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  partial: 'secondary',
  failed: 'destructive',
  running: 'outline',
  pending: 'outline',
}

const INTUITION_HUB_URL = 'https://testnet.hub.intuition.systems/'

export function RunDetailDialog({ runId, open, onClose }: RunDetailDialogProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] overflow-hidden flex flex-col p-0"
      >
        {/* Remounting on runId change resets internal state without having to
            clear it manually from an effect (avoids react-hooks/set-state-in-effect). */}
        {runId ? <RunDetailInner key={runId} runId={runId} /> : <EmptyState />}
      </SheetContent>
    </Sheet>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      No run selected.
    </div>
  )
}

function RunDetailInner({ runId }: { runId: string }) {
  const [data, setData] = useState<RunDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [searchQuery] = useState('')
  const [activeFilters] = useState<NodeType[]>([])
  const [resetKey] = useState(0)

  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })

  // ── Fetch run detail ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    fetch(`/api/intuition/runs/${runId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<RunDetailResponse>
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load run detail')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [runId])

  // ── Build graph from the fetched data ────────────────────────────────────
  const graphResult = useMemo(() => {
    if (!data) return null
    return buildRunGraph({
      run: data.run,
      atomMappings: data.atomMappings,
      claimMappings: data.claimMappings,
      provenanceMappings: data.provenanceMappings,
      canonicalAtoms: data.canonicalAtoms,
      canonicalTriples: data.canonicalTriples,
    })
  }, [data])

  const graphData: KnowledgeGraphResponse | null = useMemo(() => {
    if (!graphResult) return null
    return {
      nodes: graphResult.nodes,
      edges: graphResult.edges,
      meta: {
        totalTokens: 1,
        totalNodes: graphResult.nodes.length,
        totalEdges: graphResult.edges.length,
      },
    }
  }, [graphResult])

  // ── Status-based color override for canvas ──────────────────────────────
  const nodeColor = useCallback((node: GraphNode): string | undefined => {
    const meta = node.metadata?.onChain as OnChainMeta | undefined
    if (!meta) return undefined
    return STATUS_COLOR[meta.status]
  }, [])

  // ── Resize observer for canvas container ────────────────────────────────
  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setCanvasSize({ width: el.clientWidth, height: el.clientHeight })
    })
    observer.observe(el)
    setCanvasSize({ width: el.clientWidth, height: el.clientHeight })
    return () => observer.disconnect()
  }, [data])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <SheetHeader className="border-b p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-xl">
                {data ? (
                  <>
                    <span>{data.run.tokenName}</span>
                    <Badge variant="secondary">{data.run.tokenTicker}</Badge>
                    <Badge variant={RUN_STATUS_VARIANT[data.run.status]}>{data.run.status}</Badge>
                    {data.run.isLegacy && (
                      <Badge variant="outline" className="text-[10px]">legacy</Badge>
                    )}
                  </>
                ) : (
                  <span>{loading ? 'Loading run…' : 'Run detail'}</span>
                )}
              </SheetTitle>
              <SheetDescription className="mt-1 font-mono text-xs break-all">
                {runId}
              </SheetDescription>
            </div>
          </div>

          {/* Status legend + counts */}
          {graphResult && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <StatusLegendItem status="confirmed" />
              <StatusLegendItem status="failed" />
              <StatusLegendItem status="pending" />
              <Separator orientation="vertical" className="mx-2 h-4" />
              <CountsSummary counts={graphResult.counts} />
            </div>
          )}
        </SheetHeader>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-row">
          {/* Graph area */}
          <div ref={canvasContainerRef} className="relative flex-1 overflow-hidden">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="flex max-w-sm items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  {error}
                </div>
              </div>
            )}

            {!loading && !error && graphData && graphData.nodes.length <= 1 && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-sm text-muted-foreground">
                This run has no renderable atoms on-chain yet.
              </div>
            )}

            {graphData && graphData.nodes.length > 1 && canvasSize.width > 0 && canvasSize.height > 0 && (
              <GraphCanvas
                data={graphData}
                width={canvasSize.width}
                height={canvasSize.height}
                onNodeSelect={setSelectedNode}
                selectedNodeId={selectedNode?.id ?? null}
                searchQuery={searchQuery}
                activeFilters={activeFilters}
                resetKey={resetKey}
                nodeColor={nodeColor}
                linkColor="rgba(148, 163, 184, 0.4)"
                linkWidth={1}
              />
            )}

            {/* Explanatory banner: atoms without triples have no on-chain relationships */}
            {graphResult &&
              graphResult.counts.triples.confirmed === 0 &&
              graphResult.counts.atoms.confirmed > 0 && (
                <div className="pointer-events-none absolute left-4 top-4 right-4 max-w-xl rounded-md border border-amber-200 bg-amber-50/95 p-3 text-xs text-amber-900 shadow-sm dark:border-amber-900 dark:bg-amber-950/95 dark:text-amber-100">
                  <p className="font-medium">Only atoms were published</p>
                  <p className="mt-0.5">
                    This run did not create any triples, so the atoms have no on-chain relationships yet.
                    Resume the run from the token page to create the triples and see the full graph structure.
                  </p>
                </div>
              )}
          </div>

          {/* Selection side panel */}
          <div className="w-80 shrink-0 overflow-y-auto border-l p-4">
            {selectedNode ? (
              <NodeDetails node={selectedNode} onClose={() => setSelectedNode(null)} />
            ) : (
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Click a node</p>
                <p className="mt-1">
                  Select any atom, triple, or provenance node to inspect its on-chain status and identifiers.
                </p>
              </div>
            )}
          </div>
        </div>
    </>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatusLegendItem({ status }: { status: PublishStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
      <span className="capitalize">{status}</span>
    </span>
  )
}

function CountsSummary({
  counts,
}: {
  counts: {
    atoms: Record<PublishStatus, number>
    triples: Record<PublishStatus, number>
    provenance: Record<PublishStatus, number>
  }
}) {
  const totalOf = (c: Record<PublishStatus, number>) =>
    c.pending + c.submitted + c.confirmed + c.failed

  const atomsTotal = totalOf(counts.atoms)
  const triplesTotal = totalOf(counts.triples)
  const provTotal = totalOf(counts.provenance)

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      {atomsTotal > 0 && (
        <span>
          <span className="font-medium text-foreground">{counts.atoms.confirmed}</span>/{atomsTotal} atoms
          {counts.atoms.failed > 0 && (
            <span className="ml-1 text-red-500">· {counts.atoms.failed} failed</span>
          )}
        </span>
      )}
      {triplesTotal > 0 && (
        <span>
          <span className="font-medium text-foreground">{counts.triples.confirmed}</span>/{triplesTotal} triples
          {counts.triples.failed > 0 && (
            <span className="ml-1 text-red-500">· {counts.triples.failed} failed</span>
          )}
        </span>
      )}
      {provTotal > 0 && (
        <span>
          <span className="font-medium text-foreground">{counts.provenance.confirmed}</span>/{provTotal} provenance
          {counts.provenance.failed > 0 && (
            <span className="ml-1 text-red-500">· {counts.provenance.failed} failed</span>
          )}
        </span>
      )}
    </div>
  )
}

function NodeDetails({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const config = NODE_CONFIG[node.type] ?? NODE_CONFIG.token
  const onChain = node.metadata?.onChain as OnChainMeta | undefined

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: config.color }} />
          <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
          {onChain && (
            <Badge
              className="text-[10px] capitalize"
              style={{
                backgroundColor: STATUS_COLOR[onChain.status],
                color: 'white',
                borderColor: STATUS_COLOR[onChain.status],
              }}
            >
              {onChain.status}
            </Badge>
          )}
        </div>
        <h3 className="mt-2 text-base font-semibold wrap-break-word">{node.label}</h3>
        <p className="mt-1 font-mono text-xs text-muted-foreground break-all">{node.id}</p>
      </div>

      <Separator />

      {onChain ? (
        <OnChainMetaSection meta={onChain} />
      ) : (
        <p className="text-xs text-muted-foreground">
          No on-chain data for this node (structural only).
        </p>
      )}

      {/* Additional node metadata (predicate / subject_id / object_literal / ...) */}
      {node.type === 'triple' && (
        <>
          <Separator />
          <TripleExtras metadata={node.metadata} />
        </>
      )}

      <Separator />
      <Button variant="outline" size="sm" className="w-full" onClick={onClose}>
        Close details
      </Button>
    </div>
  )
}

function OnChainMetaSection({ meta }: { meta: OnChainMeta }) {
  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Term ID</p>
        <p className="mt-0.5 break-all font-mono">
          {meta.termId ?? <span className="text-muted-foreground italic">not assigned</span>}
        </p>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Transaction</p>
        {meta.txHash ? (
          <p className="mt-0.5 break-all font-mono">{meta.txHash}</p>
        ) : (
          <p className="mt-0.5 text-muted-foreground italic">not submitted</p>
        )}
      </div>

      {meta.errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-2 dark:border-red-900 dark:bg-red-950">
          <p className="text-[10px] uppercase tracking-wide text-red-700 dark:text-red-300">Error</p>
          <p className="mt-0.5 wrap-break-word text-red-800 dark:text-red-200">{meta.errorMessage}</p>
        </div>
      )}

      <a
        href={INTUITION_HUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary hover:underline"
      >
        View on Intuition Hub
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}

function TripleExtras({ metadata }: { metadata: Record<string, unknown> }) {
  const predicate = metadata.predicate as string | undefined
  const subjectId = metadata.subject_id as string | null | undefined
  const objectId = metadata.object_id as string | null | undefined
  const objectLiteral = metadata.object_literal as string | null | undefined
  const claimGroup = metadata.claim_group as string | null | undefined
  const isProvenance = metadata.isProvenance === true

  return (
    <div className="space-y-2 text-xs">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {isProvenance ? 'Provenance structure' : 'Triple structure'}
      </p>
      {predicate && (
        <Row label="Predicate" value={predicate} mono />
      )}
      {subjectId && (
        <Row label="Subject" value={subjectId} mono />
      )}
      {objectId && (
        <Row label="Object" value={objectId} mono />
      )}
      {objectLiteral && (
        <Row label="Literal" value={objectLiteral} />
      )}
      {claimGroup && (
        <Row label="Claim group" value={claimGroup} />
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}
