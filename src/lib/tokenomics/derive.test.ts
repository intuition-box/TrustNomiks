import { describe, it, expect } from 'vitest'
import { deriveTgeUnlock } from './derive'

describe('deriveTgeUnlock', () => {
  const segments = [
    { id: 'a1', percentage: '40', token_amount: '320,000,000' },
    { id: 'a2', percentage: '35' }, // no explicit amount: pct of max
    { id: 'a3', percentage: '25', token_amount: '200,000,000' },
  ]
  const schedules = {
    a1: { frequency: 'monthly', tge_percentage: '10' },
    a2: { frequency: 'immediate' },
    a3: { frequency: 'monthly', tge_percentage: '' },
  }

  it('sums immediate segments fully and vesting segments by their TGE share', () => {
    const unlock = deriveTgeUnlock(segments, schedules, '800,000,000')
    // a1: 320M x 10% = 32M; a2: 35% of 800M = 280M; a3: 0% at TGE
    expect(unlock.tokens).toBe(312_000_000)
    expect(unlock.pctOfMaxSupply).toBe(39)
  })

  it('ignores segments without a schedule yet', () => {
    const unlock = deriveTgeUnlock(
      segments,
      { a2: schedules.a2 },
      '800,000,000',
    )
    expect(unlock.tokens).toBe(280_000_000)
  })

  it('clamps a TGE percentage above 100', () => {
    const unlock = deriveTgeUnlock(
      [{ id: 'a1', percentage: '10' }],
      { a1: { frequency: 'monthly', tge_percentage: '250' } },
      '1,000',
    )
    expect(unlock.tokens).toBe(100)
  })

  it('degrades without a max supply: explicit amounts still count, pct is null', () => {
    const unlock = deriveTgeUnlock(
      [
        { id: 'a1', percentage: '40', token_amount: '1,000,000' },
        { id: 'a2', percentage: '35' }, // pct-only cannot resolve without max
      ],
      { a1: { frequency: 'immediate' }, a2: { frequency: 'immediate' } },
      '',
    )
    expect(unlock.tokens).toBe(1_000_000)
    expect(unlock.pctOfMaxSupply).toBeNull()
  })

  it('returns zero for an empty design', () => {
    expect(deriveTgeUnlock([], {}, '')).toEqual({
      tokens: 0,
      pctOfMaxSupply: null,
    })
  })
})
