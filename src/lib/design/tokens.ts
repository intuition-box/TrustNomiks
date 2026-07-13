/**
 * Design tokens — the ONE bridge between JS ↔ CSS variables.
 *
 * Canvas (the force graph, the dither charts) and SVG (the recharts print
 * twins) can't use Tailwind classes, so they resolve colors here. DOM should
 * prefer the Tailwind classes (`bg-data-token`, `text-data-vesting`).
 *
 * The bridge has two halves; pick by what consumes the value:
 *   - CSS strings (SVG, DOM): getDataColor / getSegmentChartColor / chartColorsFor
 *   - numeric [r,g,b] (canvas): getDataRgb / chartRgbFor / getTokenRgb
 * A canvas can parse neither `hsl(var(--x))` nor `color-mix()`, so it needs
 * channels. Both halves replay the same OKLab ramp, so they cannot drift apart.
 * getComputedStyle is NOT reactive: re-resolve on `resolvedTheme` change.
 *
 * Same color = same concept, product-wide. See docs/redesign/DESIGN-RULES.md §2-§3
 * and docs/redesign/03-design-tokens-taxonomy.md.
 */
import type { NodeType, NodeFamily } from '@/lib/knowledge-graph/graph-types'
import type { SegmentType } from '@/lib/tokenomics/schemas'
import {
  CHART_CSS_VAR,
  chartVarFor,
  rampStepFor,
} from '@/lib/tokenomics/colors'
import {
  BLACK,
  hexToRgb,
  hslToRgb,
  mixOklab,
  parseHslTriplet,
  type Rgb,
  WHITE,
} from '@/lib/design/color-space'
import {
  Hexagon,
  Coins,
  PieChart,
  CalendarClock,
  Flame,
  TriangleAlert,
  FileText,
  Share2,
  AppWindow,
  Wallet,
  Layers,
  Network,
  Link2,
  Diamond,
  type LucideIcon,
} from 'lucide-react'

/* ── Color resolution ─────────────────────────────────────────────────────── */

function readVar(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
}

/** Map a NodeType → its semantic data-* CSS variable name. Exported so DOM
 *  components can inline `hsl(var(--data-x))` (theme-aware, no class-purge issues). */
export const DATA_CSS_VAR: Record<NodeType, string> = {
  graph_root: '--data-hub',
  token: '--data-token',
  allocation: '--data-allocation',
  vesting: '--data-vesting',
  emission: '--data-emission',
  risk_flag: '--data-risk',
  data_source: '--data-source',
  export_run: '--data-export',
  application: '--data-application',
  wallet: '--data-wallet',
  category: '--data-category',
  sector: '--data-sector',
  chain: '--data-chain',
  triple: '--data-triple',
  predicate: '--data-triple',
  literal: '--data-triple',
}

/** Static hex fallback (mirrors node-config.ts) for SSR / canvas init before a CSS read. */
const DATA_HEX: Record<NodeType, string> = {
  graph_root: '#6366f1',
  token: '#8b5cf6',
  allocation: '#f59e0b',
  vesting: '#10b981',
  emission: '#ef4444',
  risk_flag: '#f97316',
  data_source: '#3b82f6',
  export_run: '#14b8a6',
  application: '#0f766e',
  wallet: '#64748b',
  category: '#64748b',
  sector: '#a855f7',
  chain: '#0ea5e9',
  triple: '#94a3b8',
  predicate: '#94a3b8',
  literal: '#94a3b8',
}

/** GRAPH SPACE — node type → resolved color (theme-aware, with hex fallback). */
export function getDataColor(type: NodeType): string {
  const v = readVar(DATA_CSS_VAR[type])
  return v ? `hsl(${v})` : DATA_HEX[type]
}

/** Apply an alpha channel to a color returned by the resolvers above
 *  (`hsl(H S% L%)` or `#rrggbb`). Canvas-safe output. */
export function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('hsl(')) {
    return color.replace(/\)$/, ` / ${alpha})`)
  }
  if (color.startsWith('#') && color.length === 7) {
    const a = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')
    return `${color}${a}`
  }
  return color
}

/** Brand gradient stops (primary → secondary) for canvas gradients — the
 *  canvas counterpart of `var(--gradient-brand)`. Theme-aware, hex fallback. */
