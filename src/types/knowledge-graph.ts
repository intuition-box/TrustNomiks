import type { GraphNode, GraphEdge } from '@/lib/knowledge-graph/graph-types'

// ── API query params ─────────────────────────────────────────────────────────

export interface KnowledgeGraphParams {
  scope: 'global' | 'token'
  tokenIds?: string[]
  includeSources?: boolean   // default true
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
