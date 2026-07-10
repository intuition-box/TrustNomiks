import { describe, it, expect } from 'vitest'
import { CONTRIBUTION_TIERS, getTierIndex } from './tiers'

describe('getTierIndex', () => {
  it('returns Observer (0) for a zero count', () => {
    expect(getTierIndex(0)).toBe(0)
  })

  it('returns Observer (0) for a count inside its range', () => {
    expect(getTierIndex(2)).toBe(0)
  })

  it('returns Contributor (1) at the lower boundary', () => {
    expect(getTierIndex(3)).toBe(1)
  })

  it('returns Curator (2) at the upper boundary', () => {
    expect(getTierIndex(24)).toBe(2)
  })

  it('returns Cartographer (3) inside its range', () => {
    expect(getTierIndex(30)).toBe(3)
  })

  it('returns Architect (4) for any large count (open-ended max)', () => {
    expect(getTierIndex(50)).toBe(4)
    expect(getTierIndex(10_000)).toBe(4)
  })

  it('never returns an out-of-range index', () => {
    for (const count of [-5, 0, 1, 5, 15, 40, 100]) {
      const idx = getTierIndex(count)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(CONTRIBUTION_TIERS.length)
    }
  })
})
