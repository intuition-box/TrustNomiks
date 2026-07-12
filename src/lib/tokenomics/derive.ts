/**
 * Factory derivations — a design describes a token that does not exist yet,
 * so circulating figures are never typed in: they FLOW from the design.
 * The TGE unlock is the first of them: what the vesting schedules release at
 * launch, per segment, summed. (The screener's supply form keeps its manual
 * fields: there the token is live and the figures are observed, not derived.)
 */
import { parseDecimal } from './math'

export interface DerivableSegment {
  id?: string
  percentage: string
  token_amount?: string
}

export interface DerivableSchedule {
  frequency?: string
  tge_percentage?: string
}

export interface TgeUnlock {
  /** tokens released at TGE across all segments */
  tokens: number
  /** share of max supply released at TGE, 2 decimals; null without a max */
  pctOfMaxSupply: number | null
}

const segmentTokens = (segment: DerivableSegment, max: number): number => {
  const explicit = segment.token_amount
    ? parseFloat(String(segment.token_amount).replace(/,/g, ''))
    : NaN
  if (!Number.isNaN(explicit)) return explicit
  const pct = parseDecimal(segment.percentage)
  if (Number.isNaN(pct) || Number.isNaN(max)) return 0
  return (max * pct) / 100
}

/**
 * Sum what the schedules release at launch: an 'immediate' segment unlocks
 * fully, anything else unlocks its TGE percentage. (Cliff unlocks land at the
 * cliff month, not at TGE, so they are deliberately excluded here.)
 *
 * `schedules` is the vesting form record keyed by allocation row id;
 * `maxSupply` is the formatted form string ('' when unset).
 */
export function deriveTgeUnlock(
  segments: DerivableSegment[],
  schedules: Record<string, DerivableSchedule | undefined>,
  maxSupply: string,
): TgeUnlock {
  const max = maxSupply ? parseFloat(String(maxSupply).replace(/,/g, '')) : NaN

  let tokens = 0
  for (const segment of segments) {
    const schedule = segment.id ? schedules[segment.id] : undefined
    if (!schedule) continue
    const base = segmentTokens(segment, max)
    if (base <= 0) continue
    if (schedule.frequency === 'immediate') {
      tokens += base
      continue
    }
    const tgePct = schedule.tge_percentage
      ? parseDecimal(schedule.tge_percentage)
      : NaN
    if (!Number.isNaN(tgePct) && tgePct > 0) {
      tokens += (base * Math.min(tgePct, 100)) / 100
    }
  }

  const rounded = Math.round(tokens)
  const hasMax = !Number.isNaN(max) && max > 0
  return {
    tokens: rounded,
    pctOfMaxSupply: hasMax ? Math.round((rounded / max) * 10000) / 100 : null,
  }
}
