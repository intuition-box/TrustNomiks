import { describe, expect, it } from 'vitest'
import { buildRunGraph, type BuildRunGraphInput } from './build-run-graph'
import type {
  RunDetailMeta,
  RunAtomMappingRow,
  RunClaimMappingRow,
  RunProvenanceMappingRow,
} from '@/types/intuition'
import { HUB_NODE_ID } from '@/lib/knowledge-graph/build-graph'

// ── Fixtures ────────────────────────────────────────────────────────────────

const TOKEN_ID = '00000000-0000-4000-8000-000000000001'
const SOURCE_ID = '00000000-0000-4000-8000-000000000002'

function makeRun(overrides: Partial<RunDetailMeta> = {}): RunDetailMeta {
  return {
    runId: 'run-1',
    tokenId: TOKEN_ID,
    tokenName: 'TestCoin',
    tokenTicker: 'TEST',
    walletAddress: '0x' + '1'.repeat(40),
    chainId: 13579,
    status: 'completed',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:05:00.000Z',
    isLegacy: false,
    ...overrides,
  }
}

function atomMapping(partial: Partial<RunAtomMappingRow> & Pick<RunAtomMappingRow, 'atomId' | 'atomType' | 'normalizedData'>): RunAtomMappingRow {
  return {
    termId: '0x' + 'a'.repeat(64),
    txHash: '0x' + 'b'.repeat(64),
    status: 'confirmed',
    errorMessage: null,
    ...partial,
  }
}

function claimMapping(
  partial: Partial<RunClaimMappingRow> &
    Pick<RunClaimMappingRow, 'tripleId' | 'subjectTermId' | 'predicateTermId' | 'objectTermId'>,
): RunClaimMappingRow {
  return {
    claimGroup: null,
    originRowId: null,
    tripleTermId: '0x' + 'c'.repeat(64),
    txHash: '0x' + 'd'.repeat(64),
    status: 'confirmed',
    errorMessage: null,
    ...partial,
  }
}

function provMapping(
  partial: Partial<RunProvenanceMappingRow> &
    Pick<RunProvenanceMappingRow, 'tripleId' | 'sourceAtomId'>,
): RunProvenanceMappingRow {
  return {
    provenanceTripleTermId: '0x' + 'e'.repeat(64),
    txHash: '0x' + 'f'.repeat(64),
    status: 'confirmed',
    errorMessage: null,
    ...partial,
  }
}

const TOKEN_TERM = '0x' + '10'.repeat(32)
const PRED_TERM = '0x' + '20'.repeat(32)
const LITERAL_TERM = '0x' + '30'.repeat(32)
const ALLOC_TERM = '0x' + '40'.repeat(32)
const STRUCT_PRED_TERM = '0x' + '50'.repeat(32)
const SOURCE_TERM = '0x' + '60'.repeat(32)
const BASED_ON_TERM = '0x' + '70'.repeat(32)

function baseInput(): BuildRunGraphInput {
  return {
    run: makeRun(),
    atomMappings: [],
    claimMappings: [],
    provenanceMappings: [],
    canonicalAtoms: [],
    canonicalTriples: [],
  }
}

// ── Cases ────────────────────────────────────────────────────────────────────

