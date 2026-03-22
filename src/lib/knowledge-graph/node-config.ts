import type { NodeType } from './graph-types'

export interface NodeVisualConfig {
  color: string
  size: number
  label: string
}

export const NODE_CONFIG: Record<NodeType, NodeVisualConfig> = {
  // Hub
  graph_root:  { color: '#6366f1', size: 18, label: 'TrustNomiks' },  // indigo, largest

  // Atom family — domain entities
  token:       { color: '#8b5cf6', size: 12, label: 'Token'       },  // violet
  allocation:  { color: '#f59e0b', size: 7,  label: 'Allocation'  },  // amber
  vesting:     { color: '#10b981', size: 5,  label: 'Vesting'     },  // emerald
  emission:    { color: '#ef4444', size: 7,  label: 'Emission'    },  // red
  risk_flag:   { color: '#f97316', size: 6,  label: 'Risk Flag'   },  // orange
  data_source: { color: '#3b82f6', size: 6,  label: 'Source'      },  // blue
  category:    { color: '#64748b', size: 8,  label: 'Category'    },  // slate
  sector:      { color: '#a855f7', size: 6,  label: 'Sector'      },  // purple
  chain:       { color: '#0ea5e9', size: 6,  label: 'Chain'       },  // sky

  // Triple family — reified relationships
  triple:      { color: '#94a3b8', size: 3,  label: 'Triple'      },  // slate-400, small
}
