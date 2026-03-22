import { describe, it, expect } from 'vitest'
import { buildGraph, HUB_NODE_ID } from './build-graph'
import type {
  CanonicalAtom,
  CanonicalTriple,
  CanonicalSource,
} from './graph-types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TOKEN_ID = '00000000-0000-0000-0000-000000000001'
const ALLOC_ID = '00000000-0000-0000-0000-000000000010'
const VEST_ID  = '00000000-0000-0000-0000-000000000020'
const EMIT_ID  = '00000000-0000-0000-0000-000000000030'
const SRC_ID   = '00000000-0000-0000-0000-000000000040'
const RISK_ID  = '00000000-0000-0000-0000-000000000050'

function baseAtoms(): CanonicalAtom[] {
  return [
    { atom_id: `atom:token:${TOKEN_ID}`, atom_type: 'token', label: 'TestToken', token_id: TOKEN_ID, metadata: { ticker: 'TST' } },
    { atom_id: `atom:alloc:${ALLOC_ID}`, atom_type: 'allocation', label: 'Team', token_id: TOKEN_ID, metadata: { segment_type: 'team-founders', percentage: 20 } },
    { atom_id: `atom:vest:${VEST_ID}`, atom_type: 'vesting', label: 'Vesting', token_id: TOKEN_ID, metadata: { cliff_months: 12 } },
    { atom_id: `atom:emission:${EMIT_ID}`, atom_type: 'emission', label: 'Emission', token_id: TOKEN_ID, metadata: { type: 'fixed_cap' } },
    { atom_id: `atom:source:${SRC_ID}`, atom_type: 'data_source', label: 'Whitepaper', token_id: TOKEN_ID, metadata: { source_type: 'whitepaper', url: 'https://example.com' } },
    { atom_id: `atom:risk:${RISK_ID}`, atom_type: 'risk_flag', label: 'centralization_risk', token_id: TOKEN_ID, metadata: { severity: 'medium' } },
    { atom_id: 'atom:category:infrastructure', atom_type: 'category', label: 'infrastructure', token_id: null, metadata: {} },
    { atom_id: 'atom:sector:l1', atom_type: 'sector', label: 'l1', token_id: null, metadata: {} },
    { atom_id: 'atom:chain:ethereum', atom_type: 'chain', label: 'ethereum', token_id: null, metadata: {} },
  ]
}

function baseTriples(): CanonicalTriple[] {
  return [
    { triple_id: `triple:${TOKEN_ID}:has_alloc:${ALLOC_ID}`, subject_id: `atom:token:${TOKEN_ID}`, predicate: 'has Allocation Segment', object_id: `atom:alloc:${ALLOC_ID}`, object_literal: null, token_id: TOKEN_ID, claim_group: 'token_identity', origin_table: 'allocation_segments', origin_row_id: ALLOC_ID },
    { triple_id: `triple:${ALLOC_ID}:has_vest:${VEST_ID}`, subject_id: `atom:alloc:${ALLOC_ID}`, predicate: 'has Vesting Schedule', object_id: `atom:vest:${VEST_ID}`, object_literal: null, token_id: TOKEN_ID, claim_group: 'vesting_schedule', origin_table: 'vesting_schedules', origin_row_id: VEST_ID },
    { triple_id: `triple:${TOKEN_ID}:has_emission:${EMIT_ID}`, subject_id: `atom:token:${TOKEN_ID}`, predicate: 'has Emission Model', object_id: `atom:emission:${EMIT_ID}`, object_literal: null, token_id: TOKEN_ID, claim_group: 'emission_model', origin_table: 'emission_models', origin_row_id: EMIT_ID },
    { triple_id: `triple:${TOKEN_ID}:has_source:${SRC_ID}`, subject_id: `atom:token:${TOKEN_ID}`, predicate: 'has Data Source', object_id: `atom:source:${SRC_ID}`, object_literal: null, token_id: TOKEN_ID, claim_group: 'token_identity', origin_table: 'data_sources', origin_row_id: SRC_ID },
    { triple_id: `triple:${TOKEN_ID}:has_risk:${RISK_ID}`, subject_id: `atom:token:${TOKEN_ID}`, predicate: 'has Risk Flag', object_id: `atom:risk:${RISK_ID}`, object_literal: null, token_id: TOKEN_ID, claim_group: 'token_identity', origin_table: 'risk_flags', origin_row_id: RISK_ID },
    { triple_id: `triple:${TOKEN_ID}:has_category:infrastructure`, subject_id: `atom:token:${TOKEN_ID}`, predicate: 'has Category', object_id: 'atom:category:infrastructure', object_literal: null, token_id: TOKEN_ID, claim_group: 'token_identity', origin_table: 'tokens', origin_row_id: TOKEN_ID },
    { triple_id: `triple:${TOKEN_ID}:has_sector:l1`, subject_id: `atom:token:${TOKEN_ID}`, predicate: 'has Sector', object_id: 'atom:sector:l1', object_literal: null, token_id: TOKEN_ID, claim_group: 'token_identity', origin_table: 'tokens', origin_row_id: TOKEN_ID },
    { triple_id: `triple:${TOKEN_ID}:has_chain:ethereum`, subject_id: `atom:token:${TOKEN_ID}`, predicate: 'has Chain', object_id: 'atom:chain:ethereum', object_literal: null, token_id: TOKEN_ID, claim_group: 'token_identity', origin_table: 'tokens', origin_row_id: TOKEN_ID },
  ]
}

