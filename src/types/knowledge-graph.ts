import type { GraphNode, GraphEdge } from '@/lib/knowledge-graph/graph-types'

// ── API query params ─────────────────────────────────────────────────────────

export interface KnowledgeGraphParams {
  scope: 'global' | 'token'
  tokenIds?: string[]
  includeSources?: boolean   // default true
  includeTaxonomy?: boolean  // default true — category, sector, chain
  includeLiterals?: boolean  // default false
}

// ── API response ─────────────────────────────────────────────────────────────

export interface KnowledgeGraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta: {
    totalTokens: number
    totalNodes: number
    totalEdges: number
  }
}