describe('buildRunGraph', () => {
  it('empty run → only the hub node, no edges', () => {
    const result = buildRunGraph(baseInput())

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe(HUB_NODE_ID)
    expect(result.edges).toHaveLength(0)
    expect(result.counts).toEqual({
      atoms: { pending: 0, submitted: 0, confirmed: 0, failed: 0 },
      triples: { pending: 0, submitted: 0, confirmed: 0, failed: 0 },
      provenance: { pending: 0, submitted: 0, confirmed: 0, failed: 0 },
    })
  })

  it('confirmed-only run with a literal triple renders token + triple, hub edge, onChain metadata', () => {
    const input: BuildRunGraphInput = {
      ...baseInput(),
      atomMappings: [
        atomMapping({
          atomId: `atom:token:${TOKEN_ID}`,
          atomType: 'token',
          normalizedData: `trustnomiks:token:${TOKEN_ID}`,
          termId: TOKEN_TERM,
        }),
        atomMapping({
          atomId: 'atom:predicate:has_name',
          atomType: 'predicate',
          normalizedData: 'has_name',
          termId: PRED_TERM,
        }),
        atomMapping({
          atomId: 'atom:literal:triple:has_name',
          atomType: 'literal',
          normalizedData: 'TestCoin',
          termId: LITERAL_TERM,
        }),
      ],
      claimMappings: [
        claimMapping({
          tripleId: `triple:${TOKEN_ID}:has_name`,
          subjectTermId: TOKEN_TERM,
          predicateTermId: PRED_TERM,
          objectTermId: LITERAL_TERM,
          claimGroup: 'token_identity',
          originRowId: TOKEN_ID,
        }),
      ],
      canonicalAtoms: [
        {
          atom_id: `atom:token:${TOKEN_ID}`,
          atom_type: 'token',
          label: 'TestCoin',
          token_id: TOKEN_ID,
          metadata: {},
        },
      ],
      canonicalTriples: [], // synthetic triple, not in kg_triples_v1
    }

    const result = buildRunGraph(input)

    // Hub + token + triple = 3 nodes (predicate + literal atoms folded into triple metadata)
    expect(result.nodes).toHaveLength(3)

    const tokenNode = result.nodes.find((n) => n.type === 'token')!
    expect(tokenNode.label).toBe('TestCoin')
    expect(tokenNode.metadata.onChain).toMatchObject({
      termId: TOKEN_TERM,
      status: 'confirmed',
    })

    const tripleNode = result.nodes.find((n) => n.type === 'triple')!
    expect(tripleNode.isLiteral).toBe(true)
    expect(tripleNode.label).toBe('has_name')
    expect(tripleNode.metadata.object_literal).toBe('TestCoin')
    expect(tripleNode.metadata.onChain).toMatchObject({ status: 'confirmed' })

    // Edges: token→hub (belongs_to_graph) + triple→token (subject_of)
    expect(result.edges).toHaveLength(2)
    expect(result.edges.map((e) => e.predicate).sort()).toEqual([
      'belongs_to_graph',
      'subject_of',
    ])

    expect(result.counts.atoms.confirmed).toBe(3)
    expect(result.counts.triples.confirmed).toBe(1)
    expect(result.counts.provenance).toEqual({ pending: 0, submitted: 0, confirmed: 0, failed: 0 })
  })

  it('mixed statuses: failed + skipped atoms tracked in counts, rendered nodes carry status', () => {
    const ALLOC_ATOM_ID = 'atom:alloc:xxx'
    const input: BuildRunGraphInput = {
      ...baseInput(),
      atomMappings: [
        atomMapping({
          atomId: `atom:token:${TOKEN_ID}`,
          atomType: 'token',
          normalizedData: `trustnomiks:token:${TOKEN_ID}`,
          termId: TOKEN_TERM,
          status: 'confirmed',
        }),
        atomMapping({
          atomId: ALLOC_ATOM_ID,
          atomType: 'allocation',
          normalizedData: 'trustnomiks:allocation:xxx',
          termId: ALLOC_TERM,
          status: 'failed',
          errorMessage: 'revert: out of gas',
        }),
        atomMapping({
          atomId: 'atom:predicate:has_allocation_segment',
          atomType: 'predicate',
          normalizedData: 'has_allocation_segment',
          termId: STRUCT_PRED_TERM,
          status: 'pending',
        }),
      ],
      claimMappings: [],
      provenanceMappings: [],
      canonicalAtoms: [],
      canonicalTriples: [],
    }

    const result = buildRunGraph(input)

    expect(result.counts.atoms).toEqual({ pending: 1, submitted: 0, confirmed: 1, failed: 1 })

    const allocNode = result.nodes.find((n) => n.id === ALLOC_ATOM_ID)!
    expect(allocNode.metadata.onChain).toMatchObject({
      status: 'failed',
      errorMessage: 'revert: out of gas',
    })

    // Non-confirmed predicate atoms must be rendered so failures stay visible.
    const predicateNode = result.nodes.find((n) => n.id === 'atom:predicate:has_allocation_segment')
    expect(predicateNode).toBeDefined()
    expect(predicateNode!.type).toBe('predicate')
    expect(predicateNode!.metadata.onChain).toMatchObject({ status: 'pending' })
  })

  it('confirmed predicate atoms remain hidden (noise) while failed ones are shown', () => {
    const input: BuildRunGraphInput = {
      ...baseInput(),
      atomMappings: [
        atomMapping({
          atomId: `atom:token:${TOKEN_ID}`,
          atomType: 'token',
          normalizedData: `trustnomiks:token:${TOKEN_ID}`,
          termId: TOKEN_TERM,
          status: 'confirmed',
        }),
        atomMapping({
          atomId: 'atom:predicate:has_name',
          atomType: 'predicate',
          normalizedData: 'has_name',
          termId: PRED_TERM,
          status: 'confirmed', // hidden
        }),
        atomMapping({
          atomId: 'atom:literal:triple:broken',
          atomType: 'literal',
          normalizedData: 'broken',
          termId: LITERAL_TERM,
          status: 'failed', // shown
        }),
      ],
      claimMappings: [],
      provenanceMappings: [],
      canonicalAtoms: [],
      canonicalTriples: [],
    }

    const result = buildRunGraph(input)

    expect(result.nodes.find((n) => n.id === 'atom:predicate:has_name')).toBeUndefined()
    const literalNode = result.nodes.find((n) => n.id === 'atom:literal:triple:broken')
    expect(literalNode).toBeDefined()
    expect(literalNode!.type).toBe('literal')
  })

  it('provenance generates a based_on triple node with edges to claim triple and source', () => {
    const CLAIM_TRIPLE_ID = `triple:${TOKEN_ID}:alloc1`
    const SOURCE_ATOM_ID = `atom:source:${SOURCE_ID}`

    const input: BuildRunGraphInput = {
      ...baseInput(),
      atomMappings: [
        atomMapping({
          atomId: `atom:token:${TOKEN_ID}`,
          atomType: 'token',
          normalizedData: `trustnomiks:token:${TOKEN_ID}`,
          termId: TOKEN_TERM,
        }),
        atomMapping({
          atomId: 'atom:alloc:x',
          atomType: 'allocation',
          normalizedData: 'trustnomiks:allocation:x',
          termId: ALLOC_TERM,
        }),
        atomMapping({
          atomId: 'atom:predicate:has_allocation_segment',
          atomType: 'predicate',
          normalizedData: 'has_allocation_segment',
          termId: STRUCT_PRED_TERM,
        }),
        atomMapping({
          atomId: SOURCE_ATOM_ID,
          atomType: 'data_source',
          normalizedData: 'trustnomiks:source:https://example.com',
          termId: SOURCE_TERM,
        }),
        atomMapping({
          atomId: 'atom:predicate:based_on',
          atomType: 'predicate',
          normalizedData: 'based_on',
          termId: BASED_ON_TERM,
        }),
      ],
      claimMappings: [
        claimMapping({
          tripleId: CLAIM_TRIPLE_ID,
          subjectTermId: TOKEN_TERM,
          predicateTermId: STRUCT_PRED_TERM,
          objectTermId: ALLOC_TERM,
          claimGroup: 'allocation_segments',
          originRowId: 'alloc-1',
          tripleTermId: '0x' + 'a1'.repeat(32),
        }),
      ],
      provenanceMappings: [
        provMapping({
          tripleId: CLAIM_TRIPLE_ID,
          sourceAtomId: SOURCE_ATOM_ID,
          provenanceTripleTermId: '0x' + 'f1'.repeat(32),
          status: 'confirmed',
        }),
      ],
      canonicalAtoms: [],
      canonicalTriples: [],
    }

    const result = buildRunGraph(input)

    const provNodeId = `provenance:${CLAIM_TRIPLE_ID}:${SOURCE_ATOM_ID}`
    const provNode = result.nodes.find((n) => n.id === provNodeId)
    expect(provNode).toBeDefined()
    expect(provNode!.label).toBe('based_on')
    expect(provNode!.type).toBe('triple')
    expect(provNode!.metadata.isProvenance).toBe(true)
    expect(provNode!.metadata.onChain).toMatchObject({ status: 'confirmed' })

    const provEdges = result.edges.filter((e) => e.source === provNodeId)
    expect(provEdges).toHaveLength(2)
    expect(provEdges.map((e) => e.predicate).sort()).toEqual(['object_of', 'subject_of'])
    expect(provEdges.find((e) => e.predicate === 'subject_of')!.target).toBe(CLAIM_TRIPLE_ID)
    expect(provEdges.find((e) => e.predicate === 'object_of')!.target).toBe(SOURCE_ATOM_ID)

    expect(result.counts.provenance.confirmed).toBe(1)
  })

  it('provenance is dropped when the claim triple node was skipped (orphan)', () => {
    // Claim triple present in claimMappings but its subject atom is missing → triple not rendered
    const input: BuildRunGraphInput = {
      ...baseInput(),
      atomMappings: [
        // note: no token atom → claim triple will be orphan-dropped
        atomMapping({
          atomId: 'atom:predicate:based_on',
          atomType: 'predicate',
          normalizedData: 'based_on',
          termId: BASED_ON_TERM,
        }),
      ],
      claimMappings: [
        claimMapping({
          tripleId: 'triple:orphan',
          subjectTermId: TOKEN_TERM, // no atom maps to this term
          predicateTermId: PRED_TERM,
          objectTermId: LITERAL_TERM,
        }),
      ],
      provenanceMappings: [
        provMapping({
          tripleId: 'triple:orphan',
          sourceAtomId: 'atom:source:x',
        }),
      ],
      canonicalAtoms: [],
      canonicalTriples: [],
    }

    const result = buildRunGraph(input)

    // Only hub node is rendered — everything else is orphan
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe(HUB_NODE_ID)

    // But counts still reflect the attempted items
    expect(result.counts.triples.confirmed).toBe(1)
    expect(result.counts.provenance.confirmed).toBe(1)
  })
})
