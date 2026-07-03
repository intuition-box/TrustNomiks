'use client'

import { useMemo } from 'react'
import { LiveGraph, type LiveGraphData } from '@/components/brand/live-graph'
import { cn } from '@/lib/utils'

interface StudioGraphPaneProps {
  name: string
  ticker: string
  /** filled allocation segment labels */
  segmentLabels: string[]
  vestingCount: number
  hasEmission: boolean
  sourceCount: number
  riskCount: number
  className?: string
}

/**
 * The studio's living preview (docs/redesign/08 §6): the graph is the progress
 * bar. Every section that lands data spawns its nodes around the token. Node
 * ids are stable so the force layout animates additions instead of resetting.
 */
export function StudioGraphPane({
  name,
  ticker,
  segmentLabels,
  vestingCount,
  hasEmission,
  sourceCount,
  riskCount,
  className,
}: StudioGraphPaneProps) {
  const signature = [
    name || 'Token',
    ticker,
    segmentLabels.join('|'),
    vestingCount,
    hasEmission,
    sourceCount,
    riskCount,
  ].join('§')

  const data: LiveGraphData = useMemo(() => {
    const label = ticker || name || 'Token'
    const nodes: LiveGraphData['nodes'] = [{ id: 'hub', type: 'token', label, size: 8 }]
    const links: LiveGraphData['links'] = []
    const add = (id: string, type: LiveGraphData['nodes'][number]['type'], nodeLabel?: string) => {
      nodes.push({ id, type, label: nodeLabel, size: 4 })
      links.push({ source: 'hub', target: id })
    }
    segmentLabels.forEach((seg, i) => add(`alloc-${i}`, 'allocation', seg || undefined))
    for (let i = 0; i < vestingCount; i++) add(`vest-${i}`, 'vesting')
    if (hasEmission) add('emission', 'emission')
    for (let i = 0; i < sourceCount; i++) add(`src-${i}`, 'data_source')
    for (let i = 0; i < riskCount; i++) add(`risk-${i}`, 'risk_flag')
    return { nodes, links }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const nodeCount = data.nodes.length

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-surface-1', className)}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Your graph</h2>
        <span className="tabular text-xs text-muted-foreground">
          {nodeCount} node{nodeCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="h-64">
        <LiveGraph mode="local" data={data} />
      </div>
      <p className="border-t px-4 py-2.5 text-xs text-faint-foreground">
        Nodes spawn as your data lands. Publishing puts them on-chain.
      </p>
    </div>
  )
}
