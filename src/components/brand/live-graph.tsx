'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import { getDataColor } from '@/lib/design/tokens'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

export type LiveGraphMode = 'hero' | 'ambient' | 'local'

export interface LiveNode {
  id: string
  type: NodeType
  label?: string
  size?: number
}
export interface LiveLink {
  source: string
  target: string
}
export interface LiveGraphData {
  nodes: LiveNode[]
  links: LiveLink[]
}

interface LiveGraphProps {
  mode?: LiveGraphMode
  /** real data (local mode). Omit to render the synthetic signature graph. */
  data?: LiveGraphData
  /** token count for the synthetic graph */
  count?: number
  className?: string
  onNodeClick?: (node: LiveNode) => void
}

// Node types cycled through token satellites so the hero shows the full taxonomy.
const SATELLITE_TYPES: NodeType[] = [
  'allocation',
  'vesting',
  'emission',
  'data_source',
  'risk_flag',
  'chain',
  'sector',
]

const SIZE_BY_TYPE: Partial<Record<NodeType, number>> = {
  graph_root: 9,
  token: 6,
  triple: 3,
}

/** Deterministic synthetic graph: hub → tokens → a couple of atom/triple children each. */
function buildSynthetic(count: number): LiveGraphData {
  const nodes: LiveNode[] = [{ id: 'hub', type: 'graph_root', label: 'TrustNomiks', size: 9 }]
  const links: LiveLink[] = []
  for (let t = 0; t < count; t++) {
    const tid = `t${t}`
    nodes.push({ id: tid, type: 'token', label: `Token ${t + 1}`, size: 6 })
    links.push({ source: 'hub', target: tid })
    const children = 2 + (t % 3)
    for (let c = 0; c < children; c++) {
      const cid = `${tid}-c${c}`
      const type = SATELLITE_TYPES[(t + c) % SATELLITE_TYPES.length]
      nodes.push({ id: cid, type, size: 4 })
      links.push({ source: tid, target: cid })
      // every other child gets a reified triple node hanging off it
      if (c % 2 === 0) {
        const trid = `${cid}-tr`
        nodes.push({ id: trid, type: 'triple', size: 2.5 })
        links.push({ source: cid, target: trid })
      }
    }
  }
  return { nodes, links }
}