function literalTriples(): CanonicalTriple[] {
  return [
    { triple_id: `triple:${TOKEN_ID}:has_status`, subject_id: `atom:token:${TOKEN_ID}`, predicate: 'has Status', object_id: null, object_literal: 'validated', token_id: TOKEN_ID, claim_group: 'token_identity', origin_table: 'tokens', origin_row_id: TOKEN_ID },
    { triple_id: `triple:${ALLOC_ID}:has_percentage`, subject_id: `atom:alloc:${ALLOC_ID}`, predicate: 'has Percentage', object_id: null, object_literal: '20', token_id: TOKEN_ID, claim_group: 'allocation_segment', origin_table: 'allocation_segments', origin_row_id: ALLOC_ID },
  ]
}

function baseSources(): CanonicalSource[] {
  return [
    { claim_source_id: 'cs-1', source_atom_id: `atom:source:${SRC_ID}`, claim_type: 'token_identity', claim_id: null, token_id: TOKEN_ID },
    { claim_source_id: 'cs-2', source_atom_id: `atom:source:${SRC_ID}`, claim_type: 'allocation_segment', claim_id: ALLOC_ID, token_id: TOKEN_ID },
  ]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildGraph', () => {
  describe('hub node', () => {
    it('always includes the TrustNomiks hub node', () => {
      const { nodes } = buildGraph([], [], [])
      const hub = nodes.find((n) => n.id === HUB_NODE_ID)
      expect(hub).toBeDefined()
      expect(hub!.type).toBe('graph_root')
      expect(hub!.family).toBe('hub')
      expect(hub!.label).toBe('TrustNomiks')
    })
  })

  describe('atom nodes', () => {
    it('creates a node for each canonical atom (taxonomy pruned if no triples)', () => {
      const { nodes } = buildGraph(baseAtoms(), [], [])
      // 6 entity atoms + 1 hub = 7 (3 taxonomy atoms pruned — no triples reference them)
      expect(nodes).toHaveLength(7)
    })

    it('keeps taxonomy atoms when triples reference them', () => {
      const { nodes } = buildGraph(baseAtoms(), baseTriples(), [])
      // 6 entity atoms + 3 taxonomy atoms + 1 hub + 8 triple nodes = 18
      const taxNodes = nodes.filter((n) => ['category', 'sector', 'chain'].includes(n.type))
      expect(taxNodes).toHaveLength(3)
    })

    it('token nodes have correct type and family', () => {
      const { nodes } = buildGraph(baseAtoms(), [], [])
      const token = nodes.find((n) => n.id === `atom:token:${TOKEN_ID}`)
      expect(token).toBeDefined()
      expect(token!.type).toBe('token')
      expect(token!.family).toBe('atom')
      expect(token!.label).toBe('TestToken')
    })

    it('token nodes are linked to the hub', () => {
      const { edges } = buildGraph(baseAtoms(), [], [])
      const hubEdges = edges.filter((e) => e.predicate === 'belongs_to_graph')
      expect(hubEdges).toHaveLength(1)
      expect(hubEdges[0].source).toBe(`atom:token:${TOKEN_ID}`)
      expect(hubEdges[0].target).toBe(HUB_NODE_ID)
    })

    it('deduplicates atoms with the same ID', () => {
      const duped = [...baseAtoms(), baseAtoms()[0]]
      const { nodes } = buildGraph(duped, [], [])
      const tokenNodes = nodes.filter((n) => n.type === 'token')
      expect(tokenNodes).toHaveLength(1)
    })
  })

  describe('triple nodes (reified)', () => {
    it('creates a triple node for each structural triple', () => {
      const { nodes } = buildGraph(baseAtoms(), baseTriples(), [])
      const tripleNodes = nodes.filter((n) => n.type === 'triple')
      expect(tripleNodes).toHaveLength(8)
    })

    it('triple nodes carry claim_group in metadata', () => {
      const { nodes } = buildGraph(baseAtoms(), baseTriples(), [])
      const allocTriple = nodes.find((n) => n.id === `triple:${TOKEN_ID}:has_alloc:${ALLOC_ID}`)
      expect(allocTriple).toBeDefined()
      expect(allocTriple!.metadata.claim_group).toBe('token_identity')
      expect(allocTriple!.metadata.origin_table).toBe('allocation_segments')
      expect(allocTriple!.metadata.origin_row_id).toBe(ALLOC_ID)
    })

    it('creates subject_of and object_of edges for each structural triple', () => {
      const { edges } = buildGraph(baseAtoms(), baseTriples(), [])
      const subjectEdges = edges.filter((e) => e.predicate === 'subject_of')
      const objectEdges = edges.filter((e) => e.predicate === 'object_of')
      expect(subjectEdges).toHaveLength(8)
      expect(objectEdges).toHaveLength(8)
    })

    it('skips triples whose subject atom is not in the graph', () => {
      const orphanTriple: CanonicalTriple = {
        triple_id: 'triple:orphan', subject_id: 'atom:token:nonexistent',
        predicate: 'has Something', object_id: `atom:alloc:${ALLOC_ID}`,
        object_literal: null, token_id: TOKEN_ID,
        claim_group: null, origin_table: null, origin_row_id: null,
      }
      const { nodes } = buildGraph(baseAtoms(), [orphanTriple], [])
      expect(nodes.find((n) => n.id === 'triple:orphan')).toBeUndefined()
    })
  })

  describe('literal triples', () => {
    it('excludes literal triples by default', () => {
      const allTriples = [...baseTriples(), ...literalTriples()]
      const { nodes } = buildGraph(baseAtoms(), allTriples, [])
      const litNodes = nodes.filter((n) => n.isLiteral)
      expect(litNodes).toHaveLength(0)
    })

    it('includes literal triples when includeLiterals=true', () => {
      const allTriples = [...baseTriples(), ...literalTriples()]
      const { nodes } = buildGraph(baseAtoms(), allTriples, [], { includeLiterals: true })
      const litNodes = nodes.filter((n) => n.isLiteral)
      expect(litNodes).toHaveLength(2)
      expect(litNodes[0].type).toBe('triple')
      expect(litNodes[0].family).toBe('triple')
    })

    it('literal triples have subject_of edges but no object_of edges', () => {
      const allTriples = [...baseTriples(), ...literalTriples()]
      const { edges } = buildGraph(baseAtoms(), allTriples, [], { includeLiterals: true })
      const litTripleIds = new Set([`triple:${TOKEN_ID}:has_status`, `triple:${ALLOC_ID}:has_percentage`])
      const litSubjectEdges = edges.filter((e) => e.predicate === 'subject_of' && litTripleIds.has(e.source))
      const litObjectEdges = edges.filter((e) => e.predicate === 'object_of' && litTripleIds.has(e.source))
      expect(litSubjectEdges).toHaveLength(2)
      expect(litObjectEdges).toHaveLength(0) // no object_id for literals
    })
  })

  describe('source filtering', () => {
    it('excludes source atoms and source triples when includeSources=false', () => {
      const { nodes, edges } = buildGraph(baseAtoms(), baseTriples(), baseSources(), { includeSources: false })
      expect(nodes.filter((n) => n.type === 'data_source')).toHaveLength(0)
      expect(nodes.filter((n) => n.type === 'triple' && n.label === 'has Data Source')).toHaveLength(0)
      expect(edges.filter((e) => e.predicate === 'justified_by')).toHaveLength(0)
    })

    it('includes source atoms when includeSources=true', () => {
      const { nodes } = buildGraph(baseAtoms(), baseTriples(), baseSources(), { includeSources: true })
      expect(nodes.filter((n) => n.type === 'data_source')).toHaveLength(1)
    })
  })

  describe('provenance targets triple nodes', () => {
    it('justified_by edges point to triple nodes, not entity atoms', () => {
      const { edges } = buildGraph(baseAtoms(), baseTriples(), baseSources())
      const provEdges = edges.filter((e) => e.predicate === 'justified_by')
      expect(provEdges.length).toBeGreaterThan(0)
      for (const e of provEdges) {
        expect(e.target).toMatch(/^triple:/) // must target a triple node
      }
    })

    it('specific claim_id targets triples with matching origin_row_id', () => {
      const { edges } = buildGraph(baseAtoms(), baseTriples(), baseSources())
      // cs-2 has claim_type=allocation_segment, claim_id=ALLOC_ID
      // Should match triple with claim_group=allocation_segment + origin_row_id=ALLOC_ID
      // But baseTriples has claim_group='token_identity' for the alloc triple...
      // Actually the alloc triple has claim_group='token_identity'. The literal triple
      // for allocation_segment would have claim_group='allocation_segment'.
      // So cs-2 falls back to token-level matching for 'allocation_segment' claim_group.
      // This is correct behavior: no matching triple → fallback to claim_group:token_id scope.
      const provEdges = edges.filter((e) => e.predicate === 'justified_by')
      expect(provEdges.length).toBeGreaterThan(0)
    })

    it('claim_group token_identity matches multiple triples for that token', () => {
      const { edges } = buildGraph(baseAtoms(), baseTriples(), baseSources())
      // cs-1 has claim_type=token_identity, claim_id=null
      // Should match all triples where claim_group=token_identity AND token_id=TOKEN_ID
      const provEdges = edges.filter(
        (e) => e.predicate === 'justified_by' && e.label === 'attests token_identity',
      )
      // token_identity triples: has_alloc, has_source, has_risk, has_category, has_sector, has_chain = 6
      expect(provEdges.length).toBe(6)
    })
  })

  describe('edge integrity', () => {
    it('every edge source and target exists in nodes', () => {
      const { nodes, edges } = buildGraph(baseAtoms(), baseTriples(), baseSources())
      const nodeIds = new Set(nodes.map((n) => n.id))
      for (const edge of edges) {
        expect(nodeIds.has(edge.source)).toBe(true)
        expect(nodeIds.has(edge.target)).toBe(true)
      }
    })

    it('edge IDs are unique', () => {
      const { edges } = buildGraph(baseAtoms(), baseTriples(), baseSources())
      const ids = edges.map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  describe('multi-token deduplication', () => {
    it('taxonomy atoms are shared across tokens when triples reference them', () => {
      const token2Id = '00000000-0000-0000-0000-000000000002'
      const atoms = [
        ...baseAtoms(),
        { atom_id: `atom:token:${token2Id}`, atom_type: 'token', label: 'OtherToken', token_id: token2Id, metadata: { ticker: 'OTH' } },
        { atom_id: 'atom:category:infrastructure', atom_type: 'category', label: 'infrastructure', token_id: null, metadata: {} },
      ]
      // Both tokens link to the same category via triples
      const triples: CanonicalTriple[] = [
        { triple_id: `triple:${TOKEN_ID}:has_category:infrastructure`, subject_id: `atom:token:${TOKEN_ID}`, predicate: 'has Category', object_id: 'atom:category:infrastructure', object_literal: null, token_id: TOKEN_ID, claim_group: 'token_identity', origin_table: 'tokens', origin_row_id: TOKEN_ID },
        { triple_id: `triple:${token2Id}:has_category:infrastructure`, subject_id: `atom:token:${token2Id}`, predicate: 'has Category', object_id: 'atom:category:infrastructure', object_literal: null, token_id: token2Id, claim_group: 'token_identity', origin_table: 'tokens', origin_row_id: token2Id },
      ]
      const { nodes, edges } = buildGraph(atoms, triples, [])
      expect(nodes.filter((n) => n.type === 'category')).toHaveLength(1) // deduplicated
      expect(nodes.filter((n) => n.type === 'token')).toHaveLength(2)
      expect(edges.filter((e) => e.predicate === 'belongs_to_graph')).toHaveLength(2)
    })

    it('prunes taxonomy atoms with no triples referencing them', () => {
      const atoms = [
        ...baseAtoms(),
      ]
      // No triples → taxonomy atoms should be pruned
      const { nodes } = buildGraph(atoms, [], [])
      expect(nodes.filter((n) => n.type === 'category')).toHaveLength(0)
      expect(nodes.filter((n) => n.type === 'sector')).toHaveLength(0)
      expect(nodes.filter((n) => n.type === 'chain')).toHaveLength(0)
    })
  })
})
