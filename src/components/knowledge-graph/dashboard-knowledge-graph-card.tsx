'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { GitBranch, Loader2 } from 'lucide-react'
import { useKnowledgeGraph } from '@/hooks/use-knowledge-graph'
import { GraphCanvas } from './graph-canvas'
import { GraphToolbar } from './graph-toolbar'
import { GraphDetailPanel } from './graph-detail-panel'
import { GraphLegend } from './graph-legend'
import type { GraphNode, NodeType } from '@/lib/knowledge-graph/graph-types'

const MOBILE_HEIGHT = 400

export function DashboardKnowledgeGraphCard() {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilters, setActiveFilters] = useState<NodeType[]>([])
  const [resetKey, setResetKey] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [graphHeight, setGraphHeight] = useState(MOBILE_HEIGHT)
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const { data, loading, error, refetch } = useKnowledgeGraph(
    { scope: 'global', includeSources: true },
    true,
  )

  const showGraph = !!data && !loading && data.nodes.length > 0

  // Compute height: fill remaining viewport space below the card header
  useEffect(() => {
    function computeHeight() {
      const el = containerRef.current
      if (!el) return
      // Distance from the container's top to the bottom of the viewport
      const rect = el.getBoundingClientRect()
      const available = window.innerHeight - rect.top - 16 // 16px bottom margin
      setGraphHeight(Math.max(MOBILE_HEIGHT, available))
    }
    computeHeight()
    window.addEventListener('resize', computeHeight)
    return () => window.removeEventListener('resize', computeHeight)
  }, [showGraph])

  // ResizeObserver for container width
  useEffect(() => {
    observerRef.current?.disconnect()
    if (!showGraph) return

    const el = containerRef.current
    if (!el) return

    setContainerWidth(el.clientWidth)

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    observerRef.current = observer
    return () => observer.disconnect()
  }, [showGraph])

  const handleToggleFilter = useCallback((type: NodeType) => {
    setActiveFilters((prev) => {
      if (prev.length === 0) return [type]
      if (prev.includes(type)) {
        const next = prev.filter((t) => t !== type)
        return next.length === 0 ? [] : next
      }
      return [...prev, type]
    })
  }, [])

  const handleRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const handleResetView = useCallback(() => {
    setSearchQuery('')
    setActiveFilters([])
    setSelectedNode(null)
    setResetKey((k) => k + 1)
  }, [])

  const handleNavigate = useCallback(
    (nodeId: string) => {
      const node = data?.nodes.find((n) => n.id === nodeId) ?? null
      setSelectedNode(node)
    },
    [data?.nodes],
  )

  return (
    <>
      <Card className="border border-indigo-500/30 overflow-hidden shadow-[0_0_20px_rgba(99,102,241,0.12)]">
        <CardHeader className="border-b border-border/50 pb-4 bg-gradient-to-r from-indigo-100 dark:from-indigo-500/5 to-transparent">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex items-center justify-center w-7 h-7 rounded-md bg-indigo-100 dark:bg-indigo-500/10">
                <GitBranch className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </span>
              Knowledge Graph
            </CardTitle>
            {data && (
              <CardDescription className="text-xs">
                {data.meta.totalTokens} tokens · {data.meta.totalNodes} nodes · {data.meta.totalEdges} edges
              </CardDescription>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-4 pb-0 px-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground" style={{ height: graphHeight }}>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading knowledge graph…</span>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-center text-sm text-destructive" style={{ height: graphHeight }}>
              Failed to load graph: {error.message}
            </div>
          )}

          {showGraph && (
            <>
              <GraphToolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                activeFilters={activeFilters}
                onToggleFilter={handleToggleFilter}
                onRefresh={handleRefresh}
                onResetView={handleResetView}
                isRefreshing={loading}
                nodeCount={data.meta.totalNodes}
                edgeCount={data.meta.totalEdges}
              />

              <div ref={containerRef} className="relative w-full" style={{ height: graphHeight }}>
                {containerWidth > 0 && (
                  <GraphCanvas
                    data={data}
                    width={containerWidth}
                    height={graphHeight}
                    onNodeSelect={setSelectedNode}
                    selectedNodeId={selectedNode?.id ?? null}
                    searchQuery={searchQuery}
                    activeFilters={activeFilters}
                    resetKey={resetKey}
                  />
                )}
                <GraphLegend />
              </div>
            </>
          )}

          {data && data.nodes.length === 0 && !loading && (
            <div
              className="flex flex-col items-center justify-center gap-2 text-muted-foreground"
              style={{ height: graphHeight }}
            >
              <GitBranch className="h-10 w-10 opacity-30" />
              <p className="text-sm">No graph data yet. Add and validate tokens to populate the knowledge graph.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <GraphDetailPanel
        node={selectedNode}
        edges={data?.edges ?? []}
        nodes={data?.nodes ?? []}
        onClose={() => setSelectedNode(null)}
        onNavigate={handleNavigate}
      />
    </>
  )
}