export function LiveGraph({ mode = 'hero', data, count = 12, className, onNodeClick }: LiveGraphProps) {
  const { resolvedTheme } = useTheme()
  const wrapRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(undefined)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [reducedMotion, setReducedMotion] = useState(false)

  const graph = useMemo(() => data ?? buildSynthetic(count), [data, count])

  // Resolve taxonomy colors once per theme (re-read CSS vars on theme switch).
  const colorMap = useMemo(() => {
    const map = new Map<string, string>()
    const types = new Set(graph.nodes.map((n) => n.type))
    types.forEach((t) => map.set(t, getDataColor(t)))
    return map
    // resolvedTheme intentionally in deps to re-resolve on dark/light switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, resolvedTheme])

  // Measure container
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setSize({ w: Math.floor(r.width), h: Math.floor(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Reduced motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Pin hub at center
  const graphData = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => (n.id === 'hub' ? { ...n, fx: 0, fy: 0 } : { ...n })),
      links: graph.links.map((l) => ({ ...l })),
    }),
    [graph],
  )

  // Fit on mount / data change
  const sig = `${graphData.nodes.length}:${size.w}:${size.h}`
  const prevSig = useRef('')
  useEffect(() => {
    if (size.w > 0 && sig !== prevSig.current) {
      prevSig.current = sig
      const fg = fgRef.current
      if (!fg) return
      const timer = setTimeout(() => fg.zoomToFit?.(500, mode === 'hero' ? 60 : 36), 700)
      return () => clearTimeout(timer)
    }
  }, [sig, size.w, mode])

  const nodeCanvasObject = useCallback(
    (raw: object, ctx: CanvasRenderingContext2D, scale: number) => {
      const node = raw as LiveNode & { x?: number; y?: number }
      const x = node.x ?? 0
      const y = node.y ?? 0
      const s = node.size ?? SIZE_BY_TYPE[node.type] ?? 4
      const color = colorMap.get(node.type) ?? '#94a3b8'
      const isHub = node.type === 'graph_root'
      const isTriple = node.type === 'triple'

      if (isHub) {
        // luminous halo + ring
        ctx.beginPath()
        ctx.arc(x, y, s + 6, 0, 2 * Math.PI)
        ctx.fillStyle = withAlpha(color, 0.16)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(x, y, s, 0, 2 * Math.PI)
        ctx.lineWidth = 2.4
        ctx.strokeStyle = color
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, s * 0.34, 0, 2 * Math.PI)
        ctx.fillStyle = color
        ctx.fill()
      } else if (isTriple) {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = color
        ctx.fillRect(-s, -s, s * 2, s * 2)
        ctx.restore()
      } else {
        ctx.beginPath()
        ctx.arc(x, y, s, 0, 2 * Math.PI)
        ctx.fillStyle = color
        ctx.fill()
      }

      // labels: hub always; tokens when zoomed in enough
      const showLabel = isHub || (node.type === 'token' && scale > 0.9)
      if (showLabel && node.label) {
        const fontSize = Math.max((isHub ? 13 : 10) / scale, 3)
        ctx.font = `${isHub ? '600 ' : ''}${fontSize}px var(--font-geist-sans, Inter), sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = isHub ? color : withAlpha(color, 0.85)
        ctx.fillText(node.label, x, y + s + 2)
      }
    },
    [colorMap],
  )

  const handleClick = useCallback(
    (raw: object) => {
      if (onNodeClick) onNodeClick(raw as LiveNode)
    },
    [onNodeClick],
  )

  const ambient = mode === 'ambient'
  const particles = reducedMotion || ambient ? 0 : mode === 'hero' ? 2 : 1

  return (
    <div ref={wrapRef} className={cn('relative h-full w-full overflow-hidden', className)}>
      {size.w > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          nodeId="id"
          nodeRelSize={1}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(raw: object, color: string, ctx: CanvasRenderingContext2D) => {
            const node = raw as LiveNode & { x?: number; y?: number }
            const s = (node.size ?? 4) + 3
            ctx.beginPath()
            ctx.arc(node.x ?? 0, node.y ?? 0, s, 0, 2 * Math.PI)
            ctx.fillStyle = color
            ctx.fill()
          }}
          onNodeClick={handleClick}
          linkColor={() => readEdgeColor()}
          linkWidth={mode === 'hero' ? 0.7 : 0.5}
          linkDirectionalParticles={particles}
          linkDirectionalParticleWidth={1.8}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleColor={() => readEdgeColor(0.9)}
          warmupTicks={mode === 'local' ? 0 : 20}
          cooldownTicks={reducedMotion ? 0 : ambient ? 120 : 400}
          d3AlphaDecay={0.025}
          d3VelocityDecay={0.32}
          enableNodeDrag={!ambient}
          enableZoomInteraction={mode !== 'ambient'}
          enablePanInteraction={mode !== 'ambient'}
          backgroundColor="transparent"
        />
      )}
    </div>
  )
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function withAlpha(color: string, alpha: number): string {
  // color comes back as "hsl(H S% L%)" from getDataColor → make it hsla
  if (color.startsWith('hsl(')) return color.replace('hsl(', 'hsla(').replace(')', ` / ${alpha})`)
  return color
}

function readEdgeColor(alpha = 0.5): string {
  if (typeof window === 'undefined') return `rgba(148,163,184,${alpha})`
  const v = getComputedStyle(document.documentElement).getPropertyValue('--graph-edge').trim()
  return v ? `hsla(${v} / ${alpha})` : `rgba(148,163,184,${alpha})`
}
