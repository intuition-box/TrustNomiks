import { describe, it, expect } from 'vitest'
import {
  normalizePredicate,
  normalizeAtom,
  normalizeLiteral,
  predicateToAtomId,
  literalToAtomId,
  collectUniquePredicates,
  filterTriples,
  filterAtoms,
  isPredicateExcluded,
  isAtomTypeExcluded,
  predicateNormalizedData,
} from './atom-normalizer'
import { getCanonicalRegistry } from './canonical-registry'
import type { CanonicalAtom, CanonicalTriple } from '@/lib/knowledge-graph/graph-types'

// ── normalizePredicate ──────────────────────────────────────────────────────

describe('normalizePredicate', () => {
  it('maps known predicates to snake_case', () => {
    expect(normalizePredicate('has Allocation Segment')).toBe('has_allocation_segment')
    expect(normalizePredicate('has Max Supply')).toBe('has_max_supply')
    expect(normalizePredicate('has TGE Date')).toBe('has_tge_date')
    expect(normalizePredicate('has Cliff Unlock Percentage')).toBe('has_cliff_unlock_percentage')
    expect(normalizePredicate('has Annual Inflation Rate')).toBe('has_annual_inflation_rate')
    expect(normalizePredicate('based_on')).toBe('based_on')
  })

  it('falls back to snake_case for unknown predicates', () => {
    expect(normalizePredicate('Some Unknown Predicate')).toBe('some_unknown_predicate')
    expect(normalizePredicate('  Has Spaces  ')).toBe('has_spaces')
  })
})

// ── isPredicateExcluded ─────────────────────────────────────────────────────

describe('isPredicateExcluded', () => {
  it('excludes workflow predicates', () => {
    expect(isPredicateExcluded('has_status')).toBe(true)
    expect(isPredicateExcluded('has_completeness')).toBe(true)
  })

  it('does not exclude core predicates', () => {
    expect(isPredicateExcluded('has_name')).toBe(false)
    expect(isPredicateExcluded('has_max_supply')).toBe(false)
  })
})

// ── normalizeAtom ───────────────────────────────────────────────────────────

describe('normalizeAtom', () => {
  it('normalizes token atoms', () => {
    const atom: CanonicalAtom = {
      atom_id: 'atom:token:abc-123',
      atom_type: 'token',
      label: 'Bitcoin',
      token_id: 'abc-123',
      metadata: { ticker: 'BTC', chain: 'Ethereum' },
    }
    expect(normalizeAtom(atom)).toBe('trustnomiks:token:abc-123')
  })

  it('normalizes allocation atoms', () => {
    const atom: CanonicalAtom = {
      atom_id: 'atom:alloc:xyz-456',
      atom_type: 'allocation',
      label: 'Team',
      token_id: 'abc-123',
      metadata: { segment_type: 'team-founders', percentage: 20 },
    }
    expect(normalizeAtom(atom)).toBe('trustnomiks:allocation:xyz-456')
  })

  it('normalizes data source atoms with URL', () => {
    const atom: CanonicalAtom = {
      atom_id: 'atom:source:src-789',
      atom_type: 'data_source',
      label: 'Whitepaper',
      token_id: 'abc-123',
      metadata: { url: 'https://Example.com/whitepaper/', version: 'v1' },
    }
    const result = normalizeAtom(atom)
    expect(result).toBe('trustnomiks:source:https://example.com/whitepaper|v1')
  })

  it('normalizes taxonomy atoms to lowercase', () => {
    const atom: CanonicalAtom = {
      atom_id: 'atom:category:Financial',
      atom_type: 'category',
      label: 'Financial',
      token_id: null,
      metadata: {},
    }
    expect(normalizeAtom(atom)).toBe('financial')
  })
})

// ── normalizeLiteral ────────────────────────────────────────────────────────