export function getBrandGradientStops(): [string, string] {
  const p = readVar('--primary')
  const s = readVar('--secondary')
  return [p ? `hsl(${p})` : '#6366f1', s ? `hsl(${s})` : '#8b5cf6']
}

/** On-chain publication status → tone token. DOM inlines
 *  `hsl(var(STATUS_TONE_CSS_VAR[s]))`; canvas resolves via getStatusToneColor. */
export const STATUS_TONE_CSS_VAR = {
  confirmed: '--success',
  failed: '--destructive',
  submitted: '--warning',
  pending: '--muted-foreground',
} as const

export type StatusTone = keyof typeof STATUS_TONE_CSS_VAR

const STATUS_TONE_HEX: Record<StatusTone, string> = {
  confirmed: '#10b981',
  failed: '#ef4444',
  submitted: '#f59e0b',
  pending: '#94a3b8',
}

export function getStatusToneColor(tone: StatusTone): string {
  const v = readVar(STATUS_TONE_CSS_VAR[tone])
  return v ? `hsl(${v})` : STATUS_TONE_HEX[tone]
}

/** Canvas chrome for the force graph: edges, labels, hub halo, font.
 *  Resolved from theme tokens so the canvas follows dark/light like the DOM.
 *  Re-call when `resolvedTheme` changes (getComputedStyle is not reactive). */
export interface GraphChrome {
  edge: string
  label: string
  labelAccent: string
  hubHalo: string
  fontFamily: string
}

export function getGraphChrome(): GraphChrome {
  const edge = readVar('--graph-edge')
  const label = readVar('--muted-foreground')
  const hub = readVar('--data-hub')
  const fontFamily =
    typeof document !== 'undefined'
      ? getComputedStyle(document.body).fontFamily || 'sans-serif'
      : 'sans-serif'
  return {
    edge: edge ? `hsl(${edge} / 0.55)` : 'rgba(148, 163, 184, 0.25)',
    label: label ? `hsl(${label})` : '#94a3b8',
    labelAccent: hub ? `hsl(${hub})` : '#6366f1',
    hubHalo: hub ? `hsl(${hub} / 0.15)` : 'rgba(99, 102, 241, 0.15)',
    fontFamily,
  }
}

/** CHART SPACE — allocation-segment palette. Relocated to the shared
 *  tokenomics domain library; re-exported here so this file remains the one
 *  public JS ↔ CSS bridge and existing importers stay untouched. */
export {
  CHART_CSS_VAR,
  chartColorsFor,
  getSegmentChartColor,
} from '@/lib/tokenomics/colors'

/* ── Chart space, numeric (canvas) ────────────────────────────────────────── */

/** Dark-theme values of the `--chart-*` tokens (defaultTheme is dark), for SSR
 *  and for the first canvas paint before a CSS read can happen. Mirrors
 *  src/app/globals.css — keep in sync. */
const CHART_HSL_FALLBACK: Record<SegmentType, [number, number, number]> = {
  'funding-private': [217, 91, 60],
  'funding-public': [271, 91, 65],
  'team-founders': [330, 81, 60],
  treasury: [25, 95, 53],
  marketing: [142, 71, 45],
  airdrop: [84, 74, 48],
  rewards: [48, 92, 50],
  liquidity: [189, 90, 48],
}

const NEUTRAL_HSL: [number, number, number] = [240, 5, 68] // --muted-foreground, dark

function readRgbVar(cssVar: string, fallback: [number, number, number]): Rgb {
  return parseHslTriplet(readVar(cssVar)) ?? hslToRgb(...fallback)
}

/** The "no data" grey — same token the muted DOM text uses. */
export const getNeutralRgb = (): Rgb =>
  readRgbVar('--muted-foreground', NEUTRAL_HSL)

/**
 * CHART SPACE for canvas — the numeric twin of {@link getSegmentChartColor}.
 * Same token, same OKLab ramp, resolved to literal channels because a canvas
 * cannot parse `hsl(var(…))` or `color-mix(…)`.
 *
 * Not reactive: getComputedStyle isn't. Re-call when `resolvedTheme` changes.
 */
