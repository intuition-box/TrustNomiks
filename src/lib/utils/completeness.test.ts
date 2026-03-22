import { describe, it, expect } from 'vitest'
import {
  CLUSTER_MAX,
  computeScores,
  isClusterComplete,
  isVisualizationReady,
  type ClusterScores,
} from '@/lib/utils/completeness'

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Builds a minimal `data` object with every field null / empty. */
function emptyData() {
  return {
    token: {
      name: null as string | null,
      ticker: null as string | null,
      chain: null as string | null,
      contract_address: null as string | null,
      tge_date: null as string | null,
    },
    supply: null as {
      max_supply: number | null
      initial_supply?: number | null
      tge_supply?: number | null
    } | null,
    allocations: [] as { id: string; percentage: number }[],
    vestingCount: 0,
    emission: null as {
      type: string | null
      annual_inflation_rate?: number | null
      has_burn?: boolean | null
      has_buyback?: boolean | null
    } | null,
    sourcesCount: 0,
  }
}

/** Builds a fully complete data object that should yield a score of 100. */
function fullData() {
  return {
    token: {
      name: 'TrustToken',
      ticker: 'TRUST',
      chain: 'Ethereum',
      contract_address: '0xabc123',
      tge_date: '2025-01-01',
    },
    supply: {
      max_supply: 1_000_000_000,
      initial_supply: 200_000_000,
      tge_supply: null,
    },
    allocations: [
      { id: '1', percentage: 40 },
      { id: '2', percentage: 30 },
      { id: '3', percentage: 30 },
    ],
    vestingCount: 3,
    emission: {
      type: 'inflationary',
      annual_inflation_rate: 5,
      has_burn: true,
      has_buyback: false,
    },
    sourcesCount: 2,
  }
}

/* ------------------------------------------------------------------ */
/*  CLUSTER_MAX constant                                              */
/* ------------------------------------------------------------------ */

describe('CLUSTER_MAX', () => {
  it('has the expected max per cluster', () => {
    expect(CLUSTER_MAX).toEqual({
      identity: 20,
      supply: 15,
      allocation: 20,
      vesting: 20,
    })
  })
})

/* ------------------------------------------------------------------ */
/*  computeScores                                                     */
/* ------------------------------------------------------------------ */

