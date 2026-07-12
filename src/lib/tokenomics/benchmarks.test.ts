import { describe, it, expect } from 'vitest'
import {
  MIN_COHORT_ATTESTED,
  resolveCohort,
  computeAllocationBenchmarks,
  computeVestingBenchmarks,
  computeEmissionBenchmarks,
  buildBenchmarkResponse,
  largestRemainderTo100,
  buildVestingSeed,
  factoryIdentityWithSectorSchema,
  type CohortTokenRow,
  type KgAtomRow,
  type KgTripleRow,
} from './benchmarks'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const token = (
  id: string,
  status: string,
  sector: string | null,
  category: string | null,
): CohortTokenRow => ({ id, status, sector, category })

const allocAtom = (
  atomId: string,
  tokenId: string,
  segmentType: string | null,
  pct?: number,
): KgAtomRow => ({
  atom_id: atomId,
  atom_type: 'allocation',
  label: atomId,
  token_id: tokenId,
  metadata:
    segmentType === null
      ? { percentage: pct ?? 0 }
      : { segment_type: segmentType, percentage: pct ?? 0 },
})

const literal = (
  subject: string,
  predicate: string,
  value: number | string,
  tokenId: string,
): KgTripleRow => ({
  subject_id: subject,
  predicate,
  object_id: null,
  object_literal: String(value),
  token_id: tokenId,
})

const link = (
  subject: string,
  predicate: string,
  object: string,
  tokenId: string,
): KgTripleRow => ({
  subject_id: subject,
  predicate,
  object_id: object,
  object_literal: null,
  token_id: tokenId,
})

// Three attested gaming tokens + one attested infra token + noise
const TOKENS: CohortTokenRow[] = [
  token('t1', 'validated', 'gaming-ecosystem', 'open-digital-economy'),
  token('t2', 'validated', 'gaming-ecosystem', 'open-digital-economy'),
  // legacy underscored sector must still bucket into the same cohort
  token('t3', 'validated', 'gaming_ecosystem', 'open-digital-economy'),
  token('t4', 'validated', 'l1', 'infrastructure'),
  token('t5', 'in_review', 'gaming-ecosystem', 'open-digital-economy'),
  token('t6', 'validated', 'gaming-ecosystem', 'open-digital-economy'), // NOT attested
]
const ATTESTED = new Set(['t1', 't2', 't3', 't4'])

describe('resolveCohort', () => {
  it('resolves the sector rung when it meets MIN_COHORT_ATTESTED', () => {
    const { cohort, tokenIds } = resolveCohort({
      requestedSector: 'gaming-ecosystem',
      tokens: TOKENS,
      attestedTokenIds: ATTESTED,
    })
    expect(cohort).toEqual({
      basis: 'sector',
      key: 'gaming-ecosystem',
      tokenCount: 3,
      confidence: 'high',
    })
    expect(tokenIds.sort()).toEqual(['t1', 't2', 't3'])
  })

  it('excludes in_review and non-attested tokens from every rung', () => {
    const { tokenIds } = resolveCohort({
      requestedSector: 'gaming-ecosystem',
      tokens: TOKENS,
      attestedTokenIds: ATTESTED,
    })
    expect(tokenIds).not.toContain('t5') // in_review
    expect(tokenIds).not.toContain('t6') // validated but not attested
  })

  it('falls back to the parent category when the sector rung is thin', () => {
    // 'game' shares the open-digital-economy parent with the gaming tokens
    const { cohort, tokenIds } = resolveCohort({
      requestedSector: 'game',
      tokens: TOKENS,
      attestedTokenIds: ATTESTED,
    })
    expect(cohort.basis).toBe('category')
    expect(cohort.key).toBe('open-digital-economy')
    expect(tokenIds.sort()).toEqual(['t1', 't2', 't3'])
  })

  it('falls back to all-attested when sector and category are both thin', () => {
    const { cohort, tokenIds } = resolveCohort({
      requestedSector: 'dex', // financial: zero attested tokens
      tokens: TOKENS,
      attestedTokenIds: ATTESTED,
    })
    expect(cohort.basis).toBe('all-attested')
    expect(cohort.key).toBeNull()
    expect(tokenIds).toHaveLength(4)
  })

  it('returns basis none (never a median of n=1) below the threshold', () => {
    const { cohort, tokenIds } = resolveCohort({
      requestedSector: 'gaming-ecosystem',
      tokens: TOKENS,
      attestedTokenIds: new Set(['t1']),
    })
    expect(cohort.basis).toBe('none')
    expect(cohort.tokenCount).toBe(0)
    expect(tokenIds).toEqual([])
    expect(MIN_COHORT_ATTESTED).toBe(3)
  })
})

