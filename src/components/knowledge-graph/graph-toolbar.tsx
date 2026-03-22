'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Maximize2, Search } from 'lucide-react'
import { NODE_CONFIG } from '@/lib/knowledge-graph/node-config'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import { cn } from '@/lib/utils'

const FILTERABLE_TYPES: NodeType[] = [
  'token',
  'allocation',
  'vesting',
  'emission',
  'data_source',
  'triple',
]

interface GraphToolbarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  activeFilters: NodeType[]
  onToggleFilter: (type: NodeType) => void
  onRefresh: () => void
  onResetView: () => void
  isRefreshing: boolean
  nodeCount: number
  edgeCount: number
}

export function GraphToolbar({
  searchQuery,
  onSearchChange,
  activeFilters,
  onToggleFilter,
  onRefresh,
  onResetView,
  isRefreshing,
  nodeCount,
  edgeCount,
}: GraphToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 pb-3">
      <div className="relative flex-1 min-w-[160px] max-w-[240px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search nodes…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {FILTERABLE_TYPES.map((type) => {
          const config = NODE_CONFIG[type]
          const active = activeFilters.length === 0 || activeFilters.includes(type)
          return (
            <button
              key={type}
              type="button"
              onClick={() => onToggleFilter(type)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium border transition-colors cursor-pointer',
                active
                  ? 'border-border/60 text-foreground'
                  : 'border-transparent text-muted-foreground/40',
              )}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: config.color, opacity: active ? 1 : 0.3 }}
              />
              {config.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <Badge variant="secondary" className="text-[10px] font-normal">
          {nodeCount} nodes · {edgeCount} edges
        </Badge>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh data"
          aria-label="Refresh graph data"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onResetView}
          title="Reset view (clear filters, recenter)"
          aria-label="Reset view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
