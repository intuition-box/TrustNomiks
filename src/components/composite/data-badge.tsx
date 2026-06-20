'use client'

import * as React from 'react'
import { CheckCircle2, Clock, CircleDashed, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import { DATA_CSS_VAR, DATA_LABEL } from '@/lib/design/tokens'
import { NodeGlyph } from '@/components/patterns/node-glyph'

type Emphasis = 'soft' | 'solid' | 'outline'

interface DataBadgeProps {
  type: NodeType
  label?: React.ReactNode
  emphasis?: Emphasis
  withGlyph?: boolean
  className?: string
}

/**
 * Category chip whose color IS its concept (graph-taxonomy color), paired with the
 * family glyph so meaning survives grayscale. Use for chain / category / sector / token tags.
 */
export function DataBadge({ type, label, emphasis = 'soft', withGlyph = true, className }: DataBadgeProps) {
  const v = `hsl(var(${DATA_CSS_VAR[type]}))`
  const style: React.CSSProperties =
    emphasis === 'solid'
      ? { backgroundColor: v, color: 'hsl(var(--background))', borderColor: 'transparent' }
      : emphasis === 'outline'
        ? { color: v, borderColor: `color-mix(in oklab, ${v} 45%, transparent)`, backgroundColor: 'transparent' }
        : {
            color: v,
            backgroundColor: `color-mix(in oklab, ${v} 14%, transparent)`,
            borderColor: `color-mix(in oklab, ${v} 26%, transparent)`,
          }

  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
    >
      {withGlyph && <NodeGlyph type={type} size={10} aria-hidden />}
      {label ?? DATA_LABEL[type]}
    </span>
  )
}

/* ── StatusPill ───────────────────────────────────────────────────────────── */

export type TokenStatus = 'draft' | 'in_review' | 'validated'

const STATUS_META: Record<TokenStatus, { label: string; varName: string; Icon: typeof CheckCircle2 }> = {
  draft: { label: 'Draft', varName: '--status-draft', Icon: CircleDashed },
  in_review: { label: 'In review', varName: '--status-review', Icon: Clock },
  validated: { label: 'Validated', varName: '--status-validated', Icon: CheckCircle2 },
}

export function StatusPill({ status, className }: { status: TokenStatus; className?: string }) {
  const meta = STATUS_META[status]
  const v = `hsl(var(${meta.varName}))`
  return (
    <span
      style={{
        color: v,
        backgroundColor: `color-mix(in oklab, ${v} 14%, transparent)`,
        borderColor: `color-mix(in oklab, ${v} 28%, transparent)`,
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <meta.Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </span>
  )
}

/* ── RiskPill ─────────────────────────────────────────────────────────────── */

export type RiskSeverity = 'low' | 'med' | 'high'

const RISK_META: Record<RiskSeverity, { label: string; varName: string }> = {
  low: { label: 'Low', varName: '--risk-low' },
  med: { label: 'Medium', varName: '--risk-med' },
  high: { label: 'High', varName: '--risk-high' },
}

export function RiskPill({ severity, className }: { severity: RiskSeverity; className?: string }) {
  const meta = RISK_META[severity]
  const v = `hsl(var(${meta.varName}))`
  return (
    <span
      style={{
        color: v,
        backgroundColor: `color-mix(in oklab, ${v} 14%, transparent)`,
        borderColor: `color-mix(in oklab, ${v} 28%, transparent)`,
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <TriangleAlert className="h-3 w-3" aria-hidden />
      {meta.label} risk
    </span>
  )
}