describe('normalizeLiteral', () => {
  it('normalizes numbers by removing commas', () => {
    expect(normalizeLiteral('21,000,000')).toBe('21000000')
    expect(normalizeLiteral('1000000')).toBe('1000000')
  })

  it('normalizes booleans', () => {
    expect(normalizeLiteral('True')).toBe('true')
    expect(normalizeLiteral('FALSE')).toBe('false')
  })

  it('normalizes dates to YYYY-MM-DD', () => {
    expect(normalizeLiteral('2024-03-15T00:00:00Z')).toBe('2024-03-15')
    expect(normalizeLiteral('2024-03-15')).toBe('2024-03-15')
  })

  it('passes through regular strings', () => {
    expect(normalizeLiteral('monthly')).toBe('monthly')
    expect(normalizeLiteral('https://example.com')).toBe('https://example.com')
  })

  it('handles null/undefined', () => {
    expect(normalizeLiteral(null)).toBe('')
    expect(normalizeLiteral(undefined)).toBe('')
  })
})

// ── predicateToAtomId / literalToAtomId ─────────────────────────────────────

describe('ID generators', () => {
  it('generates predicate atom IDs', () => {
    expect(predicateToAtomId('has_name')).toBe('atom:predicate:has_name')
  })

  it('generates literal atom IDs from content hash, not triple id', () => {
    // Same value produces the same atom id, regardless of triple it came from.
    const a = literalToAtomId('triple:foo', 'Bitcoin')
    const b = literalToAtomId('triple:bar', 'Bitcoin')
    expect(a).toBe(b)
    expect(a).toMatch(/^atom:literal:[0-9a-f]{16}$/)

    // Different values produce different ids.
    const c = literalToAtomId('triple:foo', 'Ethereum')
    expect(c).not.toBe(a)

    // Normalization is applied before hashing — "21,000,000" and "21000000" collide.
    expect(literalToAtomId('t1', '21,000,000')).toBe(literalToAtomId('t2', '21000000'))
  })
})

// ── predicateNormalizedData ─────────────────────────────────────────────────

describe('predicateNormalizedData (canonical registry)', () => {
  it('returns the registered URI for has_category (reused canonical "is a")', () => {
    const uri = predicateNormalizedData('has_category')
    expect(uri).toBe('ipfs://QmSbTY2QqhnZdCr7zqdZkFBLfY9FGEtPf8KUYzezDipPyG')
  })

  it('throws for predicates missing from the registry', () => {
    expect(() => predicateNormalizedData('totally_made_up_predicate')).toThrow(
      /missing from registry/,
    )
  })
})

// ── canonical registry guards ───────────────────────────────────────────────

describe('canonical registry', () => {
  it('every entry has a well-formed termId, uri, and lowercase label', () => {
    const registry = getCanonicalRegistry()
    const entries = Object.values(registry.predicates)
    expect(entries.length).toBeGreaterThan(0)
    for (const e of entries) {
      expect(e.termId).toMatch(/^0x[0-9a-f]{64}$/)
      expect(e.uri.startsWith('ipfs://')).toBe(true)
      // Canonical labels must be lowercase with spaces (no underscores or capitals)
      expect(e.canonicalLabel).not.toMatch(/[A-Z_]/)
    }
  })

  it('every non-excluded predicate from PREDICATE_MAP is in the registry', () => {
    // Excluded V1 predicates have no on-chain atom and no registry entry.
    const EXCLUDED = new Set([
      'has_status', 'has_completeness',
      'has_risk_flag', 'has_severity', 'is_flagged', 'has_justification',
    ])
    const sampleRawKeys = [
      'has Allocation Segment', 'has Vesting Schedule', 'has Emission Model',
      'has Data Source', 'has Category', 'has Sector', 'has Chain',
      'has Name', 'has Ticker', 'has Contract Address', 'has TGE Date',
      'has Max Supply', 'has Initial Supply', 'has TGE Supply', 'has Circulating Supply',
      'has Percentage', 'has Token Amount', 'has Wallet Address',
      'has Cliff Months', 'has Duration Months', 'has Frequency',
      'has TGE Percentage', 'has Cliff Unlock Percentage',
      'has Annual Inflation Rate',
      'has URL', 'has Version', 'has Verified At',
      'based_on',
    ]
    const registry = getCanonicalRegistry()
    const missing: string[] = []
    for (const raw of sampleRawKeys) {
      const norm = normalizePredicate(raw)
      if (EXCLUDED.has(norm)) continue
      if (!(norm in registry.predicates)) missing.push(norm)
    }
    expect(missing).toEqual([])
  })
})

