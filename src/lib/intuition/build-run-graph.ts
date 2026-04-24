/**
 * Builds a visual graph from the on-chain state of a single publish run.
 *
 * Inputs are the persisted mapping rows from Supabase (atom / claim / provenance)
 * joined with canonical entries from kg_atoms_v1 / kg_triples_v1 for label
 * resolution. The output is a {nodes, edges} shape compatible with the existing
 * <GraphCanvas> renderer, enriched with a `metadata.onChain` field carrying the
 * on-chain identifiers and publication status.
 *
 * Design choices:
 *  - Predicate + literal atoms are NOT rendered as standalone nodes — they are
 *    folded into the metadata of their dependent triple node. This keeps the
 *    graph readable; their counts are still exposed via `counts.atoms` so the
 *    UI can surface failures at aggregate level.
 *  - Provenance is rendered as its own triple node (label "based_on") with
 *    subject/object edges, because on-chain it *is* a triple. This lets the
 *    same status-color rendering logic apply uniformly.
 *  - Status filtering / coloring is a render-time concern — this builder emits
 *    every mapping row (confirmed, failed, skipped, pending) and exposes
 *    `metadata.onChain.status` so the canvas can color accordingly.
 */

import type { GraphNode, GraphEdge, NodeType } from '@/lib/knowledge-graph/graph-types'
import { NODE_FAMILY_MAP } from '@/lib/knowledge-graph/graph-types'
import { HUB_NODE_ID } from '@/lib/knowledge-graph/build-graph'
import type {
  RunDetailMeta,
  RunAtomMappingRow,
  RunClaimMappingRow,
  RunProvenanceMappingRow,
  RunDetailResponse,
} from '@/types/intuition'
import type { PublishStatus } from './types'

export interface OnChainMeta {
  termId: string | null
  txHash: string | null
  status: PublishStatus
  errorMessage: string | null
}

export interface BuildRunGraphInput {
  run: RunDetailMeta
  atomMappings: RunAtomMappingRow[]
  claimMappings: RunClaimMappingRow[]
  provenanceMappings: RunProvenanceMappingRow[]
  canonicalAtoms: RunDetailResponse['canonicalAtoms']
  canonicalTriples: RunDetailResponse['canonicalTriples']
}

export type StatusCounts = Record<PublishStatus, number>

export interface BuildRunGraphResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  counts: {
    atoms: StatusCounts
    triples: StatusCounts
    provenance: StatusCounts
  }
}

const ATOM_TYPE_TO_NODE_TYPE: Record<string, NodeType> = {
  token: 'token',
  allocation: 'allocation',
  vesting: 'vesting',
  emission: 'emission',
  data_source: 'data_source',
  risk_flag: 'risk_flag',
  category: 'category',
  sector: 'sector',
  chain: 'chain',
  predicate: 'predicate',
  literal: 'literal',
}

/**
 * Atom types that exist on-chain but are implementation details.
 * When they are `confirmed`, they are folded into triple metadata (not rendered as
 * standalone nodes) to keep the graph readable. When they fail / are pending, they
 * ARE rendered so the user can see exactly what went wrong on-chain.
 */
const INTERNAL_ATOM_TYPES = new Set(['predicate', 'literal'])

