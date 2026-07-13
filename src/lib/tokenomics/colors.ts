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
 *  base token toward white/black so five "Team" pools stay tellable apart.
 *  Structured rather than pre-formatted so the canvas resolver in
 *  src/lib/design/tokens.ts can replay the same mix numerically. */
export const RAMP_STEPS: readonly {
  share: number
  toward: 'white' | 'black'
}[] = [
  { share: 82, toward: 'white' },
  { share: 82, toward: 'black' },
  { share: 62, toward: 'white' },
  { share: 62, toward: 'black' },
  { share: 46, toward: 'white' },
]

/** The ramp step for an occurrence, or null for the base color (occurrence 0).
 *  Clamps past the last step so a 9th "Team" pool still gets a color. */
export function rampStepFor(occurrence: number) {
  if (occurrence <= 0) return null
  return RAMP_STEPS[Math.min(occurrence - 1, RAMP_STEPS.length - 1)]
}

/** The token a segment type paints with. Unknown custom types rotate through
 *  the palette, stable per occurrence. */
export function chartVarFor(segmentType: string, occurrence = 0): string {
  const cssVar = CHART_CSS_VAR[segmentType as SegmentType]
  if (cssVar) return cssVar
  const t = CHART_TYPE_ORDER[occurrence % CHART_TYPE_ORDER.length]
  return CHART_CSS_VAR[t]
}

export function getSegmentChartColor(
  segmentType: string,
  occurrence = 0,
): string {
  const known = segmentType in CHART_CSS_VAR
  const base = `hsl(var(${chartVarFor(segmentType, occurrence)}))`
  // Unknown types get their spread from the palette rotation, not the ramp.
  if (!known) return base
  const step = rampStepFor(occurrence)
  if (!step) return base
  return `color-mix(in oklab, ${base} ${step.share}%, ${step.toward})`
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