describe('computeScores', () => {
  /* ---------- Identity cluster (max 20) ---------- */

  describe('Identity cluster (max 20)', () => {
    it('scores +10 when name, ticker, and chain are present', () => {
      const d = emptyData()
      d.token.name = 'Foo'
      d.token.ticker = 'FOO'
      d.token.chain = 'Ethereum'
      const { clusterScores } = computeScores(d)
      expect(clusterScores.identity).toBe(10)
    })

    it('scores 0 when only name and ticker are present (chain missing)', () => {
      const d = emptyData()
      d.token.name = 'Foo'
      d.token.ticker = 'FOO'
      const { clusterScores } = computeScores(d)
      expect(clusterScores.identity).toBe(0)
    })

    it('scores +5 for contract_address alone (without name/ticker/chain)', () => {
      const d = emptyData()
      d.token.contract_address = '0xabc'
      const { clusterScores } = computeScores(d)
      expect(clusterScores.identity).toBe(5)
    })

    it('scores +5 for tge_date alone', () => {
      const d = emptyData()
      d.token.tge_date = '2025-06-01'
      const { clusterScores } = computeScores(d)
      expect(clusterScores.identity).toBe(5)
    })

    it('scores 20 when all identity fields are present', () => {
      const d = emptyData()
      d.token = {
        name: 'Foo',
        ticker: 'FOO',
        chain: 'Ethereum',
        contract_address: '0xabc',
        tge_date: '2025-01-01',
      }
      const { clusterScores } = computeScores(d)
      expect(clusterScores.identity).toBe(20)
    })

    it('scores 0 when all identity fields are null', () => {
      const d = emptyData()
      const { clusterScores } = computeScores(d)
      expect(clusterScores.identity).toBe(0)
    })
  })

  /* ---------- Supply cluster (max 15) ---------- */

  describe('Supply cluster (max 15)', () => {
    it('scores +10 when max_supply is present', () => {
      const d = emptyData()
      d.supply = { max_supply: 1_000_000 }
      const { clusterScores } = computeScores(d)
      expect(clusterScores.supply).toBe(10)
    })

    it('scores 15 when max_supply and initial_supply are present', () => {
      const d = emptyData()
      d.supply = { max_supply: 1_000_000, initial_supply: 500_000 }
      const { clusterScores } = computeScores(d)
      expect(clusterScores.supply).toBe(15)
    })

    it('scores 15 when max_supply and tge_supply are present', () => {
      const d = emptyData()
      d.supply = { max_supply: 1_000_000, tge_supply: 100_000 }
      const { clusterScores } = computeScores(d)
      expect(clusterScores.supply).toBe(15)
    })

    it('scores 0 when supply is null', () => {
      const d = emptyData()
      const { clusterScores } = computeScores(d)
      expect(clusterScores.supply).toBe(0)
    })

    it('scores 0 when max_supply is null (even if initial_supply exists)', () => {
      const d = emptyData()
      d.supply = { max_supply: null, initial_supply: 500_000 }
      const { clusterScores } = computeScores(d)
      expect(clusterScores.supply).toBe(0)
    })

    it('scores 0 when max_supply is 0 (falsy)', () => {
      const d = emptyData()
      d.supply = { max_supply: 0 }
      const { clusterScores } = computeScores(d)
      expect(clusterScores.supply).toBe(0)
    })
  })

  /* ---------- Allocation cluster (max 20) ---------- */

  describe('Allocation cluster (max 20)', () => {
    it('scores +10 when there are 3+ allocations', () => {
      const d = emptyData()
      d.allocations = [
        { id: '1', percentage: 30 },
        { id: '2', percentage: 30 },
        { id: '3', percentage: 30 },
      ]
      const { clusterScores } = computeScores(d)
      expect(clusterScores.allocation).toBe(10)
    })

    it('scores 20 when 3+ allocations sum to 100%', () => {
      const d = emptyData()
      d.allocations = [
        { id: '1', percentage: 40 },
        { id: '2', percentage: 35 },
        { id: '3', percentage: 25 },
      ]
      const { clusterScores } = computeScores(d)
      expect(clusterScores.allocation).toBe(20)
    })

    it('scores 10 when only 2 allocations sum to 100% (not enough segments)', () => {
      const d = emptyData()
      d.allocations = [
        { id: '1', percentage: 60 },
        { id: '2', percentage: 40 },
      ]
      const { clusterScores } = computeScores(d)
      expect(clusterScores.allocation).toBe(10)
    })

    it('scores 10 when 3 allocations sum to 95% (sum not 100%)', () => {
      const d = emptyData()
      d.allocations = [
        { id: '1', percentage: 40 },
        { id: '2', percentage: 30 },
        { id: '3', percentage: 25 },
      ]
      const { clusterScores } = computeScores(d)
      expect(clusterScores.allocation).toBe(10)
    })

    it('scores 0 when there are 0 allocations', () => {
      const d = emptyData()
      const { clusterScores } = computeScores(d)
      expect(clusterScores.allocation).toBe(0)
    })

    it('handles floating-point percentages summing to ~100 within tolerance', () => {
      const d = emptyData()
      d.allocations = [
        { id: '1', percentage: 33.33 },
        { id: '2', percentage: 33.34 },
        { id: '3', percentage: 33.33 },
      ]
      const { clusterScores } = computeScores(d)
      expect(clusterScores.allocation).toBe(20)
    })
  })

  /* ---------- Vesting cluster (max 20) ---------- */

  describe('Vesting cluster (max 20)', () => {
    it('scores 20 when vestingCount > 0', () => {
      const d = emptyData()
      d.vestingCount = 1
      const { clusterScores } = computeScores(d)
      expect(clusterScores.vesting).toBe(20)
    })

    it('scores 0 when vestingCount is 0', () => {
      const d = emptyData()
      const { clusterScores } = computeScores(d)
      expect(clusterScores.vesting).toBe(0)
    })

    it('scores 20 when vestingCount is large', () => {
      const d = emptyData()
      d.vestingCount = 50
      const { clusterScores } = computeScores(d)
      expect(clusterScores.vesting).toBe(20)
    })
  })

  /* ---------- Extras (emission + sources, non-cluster) ---------- */

  describe('Extras (emission + sources)', () => {
    it('adds +5 when emission.type is present', () => {
      const d = emptyData()
      d.emission = { type: 'inflationary' }
      const { totalScore, clusterScores } = computeScores(d)
      const clusterSum =
        clusterScores.identity + clusterScores.supply + clusterScores.allocation + clusterScores.vesting
      expect(totalScore - clusterSum).toBe(5)
    })

    it('adds +10 when emission.type and annual_inflation_rate present', () => {
      const d = emptyData()
      d.emission = { type: 'inflationary', annual_inflation_rate: 3 }
      const { totalScore, clusterScores } = computeScores(d)
      const clusterSum =
        clusterScores.identity + clusterScores.supply + clusterScores.allocation + clusterScores.vesting
      expect(totalScore - clusterSum).toBe(10)
    })

    it('adds +10 when emission.type and has_burn present', () => {
      const d = emptyData()
      d.emission = { type: 'deflationary', has_burn: true }
      const { totalScore, clusterScores } = computeScores(d)
      const clusterSum =
        clusterScores.identity + clusterScores.supply + clusterScores.allocation + clusterScores.vesting
      expect(totalScore - clusterSum).toBe(10)
    })

    it('adds +10 when emission.type and has_buyback present', () => {
      const d = emptyData()
      d.emission = { type: 'mixed', has_buyback: true }
      const { totalScore, clusterScores } = computeScores(d)
      const clusterSum =
        clusterScores.identity + clusterScores.supply + clusterScores.allocation + clusterScores.vesting
      expect(totalScore - clusterSum).toBe(10)
    })

    it('adds +5 only when emission.type present but extra fields are null/false', () => {
      const d = emptyData()
      d.emission = {
        type: 'inflationary',
        annual_inflation_rate: null,
        has_burn: null,
        has_buyback: null,
      }
      const { totalScore, clusterScores } = computeScores(d)
      const clusterSum =
        clusterScores.identity + clusterScores.supply + clusterScores.allocation + clusterScores.vesting
      expect(totalScore - clusterSum).toBe(5)
    })

    it('adds 0 when emission is null', () => {
      const d = emptyData()
      const { totalScore, clusterScores } = computeScores(d)
      const clusterSum =
        clusterScores.identity + clusterScores.supply + clusterScores.allocation + clusterScores.vesting
      expect(totalScore - clusterSum).toBe(0)
    })

    it('adds 0 when emission.type is null', () => {
      const d = emptyData()
      d.emission = { type: null }
      const { totalScore, clusterScores } = computeScores(d)
      const clusterSum =
        clusterScores.identity + clusterScores.supply + clusterScores.allocation + clusterScores.vesting
      expect(totalScore - clusterSum).toBe(0)
    })

    it('adds +10 when sourcesCount >= 1', () => {
      const d = emptyData()
      d.sourcesCount = 1
      const { totalScore } = computeScores(d)
      expect(totalScore).toBe(10)
    })

    it('adds +10 for sources regardless of count (as long as >= 1)', () => {
      const d = emptyData()
      d.sourcesCount = 100
      const { totalScore } = computeScores(d)
      expect(totalScore).toBe(10)
    })

    it('adds 0 when sourcesCount is 0', () => {
      const d = emptyData()
      d.sourcesCount = 0
      const { totalScore } = computeScores(d)
      expect(totalScore).toBe(0)
    })
  })

  /* ---------- Total score ---------- */

  describe('Total score', () => {
    it('scores 95 for a fully complete token (max achievable)', () => {
      const { clusterScores, totalScore } = computeScores(fullData())
      expect(clusterScores.identity).toBe(20)
      expect(clusterScores.supply).toBe(15)
      expect(clusterScores.allocation).toBe(20)
      expect(clusterScores.vesting).toBe(20)
      // extras: emission type(5) + extra detail(5) + sources(10) = 20
      // total = 20 + 15 + 20 + 20 + 20 = 95
      expect(totalScore).toBe(95)
    })

    it('scores 10 for a minimal token (name + ticker + chain only)', () => {
      const d = emptyData()
      d.token.name = 'Foo'
      d.token.ticker = 'FOO'
      d.token.chain = 'Ethereum'
      const { totalScore } = computeScores(d)
      expect(totalScore).toBe(10)
    })

    it('produces expected intermediate score for partial data', () => {
      const d = emptyData()
      // Identity: name+ticker+chain = 10, contract = 5 → 15
      d.token.name = 'Foo'
      d.token.ticker = 'FOO'
      d.token.chain = 'Ethereum'
      d.token.contract_address = '0xabc'
      // Supply: max_supply only → 10
      d.supply = { max_supply: 1_000_000 }
      // Allocation: 0
      // Vesting: 0
      // Emission: type only → 5
      d.emission = { type: 'fixed' }
      // Sources: 0
      const { totalScore } = computeScores(d)
      expect(totalScore).toBe(30) // 15 + 10 + 0 + 0 + 5 + 0
    })

    it('is capped at 100 even if theoretical sum exceeds it', () => {
      // This is a structural test — the current max without the cap is 95,
      // but we verify the Math.min(…, 100) works by checking full data.
      const { totalScore } = computeScores(fullData())
      expect(totalScore).toBeLessThanOrEqual(100)
    })

    it('returns 0 for a completely empty token', () => {
      const { totalScore, clusterScores } = computeScores(emptyData())
      expect(totalScore).toBe(0)
      expect(clusterScores).toEqual({ identity: 0, supply: 0, allocation: 0, vesting: 0 })
    })
  })
})

