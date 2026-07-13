import { describe, it, expect } from 'vitest'

import {
  computeVestingTimeline,
  formatCompactNumber,
  type AllocationWithVesting,
} from './vesting'

const alloc = (
  overrides: Partial<AllocationWithVesting> = {},
): AllocationWithVesting => ({
  label: 'Team',
  segment_type: 'team-founders',
  percentage: 0,
  token_amount: 1_000,
  vesting: null,
  ...overrides,
})

describe('computeVestingTimeline', () => {
  it('unlocks everything at TGE for immediate or missing vesting', () => {
    const { timeline, maxMonth } = computeVestingTimeline({
      allocations: [
        alloc({ label: 'No vesting', vesting: null }),
        alloc({
          label: 'Immediate',
          vesting: {
            cliff_months: 0,
            duration_months: 12,
            frequency: 'immediate',
            tge_percentage: 0,
            cliff_unlock_percentage: 0,
          },
        }),
        alloc({
          label: 'Zero duration',
          vesting: {
            cliff_months: 0,
            duration_months: 0,
            frequency: 'monthly',
            tge_percentage: 0,
            cliff_unlock_percentage: 0,
          },
        }),
      ],
      maxSupply: 10_000,
      tgeDate: null,
    })
    // No linear schedule contributes a duration: minimum 1-month axis.
    expect(maxMonth).toBe(1)
    expect(timeline[0]['No vesting']).toBe(1_000)
    expect(timeline[0]['Immediate']).toBe(1_000)
    expect(timeline[0]['Zero duration']).toBe(1_000)
    expect(timeline[0].total).toBe(3_000)
    // Cumulative: nothing more unlocks afterwards.
    expect(timeline[1].total).toBe(3_000)
  })

  it('walks a hand-computed TGE + cliff + monthly linear schedule', () => {
    // 1000 tokens: 10% TGE (100), cliff M6 unlocking 20% of the remaining
    // 900 (180), then 720 linear over 12 months (60/month, M7 to M18).
    const { timeline, maxMonth } = computeVestingTimeline({
      allocations: [
        alloc({
          vesting: {
            cliff_months: 6,
            duration_months: 12,
            frequency: 'monthly',
            tge_percentage: 10,
            cliff_unlock_percentage: 20,
          },
        }),
      ],
      maxSupply: 10_000,
      tgeDate: null,
    })
    expect(maxMonth).toBe(18) // 6 + 12, already a multiple of 6
    expect(timeline[0].Team).toBe(100)
    expect(timeline[5].Team).toBe(100) // inside the cliff
    expect(timeline[6].Team).toBeCloseTo(280, 10) // cliff unlock lands
    expect(timeline[7].Team).toBeCloseTo(340, 10) // first linear month
    expect(timeline[18].Team).toBeCloseTo(1_000, 10) // fully vested
    expect(timeline[18].total).toBeCloseTo(1_000, 10)
  })

  it('places yearly unlocks on anniversaries with a final one at the end', () => {
    // Duration 30 months: ceil(30/12) = 3 events at M12, M24 and M30.
    const { timeline } = computeVestingTimeline({
      allocations: [
        alloc({
          vesting: {
            cliff_months: 0,
            duration_months: 30,
            frequency: 'yearly',
            tge_percentage: 0,
            cliff_unlock_percentage: 0,
          },
        }),
      ],
      maxSupply: 10_000,
      tgeDate: null,
    })
    expect(timeline[11].Team).toBe(0)
    expect(timeline[12].Team).toBeCloseTo(1_000 / 3, 10)
    expect(timeline[24].Team).toBeCloseTo(2_000 / 3, 10)
    expect(timeline[29].Team).toBeCloseTo(2_000 / 3, 10)
    expect(timeline[30].Team).toBeCloseTo(1_000, 10)
  })

  it('deduplicates same-label allocations into distinct series', () => {
    const { timeline, segmentKeys } = computeVestingTimeline({
      allocations: [alloc({ token_amount: 400 }), alloc({ token_amount: 600 })],
      maxSupply: 10_000,
      tgeDate: null,
    })
    expect(segmentKeys.map((s) => s.key)).toEqual(['Team (1)', 'Team (2)'])
    // Both keys map back to the original label and segment type.
    expect(segmentKeys.every((s) => s.label === 'Team')).toBe(true)
    expect(segmentKeys.every((s) => s.segment_type === 'team-founders')).toBe(
      true,
    )
    expect(timeline[0]['Team (1)']).toBe(400)
    expect(timeline[0]['Team (2)']).toBe(600)
    expect(timeline[0].total).toBe(1_000)
  })

  it('parks custom-frequency segments aside instead of plotting them', () => {
    const { timeline, customSegments } = computeVestingTimeline({
      allocations: [
        alloc({
          label: 'Rewards',
          segment_type: 'rewards',
          vesting: {
            cliff_months: 0,
            duration_months: 24,
            frequency: 'custom',
            tge_percentage: 0,
            cliff_unlock_percentage: 0,
          },
        }),
        alloc({ label: 'Public', segment_type: 'funding-public' }),
      ],
      maxSupply: 10_000,
      tgeDate: null,
    })
    expect(customSegments).toEqual(['Rewards'])
    expect(timeline[0]).not.toHaveProperty('Rewards')
    expect(timeline[0].total).toBe(1_000) // the custom segment adds nothing
  })

  it('falls back to percentage of max supply when token_amount is absent', () => {
    const { timeline } = computeVestingTimeline({
      allocations: [alloc({ token_amount: 0, percentage: 10 })],
      maxSupply: 1_000_000,
      tgeDate: null,
    })
    expect(timeline[0].Team).toBe(100_000)
  })

  it('applies a month-0 cliff unlock at TGE and rounds the axis up', () => {
    const { timeline, maxMonth } = computeVestingTimeline({
      allocations: [
        alloc({
          vesting: {
            cliff_months: 0,
            duration_months: 7, // rounds the axis up to 12
            frequency: 'monthly',
            tge_percentage: 10,
            cliff_unlock_percentage: 50,
          },
        }),
      ],
      maxSupply: 10_000,
      tgeDate: null,
    })
    expect(maxMonth).toBe(12)
    // 100 at TGE + 50% of the remaining 900 = 550 on day one.
    expect(timeline[0].Team).toBeCloseTo(550, 10)
    // 450 left over 7 months.
    expect(timeline[1].Team).toBeCloseTo(550 + 450 / 7, 10)
    expect(timeline[7].Team).toBeCloseTo(1_000, 10)
  })

  it('dates the months from the TGE across year boundaries', () => {
    const { timeline } = computeVestingTimeline({
      allocations: [alloc()],
      maxSupply: 10_000,
      tgeDate: '2026-11-15',
    })
    expect(timeline[0].date).toBe('Nov 2026')
    expect(timeline[1].date).toBe('Dec 2026')
    // date-fns handles the year rollover; a null TGE keeps dates null.
    const undated = computeVestingTimeline({
      allocations: [alloc()],
      maxSupply: 10_000,
      tgeDate: null,
    })
    expect(undated.timeline[0].date).toBeNull()
  })
})

describe('formatCompactNumber', () => {
  it('picks the unit by magnitude', () => {
    expect(formatCompactNumber(999)).toBe('999')
    expect(formatCompactNumber(1_500)).toBe('1.5K')
    expect(formatCompactNumber(1_000_000)).toBe('1.0M')
    expect(formatCompactNumber(2_500_000_000)).toBe('2.5B')
    expect(formatCompactNumber(1e12)).toBe('1.0T')
  })
})
