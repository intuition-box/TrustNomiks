import { describe, it, expect } from 'vitest'
import {
  convertTokenToTriples,
  convertMultipleTokensToTriples,
  type Triple,
  type CompleteTokenData,
  type TokenData,
  type SupplyMetrics,
  type AllocationSegment,
  type VestingSchedule,
  type EmissionModel,
  type DataSource,
  type RiskFlag,
  type ClaimSource,
} from '@/lib/utils/triples-export'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the first triple matching a predicate (optionally scoped to a subject). */
function findTriple(triples: Triple[], predicate: string, subject?: string): Triple | undefined {
  return triples.find(
    (t) => t.predicate === predicate && (subject === undefined || t.subject === subject),
  )
}

/** Find all triples matching a predicate (optionally scoped to a subject). */
function findTriples(triples: Triple[], predicate: string, subject?: string): Triple[] {
  return triples.filter(
    (t) => t.predicate === predicate && (subject === undefined || t.subject === subject),
  )
}

/** Return true when at least one triple with the given predicate exists. */
function hasPredicate(triples: Triple[], predicate: string): boolean {
  return triples.some((t) => t.predicate === predicate)
}

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

function buildCompleteTokenData(overrides: Partial<CompleteTokenData> = {}): CompleteTokenData {
  const token: TokenData = {
    id: 'tok-001',
    name: 'TestToken',
    ticker: 'TST',
    chain: 'Ethereum',
    contract_address: '0xabc123',
    tge_date: '2025-06-01',
    category: 'infrastructure',
    sector: 'layer-1',
    notes: null,
    status: 'validated',
    completeness: 85,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-03-01T00:00:00Z',
  }

  const supply: SupplyMetrics = {
    max_supply: '1000000000',
    initial_supply: '200000000',
    tge_supply: '50000000',
    circulating_supply: '300000000',
    circulating_date: '2025-09-01',
    source_url: 'https://example.com/docs',
    notes: null,
  }

  const allocations: AllocationSegment[] = [
    {
      id: 'alloc-1',
      segment_type: 'team-founders',
      label: 'Team & Founders',
      percentage: 20,
      token_amount: '200000000',
      wallet_address: '0xteam',
    },
    {
      id: 'alloc-2',
      segment_type: 'treasury',
      label: 'Treasury',
      percentage: 30,
      token_amount: '300000000',
      wallet_address: null,
    },
    {
      id: 'alloc-3',
      segment_type: 'airdrop',
      label: 'Community Airdrop',
      percentage: 50,
      token_amount: '500000000',
      wallet_address: null,
    },
  ]

  const vesting: VestingSchedule[] = [
    {
      id: 'vest-1',
      allocation_id: 'alloc-1',
      cliff_months: 12,
      duration_months: 36,
      frequency: 'monthly',
      tge_percentage: 0,
      cliff_unlock_percentage: 10,
      start_date: '2025-06-01',
      notes: null,
      allocation: { label: 'Team & Founders', segment_type: 'team-founders' },
    },
    {
      id: 'vest-2',
      allocation_id: 'alloc-2',
      cliff_months: 6,
      duration_months: 24,
      frequency: 'monthly',
      tge_percentage: 5,
      cliff_unlock_percentage: null,
      start_date: '2025-06-01',
      notes: null,
      allocation: { label: 'Treasury', segment_type: 'treasury' },
    },
  ]

  const emission: EmissionModel = {
    type: 'deflationary',
    annual_inflation_rate: '2.5',
    inflation_schedule: [
      { year: 1, rate: 5 },
      { year: 2, rate: 3 },
    ],
    has_burn: true,
    burn_details: 'Burns 1% of fees',
    has_buyback: true,
    buyback_details: 'Monthly buyback program',
    notes: null,
  }

  const sources: DataSource[] = [
    {
      id: 'src-1',
      source_type: 'whitepaper',
      document_name: 'TestToken Whitepaper v1',
      url: 'https://example.com/whitepaper.pdf',
      version: '1.0',
      verified_at: '2025-02-15T00:00:00Z',
    },
  ]

  const risk_flags: RiskFlag[] = [
    {
      id: 'rf-1',
      flag_type: 'concentration_risk',
      severity: 'high',
      is_flagged: true,
      justification: 'Top 3 wallets hold >60% of supply',
    },
  ]

  const claim_sources: ClaimSource[] = [
    {
      id: 'cs-1',
      data_source_id: 'src-1',
      claim_type: 'max_supply',
      claim_id: 'claim-abc',
    },
  ]

  return {
    token,
    supply,
    allocations,
    vesting,
    emission,
    sources,
    risk_flags,
    claim_sources,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('triples-export', () => {
  // =========================================================================
  // 1. Completeness field uses correct property
  // =========================================================================
  describe('completeness score', () => {
    it('uses token.completeness as the object value', () => {
      const data = buildCompleteTokenData()
      const triples = convertTokenToTriples(data)

      const triple = findTriple(triples, 'has Completeness Score', data.token.ticker)
      expect(triple).toBeDefined()
      expect(triple!.object).toBe(data.token.completeness) // 85
    })

    it('reflects a different completeness value when overridden', () => {
      const data = buildCompleteTokenData({
        token: {
          ...buildCompleteTokenData().token,
          completeness: 42,
        },
      })
      const triples = convertTokenToTriples(data)

      const triple = findTriple(triples, 'has Completeness Score')
      expect(triple).toBeDefined()
      expect(triple!.object).toBe(42)
    })
  })

  // =========================================================================
  // 2. cliff_unlock_percentage is exported
  // =========================================================================
  describe('cliff_unlock_percentage', () => {
    it('produces a "cliff Unlock Percentage" triple when value is set', () => {
      const data = buildCompleteTokenData()
      const triples = convertTokenToTriples(data)

      const matches = findTriples(triples, 'cliff Unlock Percentage')
      expect(matches.length).toBeGreaterThanOrEqual(1)
      // The first vesting schedule has cliff_unlock_percentage = 10
      expect(matches[0].object).toBe(10)
    })

    it('omits cliff Unlock Percentage when the value is null', () => {
      const data = buildCompleteTokenData({
        vesting: [
          {
            id: 'vest-only',
            allocation_id: 'alloc-1',
            cliff_months: 6,
            duration_months: 24,
            frequency: 'monthly',
            tge_percentage: 5,
            cliff_unlock_percentage: null,
            start_date: null,
            notes: null,
            allocation: { label: 'Team & Founders', segment_type: 'team-founders' },
          },
        ],
      })
      const triples = convertTokenToTriples(data)

      expect(hasPredicate(triples, 'cliff Unlock Percentage')).toBe(false)
    })

    it('emits cliff Unlock Percentage when the value is 0', () => {
      const data = buildCompleteTokenData({
        vesting: [
          {
            id: 'vest-zero',
            allocation_id: 'alloc-1',
            cliff_months: 3,
            duration_months: 12,
            frequency: 'monthly',
            tge_percentage: 0,
            cliff_unlock_percentage: 0,
            start_date: null,
            notes: null,
            allocation: { label: 'Team & Founders', segment_type: 'team-founders' },
          },
        ],
      })
      const triples = convertTokenToTriples(data)

      const match = findTriple(triples, 'cliff Unlock Percentage')
      expect(match).toBeDefined()
      expect(match!.object).toBe(0)
    })
  })

  // =========================================================================
  // 3. risk_flags are included when present
  // =========================================================================
  describe('risk_flags', () => {
    it('generates risk flag triples for each flag in the array', () => {
      const data = buildCompleteTokenData({
        risk_flags: [
          {
            id: 'rf-a',
            flag_type: 'concentration_risk',
            severity: 'high',
            is_flagged: true,
            justification: 'Whale wallet holds 40%',
          },
          {
            id: 'rf-b',
            flag_type: 'unlock_cliff',
            severity: 'medium',
            is_flagged: false,
            justification: null,
          },
        ],
      })
      const triples = convertTokenToTriples(data)

      // "has Risk Flag" link triples
      const riskLinks = findTriples(triples, 'has Risk Flag')
      expect(riskLinks).toHaveLength(2)

      // Both flags produce flag Type, is Flagged, severity
      const flagTypes = findTriples(triples, 'flag Type')
      expect(flagTypes).toHaveLength(2)
      expect(flagTypes.map((t) => t.object)).toContain('concentration_risk')
      expect(flagTypes.map((t) => t.object)).toContain('unlock_cliff')

      const isFlaggedTriples = findTriples(triples, 'is Flagged')
      expect(isFlaggedTriples).toHaveLength(2)

      const severityTriples = findTriples(triples, 'severity')
      expect(severityTriples).toHaveLength(2)
    })

    it('includes justification triple when justification is provided', () => {
      const data = buildCompleteTokenData({
        risk_flags: [
          {
            id: 'rf-j',
            flag_type: 'governance_risk',
            severity: 'low',
            is_flagged: true,
            justification: 'Single signer on treasury multisig',
          },
        ],
      })
      const triples = convertTokenToTriples(data)

      const justification = findTriple(triples, 'justification')
      expect(justification).toBeDefined()
      expect(justification!.object).toBe('Single signer on treasury multisig')
    })

    it('omits justification triple when justification is null', () => {
      const data = buildCompleteTokenData({
        risk_flags: [
          {
            id: 'rf-nj',
            flag_type: 'unlock_cliff',
            severity: 'medium',
            is_flagged: false,
            justification: null,
          },
        ],
      })
      const triples = convertTokenToTriples(data)

      expect(hasPredicate(triples, 'justification')).toBe(false)
    })
  })

  // =========================================================================
  // 4. claim_sources provenance
  // =========================================================================
  describe('claim_sources provenance', () => {
    it('produces "attests Claim Type" triple for each claim source', () => {
      const data = buildCompleteTokenData()
      const triples = convertTokenToTriples(data)

      const attestType = findTriple(triples, 'attests Claim Type')
      expect(attestType).toBeDefined()
      expect(attestType!.object).toBe('max_supply')
      // Subject should reference the matching DataSource
      expect(attestType!.subject).toBe('DataSource_TST_whitepaper_1')
    })

    it('produces "attests Claim ID" when claim_id is non-null', () => {
      const data = buildCompleteTokenData()
      const triples = convertTokenToTriples(data)

      const attestId = findTriple(triples, 'attests Claim ID')
      expect(attestId).toBeDefined()
      expect(attestId!.object).toBe('claim-abc')
      expect(attestId!.subject).toBe('DataSource_TST_whitepaper_1')
    })

    it('omits "attests Claim ID" when claim_id is null', () => {
      const data = buildCompleteTokenData({
        claim_sources: [
          {
            id: 'cs-null',
            data_source_id: 'src-1',
            claim_type: 'initial_supply',
            claim_id: null,
          },
        ],
      })
      const triples = convertTokenToTriples(data)

      // "attests Claim Type" should still be present
      expect(hasPredicate(triples, 'attests Claim Type')).toBe(true)
      // "attests Claim ID" should NOT be present
      expect(hasPredicate(triples, 'attests Claim ID')).toBe(false)
    })

    it('skips claim source when data_source_id does not match any source', () => {
      const data = buildCompleteTokenData({
        claim_sources: [
          {
            id: 'cs-orphan',
            data_source_id: 'nonexistent-src',
            claim_type: 'max_supply',
            claim_id: 'claim-x',
          },
        ],
      })
      const triples = convertTokenToTriples(data)

      expect(hasPredicate(triples, 'attests Claim Type')).toBe(false)
      expect(hasPredicate(triples, 'attests Claim ID')).toBe(false)
    })
  })

  // =========================================================================
  // 5. Output shape for representative token payload
  // =========================================================================
  describe('output shape for a complete token', () => {
    const data = buildCompleteTokenData()
    const triples = convertTokenToTriples(data)

    it('returns an array', () => {
      expect(Array.isArray(triples)).toBe(true)
    })

    it('every element has subject, predicate, and object', () => {
      for (const triple of triples) {
        expect(triple).toHaveProperty('subject')
        expect(triple).toHaveProperty('predicate')
        expect(triple).toHaveProperty('object')
      }
    })

    it('conforms to Triple interface (string subject and predicate)', () => {
      for (const triple of triples) {
        expect(typeof triple.subject).toBe('string')
        expect(typeof triple.predicate).toBe('string')
        // object can be string | number | boolean | object — just must be defined
        expect(triple.object !== undefined).toBe(true)
      }
    })

    it('produces a reasonable number of triples for a fully populated token', () => {
      // The fixture has:
      //   identity: ~9 triples (name, status, completeness, chain, contract, tge_date, category, sector)
      //   but notes is null so 8
      //   supply: 6 (max, initial, tge, circulating, circulating_date, source_url)
      //   allocations: 3 segments * (link + type + label + percentage + optional amount/wallet)
      //   vesting: 2 schedules * multiple properties
      //   emission: link + type + inflation + schedule + burn flag + burn details + buyback flag + buyback details = 8
      //   sources: 1 * (link + type + doc + url + version + verified_at) = 6
      //   risk_flags: 1 * (link + type + flagged + severity + justification) = 5
      //   claim_sources: 1 * (claim_type + claim_id) = 2
      // Roughly 50-80 triples
      expect(triples.length).toBeGreaterThan(30)
      expect(triples.length).toBeLessThan(120)
    })

    it('contains key predicates for all major sections', () => {
      const keyPredicates = [
        'has Name',
        'has Max Supply',
        'has Allocation Segment',
        'has Vesting Schedule',
        'has Emission Model',
        'has Data Source',
      ]
      for (const predicate of keyPredicates) {
        expect(hasPredicate(triples, predicate)).toBe(true)
      }
    })
  })

  // =========================================================================
  // 6. Additional coverage
  // =========================================================================
  describe('minimal token (no optional data)', () => {
    it('produces only identity triples when all optional sections are empty/undefined', () => {
      const data = buildCompleteTokenData({
        supply: undefined,
        allocations: [],
        vesting: [],
        emission: undefined,
        sources: [],
        risk_flags: [],
        claim_sources: undefined,
        token: {
          ...buildCompleteTokenData().token,
          chain: null,
          contract_address: null,
          tge_date: null,
          category: null,
          sector: null,
        },
      })
      const triples = convertTokenToTriples(data)

      // Only the 3 always-present identity triples: name, status, completeness
      expect(triples).toHaveLength(3)
      expect(hasPredicate(triples, 'has Name')).toBe(true)
      expect(hasPredicate(triples, 'has Status')).toBe(true)
      expect(hasPredicate(triples, 'has Completeness Score')).toBe(true)
    })
  })

  describe('allocation segment ID format', () => {
    it('uses the pattern Allocation_{ticker}_{segment_type}_{index}', () => {
      const data = buildCompleteTokenData()
      const triples = convertTokenToTriples(data)

      const allocLinks = findTriples(triples, 'has Allocation Segment', 'TST')
      expect(allocLinks).toHaveLength(3)

      // Indices are 1-based
      expect(allocLinks[0].object).toBe('Allocation_TST_team-founders_1')
      expect(allocLinks[1].object).toBe('Allocation_TST_treasury_2')
      expect(allocLinks[2].object).toBe('Allocation_TST_airdrop_3')
    })
  })

  describe('vesting IDs reference correct allocation', () => {
    it('links the vesting schedule to the matching allocation ID', () => {
      const data = buildCompleteTokenData()
      const triples = convertTokenToTriples(data)

      // First vesting schedule is for alloc-1 (team-founders, index 0 -> suffix 1)
      const vestingLink1 = findTriple(
        triples,
        'has Vesting Schedule',
        'Allocation_TST_team-founders_1',
      )
      expect(vestingLink1).toBeDefined()
      expect(vestingLink1!.object).toBe('Vesting_TST_team-founders_1')

      // Second vesting schedule is for alloc-2 (treasury, index 1 -> suffix 2)
      const vestingLink2 = findTriple(
        triples,
        'has Vesting Schedule',
        'Allocation_TST_treasury_2',
      )
      expect(vestingLink2).toBeDefined()
      expect(vestingLink2!.object).toBe('Vesting_TST_treasury_2')
    })

    it('skips vesting schedules with no allocation object', () => {
      const data = buildCompleteTokenData({
        vesting: [
          {
            id: 'vest-no-alloc',
            allocation_id: 'alloc-1',
            cliff_months: 6,
            duration_months: 12,
            frequency: 'monthly',
            tge_percentage: null,
            cliff_unlock_percentage: null,
            start_date: null,
            notes: null,
            allocation: null,
          },
        ],
      })
      const triples = convertTokenToTriples(data)

      expect(hasPredicate(triples, 'has Vesting Schedule')).toBe(false)
    })
  })

  describe('convertMultipleTokensToTriples', () => {
    it('concatenates triples from multiple tokens', () => {
      const data1 = buildCompleteTokenData()
      const data2 = buildCompleteTokenData({
        token: {
          ...buildCompleteTokenData().token,
          id: 'tok-002',
          name: 'AnotherToken',
          ticker: 'ANT',
        },
      })

      const singleResult1 = convertTokenToTriples(data1)
      const singleResult2 = convertTokenToTriples(data2)
      const combined = convertMultipleTokensToTriples([data1, data2])

      expect(combined).toHaveLength(singleResult1.length + singleResult2.length)
    })

    it('returns an empty array for empty input', () => {
      const result = convertMultipleTokensToTriples([])
      expect(result).toEqual([])
    })

    it('preserves subjects from each token', () => {
      const data1 = buildCompleteTokenData()
      const data2 = buildCompleteTokenData({
        token: {
          ...buildCompleteTokenData().token,
          id: 'tok-002',
          name: 'SecondToken',
          ticker: 'SEC',
        },
      })

      const combined = convertMultipleTokensToTriples([data1, data2])

      const tstNames = findTriples(combined, 'has Name', 'TST')
      const secNames = findTriples(combined, 'has Name', 'SEC')

      expect(tstNames).toHaveLength(1)
      expect(tstNames[0].object).toBe('TestToken')
      expect(secNames).toHaveLength(1)
      expect(secNames[0].object).toBe('SecondToken')
    })
  })
})
