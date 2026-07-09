'use client'

import { ExternalLink } from 'lucide-react'
import type { TokenData } from './types'

// Returns the sources attributed to a specific claim
export const getClaimSources = (
  token: TokenData,
  claimType: string,
  claimId: string | null,
) =>
  (token.claim_sources ?? []).filter(
    (cs) => cs.claim_type === claimType && cs.claim_id === claimId,
  )

// Returns all claims attributed to a specific source (by source id)
export const getSourceClaims = (token: TokenData, sourceId: string) =>
  (token.claim_sources ?? []).filter((cs) => cs.data_source_id === sourceId)

// Returns a human-readable label for a claim
export const getClaimLabel = (
  token: TokenData,
  claimType: string,
  claimId: string | null,
): string => {
  switch (claimType) {
    case 'token_identity':
      return 'Token Identity'
    case 'supply_metrics':
      return 'Supply Metrics'
    case 'emission_model':
      return 'Emission Model'
    case 'allocation_segment': {
      const alloc = token.allocation_segments.find((a) => a.id === claimId)
      return alloc ? alloc.label : 'Allocation'
    }
    case 'vesting_schedule': {
      const alloc = token.allocation_segments.find((a) => a.id === claimId)
      return alloc ? `Vesting · ${alloc.label}` : 'Vesting'
    }
    default:
      return claimType
  }
}

// Small inline badge listing attributed sources for a claim
export function ClaimSourceBadges({
  token,
  claimType,
  claimId,
}: {
  token: TokenData
  claimType: string
  claimId?: string | null
}) {
  const sources = getClaimSources(token, claimType, claimId ?? null)
  if (sources.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {sources.map((cs, i) => {
        // Supabase returns the joined row as a single-element array
        const ds = Array.isArray(cs.data_source)
          ? cs.data_source[0]
          : cs.data_source
        if (!ds) return null
        return (
          <a
            key={i}
            href={ds.url}
            target="_blank"
            rel="noopener noreferrer"
            title={ds.document_name}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-primary hover:bg-primary/10 transition-colors"
          >
            {ds.document_name}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )
      })}
    </div>
  )
}
