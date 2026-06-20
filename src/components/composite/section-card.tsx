'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import { DATA_CSS_VAR } from '@/lib/design/tokens'
import { NodeGlyph } from '@/components/patterns/node-glyph'

interface SectionCardProps {
  title: string
  /** taxonomy accent: drives the left rule + glyph color (same color = same concept) */
  accent: NodeType
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** render the title as an h2 for AA heading semantics (default true) */
  as?: 'h2' | 'h3'
}

/**
 * A content section whose left rule + glyph carry its taxonomy accent — so Allocation
 * is always amber, Vesting always emerald, etc., matching the graph. Real heading semantics.
 */
export function SectionCard({
  title,
  accent,
  description,
  action,
  children,
  className,
  as: Heading = 'h2',
}: SectionCardProps) {
  const accentColor = `hsl(var(${DATA_CSS_VAR[accent]}))`
  return (
    <section
      className={cn('overflow-hidden rounded-xl border bg-surface-1', className)}
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex items-center gap-2.5">
          <NodeGlyph type={accent} size={14} aria-hidden />
          <div>
            <Heading className="text-base font-semibold leading-tight">{title}</Heading>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}
