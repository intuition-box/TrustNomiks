import { describe, it, expect } from 'vitest'
import {
  computeFactoryScore,
  FACTORY_CLUSTER_MAX,
  FACTORY_MAX_RAW_SCORE,
  FACTORY_RESCALE,
} from './factory-score'

const emptyDesign = {
  project: { name: null, ticker: null, category: null, sector: null },
  supply: null,
  allocations: [],
  vestingCount: 0,
  emission: null,
}

const completeDesign = {
  project: {
    name: 'Meridian',
    ticker: 'MRD',
    category: 'open-digital-economy',
    sector: 'gaming-ecosystem',
  },
  supply: { max_supply: 1_000_000_000 },
  allocations: [
    { id: 'a1', percentage: 50 },
    { id: 'a2', percentage: 25 },
    { id: 'a3', percentage: 25 },
  ],
  vestingCount: 3,
  // Deliberately a PURE fixed cap (no burn, no buyback): the type alone must
  // complete the emission cluster, or a BTC-style design can never reach 100.
  emission: { type: 'fixed_cap' },
}

describe('computeFactoryScore', () => {
  it('scores an empty design at 0', () => {
    const { clusterScores, totalScore } = computeFactoryScore(emptyDesign)
    expect(clusterScores).toEqual({
      identity: 0,
      supply: 0,
      allocation: 0,
      vesting: 0,
      emission: 0,
    })
    expect(totalScore).toBe(0)
  })

  it('scores a complete design at exactly 100 (the rescale contract)', () => {
    const { clusterScores, totalScore } = computeFactoryScore(completeDesign)
    expect(clusterScores).toEqual(FACTORY_CLUSTER_MAX)
    expect(totalScore).toBe(100)
  })

  it('rescales a partial raw score through FACTORY_RESCALE, rounded', () => {
    // identity 10 (no taxonomy yet) + supply 15 = raw 25 -> 31/100
    const { clusterScores, totalScore } = computeFactoryScore({
      ...emptyDesign,
      project: { name: 'X', ticker: 'X', category: null, sector: null },
      supply: { max_supply: 1000 },
    })
    expect(clusterScores.identity).toBe(10)
    expect(clusterScores.supply).toBe(15)
    expect(totalScore).toBe(Math.round(25 * FACTORY_RESCALE))
    expect(totalScore).toBe(31)
  })

  it('withholds the allocation sum bonus off exactly 100 percent', () => {
    const { clusterScores } = computeFactoryScore({
      ...emptyDesign,
      allocations: [
        { id: 'a1', percentage: 60 },
        { id: 'a2', percentage: 25 },
        { id: 'a3', percentage: 25 },
      ],
    })
    expect(clusterScores.allocation).toBe(10)
  })

  it('holds back the second emission point until a mechanic is declared', () => {
    const bare = computeFactoryScore({
      ...emptyDesign,
      emission: { type: 'inflationary' },
    })
    expect(bare.clusterScores.emission).toBe(5)
    const declared = computeFactoryScore({
      ...emptyDesign,
      emission: { type: 'inflationary', annual_inflation_rate: 4 },
    })
    expect(declared.clusterScores.emission).toBe(10)
  })

  it('keeps the cluster maxes summing to the raw ceiling', () => {
    const sum = Object.values(FACTORY_CLUSTER_MAX).reduce((a, b) => a + b, 0)
    expect(sum).toBe(FACTORY_MAX_RAW_SCORE)
    expect(FACTORY_RESCALE * FACTORY_MAX_RAW_SCORE).toBe(100)
  })
})