export function getSegmentChartRgb(segmentType: string, occurrence = 0): Rgb {
  const cssVar = chartVarFor(segmentType, occurrence)
  const key = cssVar.replace('--chart-', '') as SegmentType
  const base = readRgbVar(cssVar, CHART_HSL_FALLBACK[key])
  // Unknown custom types spread via the palette rotation, not the ramp — so
  // only ramp a type the palette actually names (mirrors getSegmentChartColor).
  const step = segmentType in CHART_CSS_VAR ? rampStepFor(occurrence) : null
  if (!step) return base
  return mixOklab(
    base,
    step.toward === 'white' ? WHITE : BLACK,
    step.share / 100,
  )
}

/** GRAPH SPACE for canvas — the numeric twin of {@link getDataColor}. Lets a
 *  dither chart paint the emission series in the same hue the graph gives an
 *  emission node. Re-call on theme change. */
export function getDataRgb(type: NodeType): Rgb {
  return (
    parseHslTriplet(readVar(DATA_CSS_VAR[type])) ??
    hexToRgb(DATA_HEX[type]) ?? [148, 163, 184]
  )
}

/** Any other theme token, for a canvas that needs one outside the two palettes
 *  (`--primary` under an envelope, `--data-supply` on a circulating bar). The
 *  fallback is what SSR and the first paint use, before a CSS read is possible;
 *  it takes either a hex or the bare HSL triplet the tokens are written in, so
 *  a caller can paste the value straight out of globals.css. */
export function getTokenRgb(cssVar: string, fallback: string): Rgb {
  return (
    parseHslTriplet(readVar(cssVar)) ??
    parseHslTriplet(fallback) ??
    hexToRgb(fallback) ?? [148, 163, 184]
  )
}

/** Canvas colors for a rendered segment list — the numeric twin of
 *  {@link chartColorsFor}, counting per-type occurrences the same way so both
 *  renderers agree slice for slice. */
export function chartRgbFor(segmentTypes: readonly string[]): Rgb[] {
  const seen = new Map<string, number>()
  return segmentTypes.map((t) => {
    const n = seen.get(t) ?? 0
    seen.set(t, n + 1)
    return getSegmentChartRgb(t, n)
  })
}

/* ── Glyph & icon taxonomy (non-color cue — AA requirement) ───────────────── */

/** Shape per node family. Color never carries meaning alone. */
export type GlyphShape = 'ring' | 'circle' | 'diamond' | 'square'

export const FAMILY_GLYPH: Record<NodeFamily, GlyphShape> = {
  hub: 'ring',
  atom: 'circle',
  triple: 'diamond',
  source: 'square',
}

/** Lucide icon per node type (§5.2). */
export const NODE_ICON: Record<NodeType, LucideIcon> = {
  graph_root: Hexagon,
  token: Coins,
  allocation: PieChart,
  vesting: CalendarClock,
  emission: Flame,
  risk_flag: TriangleAlert,
  data_source: FileText,
  export_run: Share2,
  application: AppWindow,
  wallet: Wallet,
  category: Layers,
  sector: Network,
  chain: Link2,
  triple: Diamond,
  predicate: Diamond,
  literal: Diamond,
}

/** Tailwind text-color class per data category (DOM legends/badges). */
export const DATA_TEXT_CLASS: Record<NodeType, string> = {
  graph_root: 'text-data-hub',
  token: 'text-data-token',
  allocation: 'text-data-allocation',
  vesting: 'text-data-vesting',
  emission: 'text-data-emission',
  risk_flag: 'text-data-risk',
  data_source: 'text-data-source',
  export_run: 'text-data-export',
  application: 'text-data-application',
  wallet: 'text-data-wallet',
  category: 'text-data-category',
  sector: 'text-data-sector',
  chain: 'text-data-chain',
  triple: 'text-data-triple',
  predicate: 'text-data-triple',
  literal: 'text-data-triple',
}

/** Human-readable label per data category. */
export const DATA_LABEL: Record<NodeType, string> = {
  graph_root: 'TrustNomiks',
  token: 'Token',
  allocation: 'Allocation',
  vesting: 'Vesting',
  emission: 'Emission',
  risk_flag: 'Risk',
  data_source: 'Source',
  export_run: 'Export',
  application: 'Application',
  wallet: 'Wallet',
  category: 'Category',
  sector: 'Sector',
  chain: 'Chain',
  triple: 'Triple',
  predicate: 'Predicate',
  literal: 'Literal',
}