describe('computeAllocationBenchmarks', () => {
  it('sums a token same-type rows into ONE data point before the median', () => {
    const atoms = [
      // t1 has THREE team rows (20 + 10 + 5 = 35) — must count once
      allocAtom('a1', 't1', 'team-founders'),
      allocAtom('a2', 't1', 'team-founders'),
      allocAtom('a3', 't1', 'team-founders'),
      allocAtom('a4', 't2', 'team-founders'),
      allocAtom('a5', 't3', 'team-founders'),
    ]
    const triples = [
      literal('a1', 'has Percentage', 20, 't1'),
      literal('a2', 'has Percentage', 10, 't1'),
      literal('a3', 'has Percentage', 5, 't1'),
      literal('a4', 'has Percentage', 15, 't2'),
      literal('a5', 'has Percentage', 25, 't3'),
    ]
    const result = computeAllocationBenchmarks(atoms, triples, [
      't1',
      't2',
      't3',
    ])
    // points: 35 (t1), 15 (t2), 25 (t3) → median 25, mean 25
    expect(result['team-founders']).toEqual({
      medianPct: 25,
      meanPct: 25,
      tokenCount: 3,
    })
  })

  it('merges legacy segment labels into the canonical taxonomy', () => {
    const atoms = [
      allocAtom('a1', 't1', 'team'), // legacy → team-founders
      allocAtom('a2', 't2', 'team_founders'), // underscored → team-founders
      allocAtom('a3', 't3', 'team-founders'),
    ]
    const triples = [
      literal('a1', 'has Percentage', 10, 't1'),
      literal('a2', 'has Percentage', 20, 't2'),
      literal('a3', 'has Percentage', 30, 't3'),
    ]
    const result = computeAllocationBenchmarks(atoms, triples, [
      't1',
      't2',
      't3',
    ])
    expect(Object.keys(result)).toEqual(['team-founders'])
    expect(result['team-founders'].tokenCount).toBe(3)
    expect(result['team-founders'].medianPct).toBe(20)
  })

  it('drops atoms whose segment_type is missing or unmappable', () => {
    const atoms = [
      allocAtom('a1', 't1', null, 40),
      allocAtom('a2', 't2', 'not-a-real-type', 40),
      allocAtom('a3', 't3', 'liquidity'),
    ]
    const triples = [literal('a3', 'has Percentage', 12, 't3')]
    const result = computeAllocationBenchmarks(atoms, triples, [
      't1',
      't2',
      't3',
    ])
    expect(Object.keys(result)).toEqual(['liquidity'])
  })

  it('ignores tokens outside the cohort', () => {
    const atoms = [
      allocAtom('a1', 't1', 'liquidity'),
      allocAtom('a2', 'intruder', 'liquidity'),
    ]
    const triples = [
      literal('a1', 'has Percentage', 10, 't1'),
      literal('a2', 'has Percentage', 90, 'intruder'),
    ]
    const result = computeAllocationBenchmarks(atoms, triples, ['t1'])
    expect(result['liquidity'].tokenCount).toBe(1)
    expect(result['liquidity'].medianPct).toBe(10)
  })
})

describe('computeVestingBenchmarks', () => {
  it('resolves segment types through the allocation link and keeps the largest same-segment schedule', () => {
    const atoms = [
      // t1 has two team allocations: 30% (48m vest) and 5% (6m vest)
      allocAtom('a1', 't1', 'team-founders'),
      allocAtom('a2', 't1', 'team-founders'),
      allocAtom('a3', 't2', 'team-founders'),
      allocAtom('a4', 't3', 'team-founders'),
    ]
    const triples = [
      literal('a1', 'has Percentage', 30, 't1'),
      literal('a2', 'has Percentage', 5, 't1'),
      literal('a3', 'has Percentage', 20, 't2'),
      literal('a4', 'has Percentage', 15, 't3'),
      link('a1', 'has Vesting Schedule', 'v1', 't1'),
      link('a2', 'has Vesting Schedule', 'v2', 't1'),
      link('a3', 'has Vesting Schedule', 'v3', 't2'),
      link('a4', 'has Vesting Schedule', 'v4', 't3'),
      literal('v1', 'has Duration Months', 48, 't1'),
      literal('v2', 'has Duration Months', 6, 't1'), // must NOT win over v1
      literal('v3', 'has Duration Months', 24, 't2'),
      literal('v4', 'has Duration Months', 36, 't3'),
      literal('v1', 'has Cliff Months', 12, 't1'),
      literal('v3', 'has Cliff Months', 6, 't2'),
      literal('v4', 'has Cliff Months', 12, 't3'),
      literal('v1', 'has Frequency', 'monthly', 't1'),
      literal('v3', 'has Frequency', 'monthly', 't2'),
      literal('v4', 'has Frequency', 'quarterly', 't3'), // legacy → yearly
    ]
    const result = computeVestingBenchmarks(atoms, triples, ['t1', 't2', 't3'])
    const team = result['team-founders']
    // durations: 48 (t1 largest), 24, 36 → median 36
    expect(team.durationMonths).toBe(36)
    expect(team.cliffMonths).toBe(12)
    expect(team.frequency).toBe('monthly')
    expect(team.tokenCount).toBe(3)
  })

  it('skips vesting rows whose allocation is unmappable (missing segment_type)', () => {
    const atoms = [allocAtom('a1', 't1', null, 20)]
    const triples = [
      link('a1', 'has Vesting Schedule', 'v1', 't1'),
      literal('v1', 'has Duration Months', 24, 't1'),
    ]
    expect(computeVestingBenchmarks(atoms, triples, ['t1'])).toEqual({})
  })
})

