/**
 * CHART SPACE — allocation-segment palette (`--chart-*` tokens). Values are
 * CSS var strings: theme-aware, SSR-stable, valid in SVG fills and DOM styles.
 * Kept distinct from graph space (never color a segment with a --data-* token);
 * the graph-space half of the JS ↔ CSS bridge stays in src/lib/design/tokens.ts,
 * which re-exports these so it remains the single public bridge.
 */
import type { SegmentType } from './schemas'

export const CHART_CSS_VAR: Record<SegmentType, string> = {
  'funding-private': '--chart-funding-private',
  'funding-public': '--chart-funding-public',
  'team-founders': '--chart-team-founders',
  treasury: '--chart-treasury',
  marketing: '--chart-marketing',
  airdrop: '--chart-airdrop',
  rewards: '--chart-rewards',
  liquidity: '--chart-liquidity',
}

const CHART_TYPE_ORDER: SegmentType[] = [
  'funding-private',
  'funding-public',
  'team-founders',
  'treasury',
  'marketing',
  'airdrop',
  'rewards',
  'liquidity',
]

/** Lightness ramp for repeated same-type segments (occurrence 1..n): mixes the
 *  base token toward white/black so five "Team" pools stay tellable apart. */
const RAMP_MIX = [
  '82%, white',
  '82%, black',
  '62%, white',
  '62%, black',
  '46%, white',
]

export function getSegmentChartColor(
  segmentType: string,
  occurrence = 0,
): string {
  const cssVar = CHART_CSS_VAR[segmentType as SegmentType]
  if (!cssVar) {
    // Unknown custom type: rotate through the chart palette, stable per occurrence
    const t = CHART_TYPE_ORDER[occurrence % CHART_TYPE_ORDER.length]
    return `hsl(var(${CHART_CSS_VAR[t]}))`
  }
  const base = `hsl(var(${cssVar}))`
  if (occurrence <= 0) return base
  const mix = RAMP_MIX[Math.min(occurrence - 1, RAMP_MIX.length - 1)]
  return `color-mix(in oklab, ${base} ${mix})`
}

/** Colors for a rendered segment list: counts per-type occurrences in order so
 *  charts, bars and legends built from the same list always agree. */
export function chartColorsFor(segmentTypes: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return segmentTypes.map((t) => {
    const n = seen.get(t) ?? 0
    seen.set(t, n + 1)
    return getSegmentChartColor(t, n)
  })
}
