'use client'

import type { NodeType } from '@/lib/knowledge-graph/graph-types'
import { NodeGlyph } from '@/components/patterns/node-glyph'
import {
  getFieldDef,
  type ChallengeableClaimType,
  type FieldKind,
} from '@/lib/claims/field-registry'
import {
  formatNumber,
  formatDate,
} from '@/components/token-detail/detail-helpers'
import type { ChallengeAnchor } from '@/features/claims/challenge-target'

/** Graph-space accent per claim type, so the sentence's glyph matches the
 * same taxonomy color used everywhere else (DESIGN-RULES §2). Supply metrics
 * has no dedicated node type of its own; it is a token-level property. */
const CLAIM_TYPE_NODE_TYPE: Record<ChallengeableClaimType, NodeType> = {
  token_identity: 'token',
  supply_metrics: 'token',
  emission_model: 'emission',
  allocation_segment: 'allocation',
  vesting_schedule: 'vesting',
}

function formatFieldValue(kind: FieldKind | undefined, raw: unknown): string {
  switch (kind) {
    case 'number':
      return formatNumber(raw as string | number | null)
    case 'percentage': {
      const formatted = formatNumber(raw as string | number | null)
      return formatted === 'Not set' ? formatted : `${formatted}%`
    }
    case 'date':
      return formatDate(raw as string | null)
    case 'boolean':
      return raw === null || raw === undefined ? 'Not set' : raw ? 'Yes' : 'No'
    case 'text':
    case 'enum':
    default:
      return raw === null || raw === undefined || raw === ''
        ? 'Not set'
        : String(raw)
  }
}

interface ResolveBoxSentenceProps {
  anchor: ChallengeAnchor
  fieldKey: string
}

/**
 * Band (1): the drawer's header context block. Renders the claim as a
 * readable sentence, e.g. "Max Supply has a max supply of 1,000,000,000",
 * reusing the token-detail formatters so numbers/dates read exactly as they
 * do on the detail page. Shows "Not set" when the current value is empty.
 */
export function ResolveBoxSentence({
  anchor,
  fieldKey,
}: ResolveBoxSentenceProps) {
  const field = getFieldDef(anchor.claimType, fieldKey)
  const value = formatFieldValue(field?.kind, anchor.currentValues[fieldKey])
  const fieldLabel = (field?.label ?? 'value').toLowerCase()
  const isEmpty = value === 'Not set'
  const isBoolean = field?.kind === 'boolean'

  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-surface-2 p-4">
      <NodeGlyph
        type={CLAIM_TYPE_NODE_TYPE[anchor.claimType]}
        size={14}
        className="mt-1"
        aria-hidden
      />
      <p className="text-sm leading-relaxed">
        <span className="font-semibold text-foreground">{anchor.label}</span>{' '}
        {isEmpty ? (
          <>
            has {fieldLabel} set to{' '}
            <span className="font-semibold text-foreground">Not set</span>
          </>
        ) : isBoolean ? (
          <>
            {value === 'Yes' ? 'has' : 'does not have'}{' '}
            {fieldLabel.replace(/^has\s+/, '')}
          </>
        ) : (
          <>
            has {fieldLabel} of{' '}
            <span className="tabular font-mono font-semibold text-foreground">
              {value}
            </span>
          </>
        )}
      </p>
    </div>
  )
}