describe('computeEmissionBenchmarks', () => {
  it('takes one inflation value per token and returns the distribution', () => {
    const triples = [
      literal('e1', 'has Annual Inflation Rate', 2, 't1'),
      literal('e2', 'has Annual Inflation Rate', 4, 't2'),
      literal('e3', 'has Annual Inflation Rate', 9, 't3'),
      literal('e4', 'has Annual Inflation Rate', 99, 'intruder'),
    ]
    const result = computeEmissionBenchmarks(triples, ['t1', 't2', 't3'])
    expect(result.annualInflationRate).toEqual({
      median: 4,
      mean: 5,
      tokenCount: 3,
    })
  })

  it('returns null when the cohort has no inflation data', () => {
    expect(computeEmissionBenchmarks([], ['t1']).annualInflationRate).toBeNull()
  })
})

describe('buildBenchmarkResponse', () => {
  it('returns empty aggregates with basis none for a thin cohort', () => {
    const res = buildBenchmarkResponse({
      requestedSector: 'dex',
      tokens: TOKENS,
      attestedTokenIds: new Set(['t1']),
      atoms: [],
      triples: [],
    })
    expect(res.cohort.basis).toBe('none')
    expect(res.allocation).toEqual({})
    expect(res.vesting).toEqual({})
    expect(res.emission.annualInflationRate).toBeNull()
  })
})

describe('largestRemainderTo100', () => {
  it('scales shares to sum exactly 100.00', () => {
    const normalized = largestRemainderTo100({
      'team-founders': 33.33,
      liquidity: 33.33,
      treasury: 33.33,
    })
    const total = Object.values(normalized).reduce((a, b) => a + b, 0)
    expect(Math.round(total * 100)).toBe(10000)
  })

  it('preserves proportions and drops non-positive shares', () => {
    const normalized = largestRemainderTo100({
      a: 60,
      b: 30,
      c: 0,
      d: -5,
    })
    expect(normalized).toEqual({ a: 66.67, b: 33.33 })
    expect('c' in normalized).toBe(false)
  })

  it('returns {} when nothing is positive', () => {
    expect(largestRemainderTo100({ a: 0 })).toEqual({})
  })
})

describe('buildVestingSeed', () => {
  it('clamps cliff to duration and cliff-unlock to the TGE remainder (schema-valid)', () => {
    const seed = buildVestingSeed({
      cliffMonths: 18,
      durationMonths: 12, // median cliff > median duration
      tgePct: 80,
      cliffUnlockPct: 40, // 80 + 40 > 100
      frequency: 'quarterly', // legacy → yearly
      tokenCount: 3,
    })
    expect(seed.cliff_months).toBe('12')
    expect(seed.duration_months).toBe('12')
    expect(seed.tge_percentage).toBe('80')
    expect(seed.cliff_unlock_percentage).toBe('20')
    expect(seed.frequency).toBe('yearly')
  })

  it('maps null medians to zeroed form values', () => {
    const seed = buildVestingSeed({
      cliffMonths: null,
      durationMonths: null,
      tgePct: null,
      cliffUnlockPct: null,
      frequency: null,
      tokenCount: 1,
    })
    expect(seed.cliff_months).toBe('0')
    expect(seed.duration_months).toBe('0')
    expect(seed.tge_percentage).toBe('0')
    expect(seed.cliff_unlock_percentage).toBe('')
  })
})

describe('factoryIdentityWithSectorSchema (advisory)', () => {
  it('flags a missing sector/category without touching the shared schema', () => {
    const result = factoryIdentityWithSectorSchema.safeParse({
      name: 'X',
      ticker: 'X',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'))
      expect(paths).toContain('sector')
      expect(paths).toContain('category')
    }
  })
})
