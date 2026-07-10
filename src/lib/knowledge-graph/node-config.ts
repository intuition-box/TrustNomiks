import type { NodeType } from './graph-types'

/**
 * Geometry and labels only. Colors live in the design-token bridge
 * (`src/lib/design/tokens.ts`): canvas resolves via `getDataColor(type)`,
 * DOM inlines `hsl(var(DATA_CSS_VAR[type]))` — both theme-aware.
 */
export interface NodeVisualConfig {
  size: number
  label: string
}

export const NODE_CONFIG: Record<NodeType, NodeVisualConfig> = {
  // Hub
  graph_root: { size: 18, label: 'TrustNomiks' }, // largest

  // Atom family — domain entities
  token: { size: 12, label: 'Token' },
  allocation: { size: 7, label: 'Allocation' },
  vesting: { size: 5, label: 'Vesting' },
  emission: { size: 7, label: 'Emission' },
  risk_flag: { size: 6, label: 'Risk Flag' },
  data_source: { size: 6, label: 'Source' },
  export_run: { size: 10, label: 'Export Run' },
  application: { size: 9, label: 'Application' },
  wallet: { size: 6, label: 'Wallet' },
  category: { size: 8, label: 'Category' },
  sector: { size: 6, label: 'Sector' },
  chain: { size: 6, label: 'Chain' },

  // Triple family — reified relationships
  triple: { size: 3, label: 'Triple' }, // small, recessive

  // On-chain-only atom types — surfaced in the run drill-down when not confirmed
  predicate: { size: 4, label: 'Predicate' },
  literal: { size: 4, label: 'Literal' },
}