// ── collectUniquePredicates ─────────────────────────────────────────────────

describe('collectUniquePredicates', () => {
  it('deduplicates predicates and always includes based_on', () => {
    const triples: CanonicalTriple[] = [
      { triple_id: 't1', subject_id: 's1', predicate: 'has Name', object_id: 'o1', object_literal: null, token_id: 'tok', claim_group: null, origin_table: null, origin_row_id: null },
      { triple_id: 't2', subject_id: 's2', predicate: 'has Name', object_id: 'o2', object_literal: null, token_id: 'tok', claim_group: null, origin_table: null, origin_row_id: null },
      { triple_id: 't3', subject_id: 's3', predicate: 'has Chain', object_id: null, object_literal: 'Ethereum', token_id: 'tok', claim_group: null, origin_table: null, origin_row_id: null },
    ]

    const result = collectUniquePredicates(triples)
    const normalized = result.map((r) => r.normalized)

    expect(normalized).toContain('has_name')
    expect(normalized).toContain('has_chain')
    expect(normalized).toContain('based_on')
    // "has_name" should appear only once
    expect(normalized.filter((n) => n === 'has_name')).toHaveLength(1)
  })
})

// ── filterTriples ───────────────────────────────────────────────────────────

describe('filterTriples', () => {
  it('excludes risk_flag triples', () => {
    const triples: CanonicalTriple[] = [
      { triple_id: 't1', subject_id: 'atom:token:abc', predicate: 'has Risk Flag', object_id: 'atom:risk:r1', object_literal: null, token_id: 'tok', claim_group: null, origin_table: null, origin_row_id: null },
      { triple_id: 't2', subject_id: 'atom:token:abc', predicate: 'has Name', object_id: null, object_literal: 'Bitcoin', token_id: 'tok', claim_group: null, origin_table: null, origin_row_id: null },
    ]

    const filtered = filterTriples(triples)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].triple_id).toBe('t2')
  })

  it('excludes status and completeness triples', () => {
    const triples: CanonicalTriple[] = [
      { triple_id: 't1', subject_id: 'atom:token:abc', predicate: 'has Status', object_id: null, object_literal: 'validated', token_id: 'tok', claim_group: null, origin_table: null, origin_row_id: null },
      { triple_id: 't2', subject_id: 'atom:token:abc', predicate: 'has Completeness', object_id: null, object_literal: '85', token_id: 'tok', claim_group: null, origin_table: null, origin_row_id: null },
      { triple_id: 't3', subject_id: 'atom:token:abc', predicate: 'has Max Supply', object_id: null, object_literal: '21000000', token_id: 'tok', claim_group: null, origin_table: null, origin_row_id: null },
    ]

    const filtered = filterTriples(triples)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].triple_id).toBe('t3')
  })
})

// ── filterAtoms ─────────────────────────────────────────────────────────────

describe('filterAtoms', () => {
  it('excludes risk_flag atoms', () => {
    const atoms: CanonicalAtom[] = [
      { atom_id: 'atom:token:abc', atom_type: 'token', label: 'BTC', token_id: 'abc', metadata: {} },
      { atom_id: 'atom:risk:r1', atom_type: 'risk_flag', label: 'High Inflation', token_id: 'abc', metadata: {} },
    ]

    const filtered = filterAtoms(atoms)
    expect(filtered).toHaveLength(1)
    expect(filtered[0].atom_type).toBe('token')
  })
})
