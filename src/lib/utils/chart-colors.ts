import type { SegmentType } from '@/types/form'

/**
 * Stable color mapping by segment_type.
 * The same segment_type always renders the same color across all tokens,
 * enabling meaningful cross-token visual comparison.
 */
export const SEGMENT_TYPE_COLORS: Record<SegmentType, string> = {
  'funding-private': '#3b82f6', // blue-500
  'funding-public':  '#a855f7', // purple-500
  'team-founders':   '#ec4899', // pink-500
  'treasury':        '#f97316', // orange-500
  'marketing':       '#22c55e', // green-500
  'airdrop':         '#14b8a6', // teal-500
  'rewards':         '#6366f1', // indigo-500
  'liquidity':       '#06b6d4', // cyan-500
}

const FALLBACK_COLORS = [
  '#ef4444', // red-500
  '#eab308', // yellow-500
  '#84cc16', // lime-500
  '#8b5cf6', // violet-500
]

/**
 * Get the chart color for a segment_type.
 * Falls back to a rotating palette for unknown types.
 */
export function getSegmentChartColor(segmentType: string, fallbackIndex = 0): string {
  return (
    SEGMENT_TYPE_COLORS[segmentType as SegmentType] ??
    FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length]
  )
}

/**
 * Tailwind text color classes matching the hex colors above.
 * Used for labels and legends outside SVG context.
 */
export const SEGMENT_TYPE_TEXT_COLORS: Record<SegmentType, string> = {
  'funding-private': 'text-blue-500',
  'funding-public':  'text-purple-500',
  'team-founders':   'text-pink-500',
  'treasury':        'text-orange-500',
  'marketing':       'text-green-500',
  'airdrop':         'text-teal-500',
  'rewards':         'text-indigo-500',
  'liquidity':       'text-cyan-500',
}