export function buildRunGraph(input: BuildRunGraphInput): BuildRunGraphResult {
  const {
    run,
    atomMappings,
    claimMappings,
    provenanceMappings,
    canonicalAtoms,
    canonicalTriples,
  } = input

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const nodeIds = new Set<string>()

  const counts: BuildRunGraphResult['counts'] = {
    atoms: emptyStatusCounts(),
    triples: emptyStatusCounts(),
    provenance: emptyStatusCounts(),
  }

  const canonicalAtomsById = new Map(canonicalAtoms.map((a) => [a.atom_id, a]))
  const canonicalTriplesById = new Map(canonicalTriples.map((t) => [t.triple_id, t]))
  const atomByAtomId = new Map(atomMappings.map((a) => [a.atomId, a]))

  // term_id → atom_id lookup. Comparisons are case-insensitive because
  // hex-encoded bytes32 values may be stored with either casing.
  const termIdToAtomId = new Map<string, string>()
  for (const am of atomMappings) {
    if (am.termId) termIdToAtomId.set(am.termId.toLowerCase(), am.atomId)
  }

  // ── 1. Hub node ──────────────────────────────────────────────────────────
  nodes.push({
    id: HUB_NODE_ID,
    label: 'TrustNomiks',
    type: 'graph_root',
    family: 'hub',
    isLiteral: false,
    metadata: {},
  })
  nodeIds.add(HUB_NODE_ID)

  const tokenAtomId = `atom:token:${run.tokenId}`

  // ── 2. Atom nodes (all statuses) ─────────────────────────────────────────
  for (const am of atomMappings) {
    bumpCount(counts.atoms, am.status)

    // Hide internal atoms (predicate / literal) ONLY when confirmed —
    // on the happy path they are noise, but failures must stay visible.
    if (INTERNAL_ATOM_TYPES.has(am.atomType) && am.status === 'confirmed') continue

    const nodeType = ATOM_TYPE_TO_NODE_TYPE[am.atomType]
    if (!nodeType) continue
    if (nodeIds.has(am.atomId)) continue

    const canonical = canonicalAtomsById.get(am.atomId)

    nodes.push({
      id: am.atomId,
      label: canonical?.label ?? am.normalizedData,
      type: nodeType,
      family: NODE_FAMILY_MAP[nodeType],
      tokenId: canonical?.token_id ?? undefined,
      isLiteral: false,
      metadata: {
        ...(canonical?.metadata ?? {}),
        normalizedData: am.normalizedData,
        onChain: toOnChainMeta(am),
      },
    })
    nodeIds.add(am.atomId)

    if (nodeType === 'token' && am.atomId === tokenAtomId) {
      edges.push({
        id: `${am.atomId}--belongs_to_graph--${HUB_NODE_ID}`,
        source: am.atomId,
        target: HUB_NODE_ID,
        predicate: 'belongs_to_graph',
        label: 'belongs to',
      })
    }
  }

  // ── 3. Triple (claim) nodes ──────────────────────────────────────────────
  for (const cm of claimMappings) {
    bumpCount(counts.triples, cm.status)

    const canonical = canonicalTriplesById.get(cm.tripleId)

    const subjectAtomId =
      canonical?.subject_id ?? termIdToAtomId.get(cm.subjectTermId.toLowerCase())
    const objectAtomId =
      canonical?.object_id ?? termIdToAtomId.get(cm.objectTermId.toLowerCase())

    const predicateAtomId = termIdToAtomId.get(cm.predicateTermId.toLowerCase())
    const predicateMapping = predicateAtomId ? atomByAtomId.get(predicateAtomId) : undefined
    const predicateLabel =
      canonical?.predicate ?? predicateMapping?.normalizedData ?? '(unknown predicate)'

    const objectMapping = objectAtomId ? atomByAtomId.get(objectAtomId) : undefined
    const isLiteralTriple =
      canonical?.object_id == null &&
      (canonical?.object_literal != null || objectMapping?.atomType === 'literal')
    const objectLiteralValue =
      canonical?.object_literal ??
      (objectMapping?.atomType === 'literal' ? objectMapping.normalizedData : null)

    if (!subjectAtomId || !nodeIds.has(subjectAtomId)) continue
    if (!isLiteralTriple && (!objectAtomId || !nodeIds.has(objectAtomId))) continue
    if (nodeIds.has(cm.tripleId)) continue
    nodeIds.add(cm.tripleId)

    nodes.push({
      id: cm.tripleId,
      label: predicateLabel,
      type: 'triple',
      family: 'triple',
      tokenId: run.tokenId,
      isLiteral: isLiteralTriple,
      metadata: {
        predicate: predicateLabel,
        subject_id: subjectAtomId,
        object_id: isLiteralTriple ? null : objectAtomId,
        object_literal: objectLiteralValue,
        claim_group: cm.claimGroup,
        origin_row_id: cm.originRowId,
        onChain: toOnChainMeta({
          termId: cm.tripleTermId,
          txHash: cm.txHash,
          status: cm.status,
          errorMessage: cm.errorMessage,
        }),
      },
    })

    edges.push({
      id: `${cm.tripleId}--subject_of--${subjectAtomId}`,
      source: cm.tripleId,
      target: subjectAtomId,
      predicate: 'subject_of',
      label: 'subject',
    })

    if (!isLiteralTriple && objectAtomId) {
      edges.push({
        id: `${cm.tripleId}--object_of--${objectAtomId}`,
        source: cm.tripleId,
        target: objectAtomId,
        predicate: 'object_of',
        label: 'object',
      })
    }
  }

  // ── 4. Provenance as triple nodes ────────────────────────────────────────
  for (const pm of provenanceMappings) {
    bumpCount(counts.provenance, pm.status)

    if (!nodeIds.has(pm.tripleId)) continue
    if (!nodeIds.has(pm.sourceAtomId)) continue

    const provNodeId = `provenance:${pm.tripleId}:${pm.sourceAtomId}`
    if (nodeIds.has(provNodeId)) continue
    nodeIds.add(provNodeId)

    nodes.push({
      id: provNodeId,
      label: 'based_on',
      type: 'triple',
      family: 'triple',
      tokenId: run.tokenId,
      isLiteral: false,
      metadata: {
        predicate: 'based_on',
        subject_id: pm.tripleId,
        object_id: pm.sourceAtomId,
        object_literal: null,
        claim_group: 'provenance',
        origin_row_id: null,
        isProvenance: true,
        onChain: toOnChainMeta({
          termId: pm.provenanceTripleTermId,
          txHash: pm.txHash,
          status: pm.status,
          errorMessage: pm.errorMessage,
        }),
      },
    })

    edges.push({
      id: `${provNodeId}--subject_of--${pm.tripleId}`,
      source: provNodeId,
      target: pm.tripleId,
      predicate: 'subject_of',
      label: 'subject',
    })
    edges.push({
      id: `${provNodeId}--object_of--${pm.sourceAtomId}`,
      source: provNodeId,
      target: pm.sourceAtomId,
      predicate: 'object_of',
      label: 'object',
    })
  }

  return { nodes, edges, counts }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyStatusCounts(): StatusCounts {
  return { pending: 0, submitted: 0, confirmed: 0, failed: 0 }
}

function bumpCount(counts: StatusCounts, status: PublishStatus) {
  counts[status] = (counts[status] ?? 0) + 1
}

function toOnChainMeta(source: {
  termId: string | null
  txHash: string | null
  status: PublishStatus
  errorMessage: string | null
}): OnChainMeta {
  return {
    termId: source.termId,
    txHash: source.txHash,
    status: source.status,
    errorMessage: source.errorMessage,
  }
}
