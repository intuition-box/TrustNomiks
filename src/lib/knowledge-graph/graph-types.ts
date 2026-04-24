// ── Node families ────────────────────────────────────────────────────────────
// Three semantic families as per the Intuition alignment:
//   atom   — domain entities (tokens, allocations, vestings…)
//   triple — reified relationships (first-class triple nodes)
//   source — provenance (data sources)
// Plus a synthetic family for the graph root.

export type NodeFamily = 'atom' | 'triple' | 'source' | 'hub'

// ── Node types ──────────────────────────────────────────────────────────────

export type AtomType =
  | 'token'
  | 'allocation'
  | 'vesting'
  | 'emission'
  | 'risk_flag'
  | 'data_source'
  | 'category'
  | 'sector'
  | 'chain'
  | 'predicate' // on-chain-only: rendered in the run drill-down when not confirmed
  | 'literal'   // on-chain-only: rendered in the run drill-down when not confirmed

export type NodeType = AtomType | 'triple' | 'graph_root'

export const NODE_FAMILY_MAP: Record<NodeType, NodeFamily> = {
  token:       'atom',
  allocation:  'atom',
  vesting:     'atom',
  emission:    'atom',
  risk_flag:   'atom',
  data_source: 'source',
  category:    'atom',
  sector:      'atom',
  chain:       'atom',
  predicate:   'atom',
  literal:     'atom',
  triple:      'triple',
  graph_root:  'hub',
}

// ── Graph primitives ────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  label: string
  type: NodeType
  family: NodeFamily
  tokenId?: string
  isLiteral: boolean
  metadata: Record<string, unknown>
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  predicate: string
  label: string
}

// ── Canonical types (from SQL views) ────────────────────────────────────────

export interface CanonicalAtom {
  atom_id: string
  atom_type: string
  label: string
  token_id: string | null
  metadata: Record<string, unknown>
}

export interface CanonicalTriple {
  triple_id: string
  subject_id: string
  predicate: string
  object_id: string | null
  object_literal: string | null
  token_id: string
  claim_group: string | null
  origin_table: string | null
  origin_row_id: string | null
}

export interface CanonicalSource {
  claim_source_id: string
  source_atom_id: string
  claim_type: string
  claim_id: string | null
  token_id: string
}
