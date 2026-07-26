import { describe, expect, it } from 'vitest'
import { buildPromotedTokenScore } from './promote'

/**
 * Characterization of the screener-scale score a freshly promoted design
 * earns. A design has no chain (identity's first +10 needs name+ticker+chain),
 * no contract (+5), no tge_date (+5) and no sources (+10) — those points are
 * earned later in the screener studio. Locks the mapping through the shared
 * computeScores so a scorer change surfaces here instead of silently shifting
 * every promoted token's completeness.
 */
describe('buildPromotedTokenScore', () => {
  const fullDesign = {
    name: 'Probe',
    ticker: 'PRB',
    hasMaxSupply: true,
    hasTgeSupply: true,
    allocations: [
      { id: 'a', percentage: 50 },
      { id: 'b', percentage: 30 },
      { id: 'c', percentage: 20 },
    ],
    vestingCount: 3,
    emission: { type: 'inflationary', annual_inflation_rate: 5 },
  }

  it('scores a complete design at 65/100 on the screener scale', () => {
    const { clusterScores, totalScore } = buildPromotedTokenScore(fullDesign)
    expect(clusterScores).toEqual({
      identity: 0, // no chain / contract / tge_date yet
      supply: 15, // max_supply +10, tge_supply +5
      allocation: 20, // ≥3 segments +10, sum 100 +10
      vesting: 20,
    })
    // 55 cluster points + emission extras (type +5, rate +5), no sources
    expect(totalScore).toBe(65)
  })

  it('scores a pure fixed cap identically (the type completes emission)', () => {
    const { totalScore } = buildPromotedTokenScore({
      ...fullDesign,
      emission: { type: 'fixed_cap' },
    })
    expect(totalScore).toBe(65)
  })

  it('drops the +5 launch-figure point without a derived TGE unlock', () => {
    const { totalScore } = buildPromotedTokenScore({
      ...fullDesign,
      hasTgeSupply: false,
    })
    expect(totalScore).toBe(60)
  })

  it('scores an empty design at 0 without throwing', () => {
    const { clusterScores, totalScore } = buildPromotedTokenScore({
      name: null,
      ticker: null,
      hasMaxSupply: false,
      hasTgeSupply: false,
      allocations: [],
      vestingCount: 0,
      emission: null,
    })
    expect(totalScore).toBe(0)
    expect(clusterScores).toEqual({
      identity: 0,
      supply: 0,
      allocation: 0,
      vesting: 0,
    })
  })
})
