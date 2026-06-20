/**
 * Design tokens — the ONE bridge between JS ↔ CSS variables.
 *
 * Canvas (react-force-graph) and SVG (recharts) can't use Tailwind classes, so
 * they resolve colors here. DOM should prefer the Tailwind classes
 * (`bg-data-token`, `text-data-vesting`) — these resolvers exist for canvas/SVG.
 *
 * Same color = same concept, product-wide. See docs/redesign/03-design-tokens-taxonomy.md.
 */
import type { NodeType, NodeFamily } from '@/lib/knowledge-graph/graph-types'
import type { SegmentType } from '@/types/form'
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
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
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

/** CHART SPACE — allocation segment → color. Kept distinct from graph space. */
const SEGMENT_HEX: Record<SegmentType, string> = {
  'funding-private': '#3b82f6',
  'funding-public': '#a855f7',
  'team-founders': '#ec4899',
  'treasury': '#f97316',
  'marketing': '#22c55e',
  'airdrop': '#14b8a6',
  'rewards': '#6366f1',
  'liquidity': '#06b6d4',
}

export function getChartColor(segment: SegmentType): string {
  return SEGMENT_HEX[segment] ?? '#6366f1'
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
