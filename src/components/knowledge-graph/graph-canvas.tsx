'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { forceCollide, forceRadial } from 'd3-force-3d'
import { Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { KnowledgeGraphResponse } from '@/types/knowledge-graph'
import type { GraphNode, NodeType } from '@/lib/knowledge-graph/graph-types'
import { NODE_CONFIG } from '@/lib/knowledge-graph/node-config'
import { HUB_NODE_ID } from '@/lib/knowledge-graph/build-graph'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

// ── Force-graph compatible types ─────────────────────────────────────────────

interface FGNode {
  id: string
  label: string
  type: NodeType
  isLiteral: boolean
  metadata: Record<string, unknown>
  x?: number
  y?: number
}

interface GraphCanvasProps {
  data: KnowledgeGraphResponse
  width: number
  height: number
  onNodeSelect: (node: GraphNode | null) => void
  selectedNodeId: string | null
  searchQuery: string
  activeFilters: NodeType[]
  resetKey: number
  /**
   * Optional per-node color override. Returns a CSS color string to use instead of the
   * NODE_CONFIG default, or undefined to fall back. Used by the on-chain drill-down
   * to color nodes by publication status (confirmed / failed / skipped).
   */
  nodeColor?: (node: GraphNode) => string | undefined
  /** Optional link color override (default: faint slate). */
  linkColor?: string
  /** Optional link width override (default: 0.4). */
  linkWidth?: number
}

export function GraphCanvas({
  data,
  width,
  height,
  onNodeSelect,
  selectedNodeId,
  searchQuery,
  activeFilters,
  resetKey,
  nodeColor,
  linkColor,
  linkWidth,
}: GraphCanvasProps) {
  // Index the full GraphNode map once for fast per-frame lookup in nodeCanvasObject.
  const graphNodesById = useMemo(
    () => new Map(data.nodes.map((n) => [n.id, n])),
    [data.nodes],
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(undefined)
  const [showCenterBtn, setShowCenterBtn] = useState(false)

  // ── Memoize graphData — only rebuild when data identity changes ─────────
  const graphData = useMemo(() => ({
    nodes: data.nodes.map((n) => {
      const base = { ...n } as FGNode & { fx?: number; fy?: number }
      if (n.id === HUB_NODE_ID) {
        base.fx = 0
        base.fy = 0
      }
      return base
    }),
    links: data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      predicate: e.predicate,
      label: e.label,
    })),
  }), [data])

  // ── Token count for dynamic scaling ───────────────────────────────────
  const tokenCount = useMemo(
    () => data.nodes.filter(n => n.type === 'token').length,
    [data],
  )

  // ── Configure d3 forces — applied on first engine tick ─────────────────
  // Forces must be configured when the simulation is running (ref is valid).
  // Using onEngineTick guarantees timing. A dataSignature ref tracks when
  // forces need to be re-applied (on data change).
  const forcesDataKey = useRef('')

  const applyForces = useCallback(() => {
    const key = `${tokenCount}:${data.nodes.length}`
    if (key === forcesDataKey.current) return  // already applied for this data
    const fg = graphRef.current
    if (!fg || tokenCount === 0) return

    // Charge: repulsion to push token clusters apart
    fg.d3Force('charge')?.strength((node: FGNode) => {
      if (node.type === 'graph_root') return 0
      if (node.type === 'token') return -300 - tokenCount * 30
      if (node.type === 'triple') return -10
      return -40 - tokenCount * 2
    })

    // Link distance: hub→token gets generous spacing, internal links stay tight
    fg.d3Force('link')
      ?.distance((link: { predicate?: string }) => {
        const pred = link.predicate
        if (pred === 'belongs_to_graph') return 250 + tokenCount * 30
        if (pred === 'subject_of' || pred === 'object_of') return 25
        return 30
      })
      .strength(0.3)

    // Remove center force — hub is already pinned at (0,0)
    fg.d3Force('center', null)

    // Collision: prevent nodes from overlapping
    fg.d3Force('collision', forceCollide((node: FGNode) => {
      const baseSize = NODE_CONFIG[node.type]?.size ?? 6
      if (node.type === 'token') return baseSize + 20 + tokenCount
      if (node.type === 'triple') return baseSize + 1
      return baseSize + 6
    }).strength(0.8).iterations(3))

    // Radial orbit: tokens orbit the hub at a dynamic radius
    const orbitRadius = Math.max(300, 200 + tokenCount * 50)
    fg.d3Force('tokenOrbit', forceRadial(
      (node: FGNode) => node.type === 'token' ? orbitRadius : 0,
      0, 0,
    ).strength((node: FGNode) => node.type === 'token' ? 0.12 : 0))

    forcesDataKey.current = key
    fg.d3ReheatSimulation()
  }, [tokenCount, data.nodes.length])

  // ── Auto-fit when data shape changes ────────────────────────────────────
  const dataSignature = `${data.nodes.length}:${data.edges.length}`
  const prevSignature = useRef('')

  useEffect(() => {
    if (data.nodes.length > 0 && dataSignature !== prevSignature.current) {
      prevSignature.current = dataSignature
      graphRef.current?.d3ReheatSimulation?.()
      const fitDelay = 1200 + tokenCount * 20
      const timer = setTimeout(() => {
        graphRef.current?.zoomToFit(400, 50)
      }, fitDelay)
      return () => clearTimeout(timer)
    }
  }, [dataSignature, data.nodes.length, tokenCount])

  // ── Imperative reset from parent ────────────────────────────────────────
  const prevResetKey = useRef(0)

  useEffect(() => {
    if (resetKey > 0 && resetKey !== prevResetKey.current) {
      prevResetKey.current = resetKey
      graphRef.current?.d3ReheatSimulation?.()
      setTimeout(() => graphRef.current?.zoomToFit(400, 50), 800)
    }
  }, [resetKey])

  // ── Recovery button ─────────────────────────────────────────────────────
  const handleEngineStop = useCallback(() => {
    if (data.nodes.length > 0) {
      setTimeout(() => setShowCenterBtn(true), 300)
    }
  }, [data.nodes.length])

  const hideCenter = useCallback(() => {
    queueMicrotask(() => setShowCenterBtn(false))
  }, [])

  const handleCenterClick = useCallback(() => {
    graphRef.current?.zoomToFit(400, 50)
    setShowCenterBtn(false)
  }, [])

  // ── Visibility ──────────────────────────────────────────────────────────

  const isVisible = useCallback(
    (node: FGNode) => {
      if (activeFilters.length > 0 && !activeFilters.includes(node.type)) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return node.label.toLowerCase().includes(q) || node.id.toLowerCase().includes(q)
      }
      return true
    },
    [activeFilters, searchQuery],
  )

  // ── Node rendering ──────────────────────────────────────────────────────

  const nodeCanvasObject = useCallback(
    (rawNode: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as FGNode
      const config = NODE_CONFIG[node.type] ?? NODE_CONFIG.token
      const size = config.size
      const visible = isVisible(node)
      const isSelected = node.id === selectedNodeId
      const isHub = node.id === HUB_NODE_ID
      const x = node.x ?? 0
      const y = node.y ?? 0

      // Resolve effective color: external override takes precedence over NODE_CONFIG
      const graphNode = graphNodesById.get(node.id)
      const overrideColor = nodeColor && graphNode ? nodeColor(graphNode) : undefined
      const effectiveColor = overrideColor ?? config.color

      ctx.globalAlpha = visible ? 1 : 0.08

      if (isHub) {
        ctx.beginPath()
        ctx.arc(x, y, size + 4, 0, 2 * Math.PI)
        ctx.fillStyle = 'rgba(99, 102, 241, 0.15)'
        ctx.fill()
      }

      if (node.type === 'triple') {
        ctx.beginPath()
        ctx.moveTo(x, y - size)
        ctx.lineTo(x + size, y)
        ctx.lineTo(x, y + size)
        ctx.lineTo(x - size, y)
        ctx.closePath()
        ctx.fillStyle = isSelected ? '#ffffff' : effectiveColor
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.arc(x, y, size, 0, 2 * Math.PI)
        ctx.fillStyle = isSelected ? '#ffffff' : effectiveColor
        ctx.fill()
      }

      if (isSelected) {
        ctx.strokeStyle = effectiveColor
        ctx.lineWidth = 2.5
        ctx.stroke()
      }

      const showLabel = isHub
        || (node.type === 'token' && globalScale > 0.8)
        || (node.type !== 'triple' && globalScale > 1.5)
      if (showLabel && visible) {
        const fontSize = isHub
          ? Math.max(14 / globalScale, 5)
          : Math.max(10 / globalScale, 3)
        ctx.font = `${isHub ? 'bold ' : ''}${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isHub ? '#6366f1' : '#94a3b8'
        ctx.fillText(node.label, x, y + size + 2)
      }

      ctx.globalAlpha = 1
    },
    [selectedNodeId, isVisible, nodeColor, graphNodesById],
  )

  const handleNodeClick = useCallback(
    (rawNode: object) => {
      const node = rawNode as FGNode
      const graphNode = data.nodes.find((n) => n.id === node.id) ?? null
      onNodeSelect(graphNode)
      hideCenter()
    },
    [data.nodes, onNodeSelect, hideCenter],
  )

  if (width === 0 || height === 0) return null

  return (
    <>
      <ForceGraph2D
        ref={graphRef}
        width={width}
        height={height}
        graphData={graphData}
        nodeId="id"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(rawNode: object, color: string, ctx: CanvasRenderingContext2D) => {
          const node = rawNode as FGNode
          const size = NODE_CONFIG[node.type]?.size ?? 6
          ctx.beginPath()
          ctx.arc(node.x ?? 0, node.y ?? 0, size + 3, 0, 2 * Math.PI)
          ctx.fillStyle = color
          ctx.fill()
        }}
        onNodeClick={handleNodeClick}
        onNodeDrag={hideCenter}
        onZoom={hideCenter}
        onEngineTick={applyForces}
        onEngineStop={handleEngineStop}
        linkColor={() => linkColor ?? 'rgba(148, 163, 184, 0.15)'}
        linkWidth={linkWidth ?? 0.4}
        linkDirectionalArrowLength={2.5}
        linkDirectionalArrowRelPos={1}
        warmupTicks={0}
        cooldownTicks={300}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        backgroundColor="transparent"
      />

      {showCenterBtn && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-3 right-3 z-10 h-7 text-[10px] gap-1 px-2 opacity-70 hover:opacity-100 transition-opacity"
          onClick={handleCenterClick}
        >
          <Crosshair className="h-3 w-3" />
          Center graph
        </Button>
      )}
    </>
  )
}