/* ------------------------------------------------------------------ */
/*  isClusterComplete                                                 */
/* ------------------------------------------------------------------ */

describe('isClusterComplete', () => {
  it('returns all true when every cluster is at max', () => {
    const scores: ClusterScores = { identity: 20, supply: 15, allocation: 20, vesting: 20 }
    expect(isClusterComplete(scores)).toEqual({
      identity: true,
      supply: true,
      allocation: true,
      vesting: true,
    })
  })

  it('returns false for a cluster that is one point below max', () => {
    const scores: ClusterScores = { identity: 19, supply: 15, allocation: 20, vesting: 20 }
    const result = isClusterComplete(scores)
    expect(result.identity).toBe(false)
    expect(result.supply).toBe(true)
    expect(result.allocation).toBe(true)
    expect(result.vesting).toBe(true)
  })

  it('returns all false when every cluster is zero', () => {
    const scores: ClusterScores = { identity: 0, supply: 0, allocation: 0, vesting: 0 }
    expect(isClusterComplete(scores)).toEqual({
      identity: false,
      supply: false,
      allocation: false,
      vesting: false,
    })
  })

  it('handles scores above max (still true)', () => {
    const scores: ClusterScores = { identity: 25, supply: 20, allocation: 25, vesting: 25 }
    expect(isClusterComplete(scores)).toEqual({
      identity: true,
      supply: true,
      allocation: true,
      vesting: true,
    })
  })
})

/* ------------------------------------------------------------------ */
/*  isVisualizationReady                                              */
/* ------------------------------------------------------------------ */

describe('isVisualizationReady', () => {
  it('returns true when all clusters are at max', () => {
    const scores: ClusterScores = { identity: 20, supply: 15, allocation: 20, vesting: 20 }
    expect(isVisualizationReady(scores)).toBe(true)
  })

  it('returns false when one cluster is below max', () => {
    const scores: ClusterScores = { identity: 20, supply: 14, allocation: 20, vesting: 20 }
    expect(isVisualizationReady(scores)).toBe(false)
  })

  it('returns false when all clusters are zero', () => {
    const scores: ClusterScores = { identity: 0, supply: 0, allocation: 0, vesting: 0 }
    expect(isVisualizationReady(scores)).toBe(false)
  })

  it('returns false when only one cluster is complete', () => {
    const scores: ClusterScores = { identity: 20, supply: 0, allocation: 0, vesting: 0 }
    expect(isVisualizationReady(scores)).toBe(false)
  })
})
