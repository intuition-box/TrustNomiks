/**
 * Builds a semantic knowledge graph from canonical SQL view data.
 *
 * Three node families:
 *   atom   — domain entities (tokens, allocations, vestings…)
 *   triple — reified relationships (first-class triple nodes)
 *   source — provenance (data sources)
 * Plus the synthetic graph_root hub node.
 *
 * Edges use semantic predicates:
 *   subject_of       — triple → its subject atom
 *   object_of        — triple → its object atom (structural triples only)
 *   justified_by     — triple → source atom (provenance, claim_group level)
 *   belongs_to_graph — token atom → graph root
 */

import type {
  GraphNode,
  GraphEdge,
  CanonicalAtom,
  CanonicalTriple,
  CanonicalSource,
  NodeType,
} from './graph-types'
import { NODE_FAMILY_MAP } from './graph-types'

// ── Constants ────────────────────────────────────────────────────────────────

export const HUB_NODE_ID = 'graph:trustnomiks'

const ATOM_TYPE_MAP: Record<string, NodeType> = {
  token:       'token',
  allocation:  'allocation',
  vesting:     'vesting',
  emission:    'emission',
  data_source: 'data_source',
  risk_flag:   'risk_flag',
  category:    'category',
  sector:      'sector',
  chain:       'chain',
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface BuildGraphOptions {
  includeSources?: boolean    // default true
  includeLiterals?: boolean   // default false — literal triples shown on focus/detail
}

// ── Main builder ─────────────────────────────────────────────────────────────

export function buildGraph(
  atoms: CanonicalAtom[],
  triples: CanonicalTriple[],
  claimSources: CanonicalSource[],
  options: BuildGraphOptions = {},
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const { includeSources = true, includeLiterals = false } = options

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIds = new Set<string>()

  // ── 1. Hub node ────────────────────────────────────────────────────────

  nodes.push({
    id: HUB_NODE_ID,
    label: 'TrustNomiks',
    type: 'graph_root',
    family: 'hub',
    isLiteral: false,
    metadata: {},
  })
  nodeIds.add(HUB_NODE_ID)

  // ── 2. Atom nodes ─────────────────────────────────────────────────────

  for (const atom of atoms) {
    const nodeType = ATOM_TYPE_MAP[atom.atom_type]
    if (!nodeType) continue
    if (!includeSources && nodeType === 'data_source') continue
    if (nodeIds.has(atom.atom_id)) continue
    nodeIds.add(atom.atom_id)

    nodes.push({
      id: atom.atom_id,
      label: atom.label || atom.atom_id,
      type: nodeType,
      family: NODE_FAMILY_MAP[nodeType],
      tokenId: atom.token_id ?? undefined,
      isLiteral: false,
      metadata: (atom.metadata as Record<string, unknown>) ?? {},
    })

    if (nodeType === 'token') {
      edges.push({
        id: `${atom.atom_id}--belongs_to_graph--${HUB_NODE_ID}`,
        source: atom.atom_id,
        target: HUB_NODE_ID,
        predicate: 'belongs_to_graph',
        label: 'belongs to',
      })
    }
  }

  // ── 3. Triple nodes (reified) ─────────────────────────────────────────
  // Structural triples: object_id is not null → always included.
  // Literal triples: object_literal is not null → only if includeLiterals.

  for (const triple of triples) {
    const isStructural = triple.object_id !== null
    const isLiteralTriple = !isStructural && triple.object_literal !== null

    // Filter decisions
    if (isLiteralTriple && !includeLiterals) continue
    if (!includeSources && triple.object_id?.startsWith('atom:source:')) continue
    if (!nodeIds.has(triple.subject_id)) continue
    if (triple.object_id && !nodeIds.has(triple.object_id)) continue

    if (!nodeIds.has(triple.triple_id)) {
      nodeIds.add(triple.triple_id)

      nodes.push({
        id: triple.triple_id,
        label: triple.predicate,
        type: 'triple',
        family: 'triple',
        tokenId: triple.token_id,
        isLiteral: isLiteralTriple,
        metadata: {
          predicate: triple.predicate,
          subject_id: triple.subject_id,
          object_id: triple.object_id,
          object_literal: triple.object_literal,
          claim_group: triple.claim_group,
          origin_table: triple.origin_table,
          origin_row_id: triple.origin_row_id,
        },
      })
    }

    // subject_of: triple → subject atom
    edges.push({
      id: `${triple.triple_id}--subject_of--${triple.subject_id}`,
      source: triple.triple_id,
      target: triple.subject_id,
      predicate: 'subject_of',
      label: 'subject',
    })

    // object_of: triple → object atom (structural only)
    if (triple.object_id && nodeIds.has(triple.object_id)) {
      edges.push({
        id: `${triple.triple_id}--object_of--${triple.object_id}`,
        source: triple.triple_id,
        target: triple.object_id,
        predicate: 'object_of',
        label: 'object',
      })
    }
  }

  // ── 4. Provenance: source → triple nodes ──────────────────────────────
  // claim_sources carry claim_type + optional claim_id.
  // We match them to triple nodes via claim_group + origin_row_id.

  if (includeSources) {
    // Index triple nodes by claim_group + origin_row_id for fast lookup
    const triplesByClaimKey = new Map<string, string[]>()
    // Also index by claim_group + token_id as fallback
    const triplesByGroupToken = new Map<string, string[]>()

    for (const node of nodes) {
      if (node.type !== 'triple') continue
      const meta = node.metadata
      const cg = meta.claim_group as string | null
      const rowId = meta.origin_row_id as string | null
      const tid = node.tokenId

      if (cg && rowId) {
        const key = `${cg}:${rowId}`
        const arr = triplesByClaimKey.get(key)
        if (arr) arr.push(node.id); else triplesByClaimKey.set(key, [node.id])
      }
      if (cg && tid) {
        const key = `${cg}:${tid}`
        const arr = triplesByGroupToken.get(key)
        if (arr) arr.push(node.id); else triplesByGroupToken.set(key, [node.id])
      }
    }

    const seenProvEdges = new Set<string>()

    for (const cs of claimSources) {
      if (!nodeIds.has(cs.source_atom_id)) continue

      // Try specific match: claim_type + claim_id → triple with matching claim_group + origin_row_id
      let targetTripleIds: string[] = []
      if (cs.claim_id) {
        targetTripleIds = triplesByClaimKey.get(`${cs.claim_type}:${cs.claim_id}`) ?? []
      }

      // Fallback: claim_type + token_id → all triples of that claim_group for that token
      if (targetTripleIds.length === 0) {
        targetTripleIds = triplesByGroupToken.get(`${cs.claim_type}:${cs.token_id}`) ?? []
      }

      for (const tripleId of targetTripleIds) {
        const edgeId = `${cs.source_atom_id}--justified_by--${tripleId}`
        if (seenProvEdges.has(edgeId)) continue
        seenProvEdges.add(edgeId)

        edges.push({
          id: edgeId,
          source: cs.source_atom_id,
          target: tripleId,
          predicate: 'justified_by',
          label: `attests ${cs.claim_type}`,
        })
      }
    }
  }

  // ── 5. Prune orphan taxonomy atoms ──────────────────────────────────
  // Taxonomy atoms (category, sector, chain) have no token_id.
  // Remove any that aren't referenced by at least one edge.

  const TAXONOMY_TYPES: Set<NodeType> = new Set(['category', 'sector', 'chain'])
  const referencedIds = new Set<string>()
  for (const e of edges) {
    referencedIds.add(e.source)
    referencedIds.add(e.target)
  }

  const prunedNodes = nodes.filter((n) => {
    if (!TAXONOMY_TYPES.has(n.type)) return true
    return referencedIds.has(n.id)
  })

  return { nodes: prunedNodes, edges }
}
