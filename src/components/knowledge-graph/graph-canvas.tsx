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
  /** Optional node to pin at the center. Defaults to the global TrustNomiks hub. */
  pinnedNodeId?: string
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
  pinnedNodeId = HUB_NODE_ID,
}: GraphCanvasProps) {
  // Index the full GraphNode map once for fast per-frame lookup in nodeCanvasObject.
  const graphNodesById = useMemo(
    () => new Map(data.nodes.map((n) => [n.id, n])),
    [data.nodes],
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(undefined)
  const [showCenterBtn, setShowCenterBtn] = useState(false)
  // True once the user drags a node — suppresses the auto re-fit so we never
  // yank the view away from a manual layout.
  const userInteracted = useRef(false)
  // Counts engine ticks since the last (re)load, to drive the early "follow" fits.
  const tickCounter = useRef(0)

  // ── Memoize graphData — only rebuild when data identity changes ─────────
  // Seed INITIAL positions (hub centered, tokens on a ring, their atoms just outside)
  // so the very first paint is already laid out. The simulation then only refines it,
  // which makes the auto-fit near-instant instead of watching it expand from the center.
  const graphData = useMemo(() => {
    const tokenNodes = data.nodes.filter((n) => n.type === 'token')
    const tc = tokenNodes.length
    const orbitRadius = Math.max(300, 200 + tc * 50)
    const angleById = new Map<string, number>()
    tokenNodes.forEach((n, i) => angleById.set(n.id, (i / Math.max(1, tc)) * 2 * Math.PI - Math.PI / 2))
    const tokenIds = new Set(tokenNodes.map((n) => n.id))
    const childAngle = new Map<string, number>()
    for (const e of data.edges) {
      const src = typeof e.source === 'string' ? e.source : (e.source as { id: string }).id
      const tgt = typeof e.target === 'string' ? e.target : (e.target as { id: string }).id
      if (tokenIds.has(src) && !tokenIds.has(tgt) && tgt !== pinnedNodeId && angleById.has(src)) {
        childAngle.set(tgt, angleById.get(src)!)
      }
    }
    return {
      nodes: data.nodes.map((n, i) => {
        const base = { ...n } as FGNode & { fx?: number; fy?: number }
        if (n.id === pinnedNodeId) {
          base.fx = 0
          base.fy = 0
          base.x = 0
          base.y = 0
        } else if (n.type === 'token') {
          const a = angleById.get(n.id) ?? 0
          base.x = orbitRadius * Math.cos(a)
          base.y = orbitRadius * Math.sin(a)
        } else if (childAngle.has(n.id)) {
          const a = childAngle.get(n.id)! + ((i % 5) - 2) * 0.09
          const r = orbitRadius + 80
          base.x = r * Math.cos(a)
          base.y = r * Math.sin(a)
        }
        return base
      }),
      links: data.edges.map((e) => ({
        source: e.source,
        target: e.target,
        predicate: e.predicate,
        label: e.label,
      })),
    }
  }, [data, pinnedNodeId])

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

  // Follow the layout with an instant fit during the first frames so the graph is
  // framed almost immediately. zoomToFit only "holds" once the sim is calm, so we
  // re-apply it every few ticks while it settles. Stops after the early phase, or
  // once the user drags. onEngineStop still does the final, exact fit.
  const handleEngineTick = useCallback(() => {
    applyForces()
    tickCounter.current += 1
    if (tickCounter.current <= 80 && tickCounter.current % 5 === 0 && !userInteracted.current) {
      graphRef.current?.zoomToFit?.(0, 40)
    }
  }, [applyForces])

  // ── Auto-fit when data shape changes ────────────────────────────────────
  const dataSignature = `${data.nodes.length}:${data.edges.length}`
  const prevSignature = useRef('')

  useEffect(() => {
    if (data.nodes.length > 0 && dataSignature !== prevSignature.current) {
      prevSignature.current = dataSignature
      userInteracted.current = false // fresh data → re-fit while it settles
      tickCounter.current = 0 // restart the early "follow" fits
      graphRef.current?.d3ReheatSimulation?.()
      // Nodes are pre-positioned (see graphData), so the layout is good on the first
      // frame: fit almost immediately (instant, no animation), then re-fit a couple of
      // times to absorb the simulation's small refinements. onEngineStop does the final fit.
      const steps: Array<[number, number]> = [
        [90, 0], // near-instant initial frame
        [600, 400],
        [1600, 400],
      ]
      const timers = steps.map(([delay, dur]) =>
        setTimeout(() => {
          if (!userInteracted.current) graphRef.current?.zoomToFit?.(dur, 40)
        }, delay),
      )
      return () => timers.forEach(clearTimeout)
    }
  }, [dataSignature, data.nodes.length, tokenCount])

  // ── Imperative reset from parent ────────────────────────────────────────
  const prevResetKey = useRef(0)

  useEffect(() => {
    if (resetKey > 0 && resetKey !== prevResetKey.current) {
      prevResetKey.current = resetKey
      userInteracted.current = false // explicit reset → allow re-fit again
      graphRef.current?.d3ReheatSimulation?.()
      setTimeout(() => graphRef.current?.zoomToFit(400, 40), 800)
    }
  }, [resetKey])

  // ── Re-fit on container resize ──────────────────────────────────────────
  // Keeps the whole graph visible inside responsive containers (e.g. the
  // dashboard's narrowed column). Re-fits to the new viewport without reheating
  // the simulation, so resizing the window always re-frames the full graph.
  const prevDims = useRef('')
  useEffect(() => {
    if (width === 0 || height === 0 || data.nodes.length === 0) return
    const dims = `${width}x${height}`
    if (dims === prevDims.current) return
    prevDims.current = dims
    const timer = setTimeout(() => graphRef.current?.zoomToFit?.(400, 40), 250)
    return () => clearTimeout(timer)
  }, [width, height, data.nodes.length])

  // ── Recovery button + final fit ──────────────────────────────────────────
  // When the simulation settles, the graph is fully expanded — this is the
  // reliable moment to frame the WHOLE graph (the delayed fit fires while nodes
  // are still spreading from the center, which is why it otherwise stays zoomed
  // on the hub). Skip if the user already dragged a node.
  const handleEngineStop = useCallback(() => {
    if (data.nodes.length > 0) {
      if (!userInteracted.current) graphRef.current?.zoomToFit?.(450, 40)
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
      const isPinned = node.id === pinnedNodeId
      const isHub = node.type === 'graph_root'
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
        || isPinned
        || (node.type === 'token' && globalScale > 0.8)
        || (node.type !== 'triple' && globalScale > 1.5)
      if (showLabel && visible) {
        const fontSize = isHub
          ? Math.max(14 / globalScale, 5)
          : Math.max(10 / globalScale, 3)
        ctx.font = `${isHub ? 'bold ' : ''}${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isHub || isPinned ? '#6366f1' : '#94a3b8'
        ctx.fillText(node.label, x, y + size + 2)
      }

      ctx.globalAlpha = 1
    },
    [selectedNodeId, isVisible, nodeColor, graphNodesById, pinnedNodeId],
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
        onNodeDrag={() => {
          userInteracted.current = true
          hideCenter()
        }}
        onZoom={hideCenter}
        onEngineTick={handleEngineTick}
        onEngineStop={handleEngineStop}
        linkColor={() => linkColor ?? 'rgba(148, 163, 184, 0.15)'}
        linkWidth={linkWidth ?? 0.4}
        linkDirectionalArrowLength={2.5}
        linkDirectionalArrowRelPos={1}
        warmupTicks={0}
        cooldownTicks={60}
        d3AlphaDecay={0.06}
        d3VelocityDecay={0.4}
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
