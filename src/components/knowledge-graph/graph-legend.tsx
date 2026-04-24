'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { NODE_CONFIG } from '@/lib/knowledge-graph/node-config'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import { cn } from '@/lib/utils'

const LEGEND_TYPES: NodeType[] = [
  'graph_root',
  'token',
  'allocation',
  'vesting',
  'emission',
  'triple',
]

export function GraphLegend() {
  const [open, setOpen] = useState(true)

  return (
    <div className="absolute bottom-3 left-3 z-10">
      <div className={cn(
        'rounded-lg border border-border/50 bg-background/80 backdrop-blur-sm shadow-sm',
        'transition-all duration-200',
      )}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          Legend
          {open ? <ChevronDown className="h-3 w-3 ml-auto" /> : <ChevronUp className="h-3 w-3 ml-auto" />}
        </button>

        {open && (
          <div className="px-2.5 pb-2 space-y-1">
            {LEGEND_TYPES.map((type) => {
              const config = NODE_CONFIG[type]
              return (
                <div key={type} className="flex items-center gap-2">
                  {type === 'triple' ? (
                    <span className="w-2.5 h-2.5 shrink-0 rotate-45" style={{ backgroundColor: config.color }} />
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                  )}
                  <span className="text-[10px] text-muted-foreground">{config.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
