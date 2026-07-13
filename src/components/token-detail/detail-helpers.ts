import { format } from 'date-fns'
import { normalizeRiskSeverity } from '@/types/form'
import { chartColorsFor } from '@/lib/design/tokens'
import { parseDateOnly } from '@/lib/utils/date'
import type { TokenData } from './types'

export const formatNumber = (value: string | number | null) => {
  if (!value) return 'Not set'
  const num = value.toString().replace(/,/g, '')
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Renders both DATE columns (tge_date, circulating_date, verified_at) and
 * timestamptz ones (created_at). `new Date('2026-07-13')` would read a DATE as
 * midnight UTC and render the previous day west of Greenwich; parseDateOnly
 * reads it as local midnight and leaves real instants alone.
 */
export const formatDate = (dateString: string | null) => {
  const parsed = parseDateOnly(dateString)
  if (!parsed) return 'Not set'
  return format(parsed, 'PPP')
}

export const STATUS_RANK: Record<string, number> = {
  draft: 0,
  in_review: 1,
  validated: 2,
}

// Chart space: the stacked bar shares the donut's segment-type palette, so
// the same segment reads as the same color in every chart (DESIGN-RULES §2).
// One color list per segments array (canonical order) so repeated types get
// the same lightness ramp everywhere on the page.
export const allocationColors = (segments: { segment_type: string }[]) =>
  chartColorsFor(segments.map((s) => s.segment_type))

export const riskSeverity = (s: string): 'low' | 'med' | 'high' => {
  const sev = normalizeRiskSeverity(s)
  return sev === 'medium' ? 'med' : sev
}

// Shared by the vesting-timeline memo and the unlock-chart render guard —
// kept as one pure helper instead of two parallel inline computations.
export const getMaxSupplyNum = (token: TokenData): number =>
  Number(
    (token.supply_metrics?.max_supply ?? '').toString().replace(/,/g, ''),
  ) || 0
