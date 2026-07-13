import { describe, it, expect } from 'vitest'

import type { SupplyProjection, SupplyProjectionPoint } from '../projections'
import {
  DAYS_PER_YEAR,
  FAST_SELL_DAYS,
  IMPACT_DEPTH_COEFF,
  SimulationInputError,
  SLOW_SELL_MONTH_DAYS,
  UNLOCK_SELL_PROFILE,
  UNLOCK_SLOW_CUTOFF,
} from './calibration'
import { normalizeMacroWindows } from './models'
import {
  buildReleaseSchedule,
  normalizeDepthEvents,
  unlockImpactMuAtDay,
} from './releases'

const point = (
  month: number,
  unlockedDeltaByType: Record<string, number>,
  circulating: number,
  mintedDelta = 0,
): SupplyProjectionPoint => ({
  month,
  date: null,
  unlocked: circulating,
  minted: 0,
  circulating,
  unlockedDelta: Object.values(unlockedDeltaByType).reduce((a, b) => a + b, 0),
  mintedDelta,
  unlockedDeltaByType,
})

const supplyOf = (
  points: SupplyProjectionPoint[],
  maxSupply: number,
  finalCirculating = points[points.length - 1].circulating,
): SupplyProjection => ({
  points,
  horizonMonths: points.length - 1,
  maxSupply,
  emissionActive: false,
  timeline: [],
  segmentKeys: [],
  customSegments: [],
  finalCirculating,
  finalCirculatingPctOfMax: null,
})

const BULL_YEAR = normalizeMacroWindows(
  [{ fromMonth: 0, toMonth: 12, condition: 'bull' }],
  360,
)

describe('buildReleaseSchedule', () => {
  it('splits a monthly unlock into two 15-day tranches, emission included', () => {
    const supply = supplyOf(
      [
        point(0, {}, 0),
        point(1, {}, 0),
        point(2, {}, 1_000),
        point(3, { airdrop: 1_000 }, 2_000, 100),
      ],
      10_000,
    )
    const events = buildReleaseSchedule({
      supply,
      pctSoldByType: { airdrop: 80 },
      pctSoldEmission: 50,
      marketDepthUsd: 1_000_000,
      horizonDays: 360,
      windows: BULL_YEAR,
    })
    // month sold = 1000 x 0.8 + 100 x 0.5 = 850, halved per tranche
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ day: 90, tokensSold: 425, inert: false })
    expect(events[1]).toMatchObject({ day: 105, tokensSold: 425, inert: false })
  })

  it('marks sub-1% dilutions and post-70% months as inert', () => {
    const dilution = buildReleaseSchedule({
      supply: supplyOf(
        [
          point(0, { treasury: 10_000 }, 10_000),
          point(1, { treasury: 50 }, 10_050),
        ],
        100_000,
      ),
      pctSoldByType: { treasury: 100 },
      pctSoldEmission: 0,
      marketDepthUsd: 1_000_000,
      horizonDays: 60,
      windows: BULL_YEAR,
    })
    // month 0: preSupply is 0, the dilution test never fires (TGE simulated)
    expect(dilution.filter((e) => e.day < 30).every((e) => !e.inert)).toBe(true)
    // month 1: 50 / 10000 = 0.5% < 1% => inert
    expect(dilution.filter((e) => e.day >= 30).every((e) => e.inert)).toBe(true)

    const vested = buildReleaseSchedule({
      supply: supplyOf(
        [
          point(0, { treasury: 5_000 }, 5_000),
          point(1, { treasury: 2_500 }, 7_500),
        ],
        10_000,
      ),
      pctSoldByType: { treasury: 100 },
      pctSoldEmission: 0,
      marketDepthUsd: 1_000_000,
      horizonDays: 60,
      windows: BULL_YEAR,
    })
    // month 1 ends at 75% of the eventual supply => inert
    expect(vested.filter((e) => e.day >= 30).every((e) => e.inert)).toBe(true)
  })

  it('includes minted supply in the 70% threshold base', () => {
    const supply = supplyOf(
      [
        point(0, { treasury: 5_000 }, 5_000),
        point(1, { treasury: 2_500 }, 7_500),
      ],
      10_000,
      13_000, // inflationary: final circulating above max supply
    )
    const events = buildReleaseSchedule({
      supply,
      pctSoldByType: { treasury: 100 },
      pctSoldEmission: 0,
      marketDepthUsd: 1_000_000,
      horizonDays: 60,
      windows: BULL_YEAR,
    })
    // 7500 is 75% of maxSupply but only ~58% of the eventual 13000
    expect(events.filter((e) => e.day >= 30).every((e) => !e.inert)).toBe(true)
  })

  it('drops tranches past the horizon and disables on missing depth', () => {
    const supply = supplyOf(
      [
        point(0, {}, 0),
        point(1, {}, 0),
        point(2, {}, 1_000),
        point(3, { airdrop: 1_000 }, 2_000),
      ],
      10_000,
    )
    const truncated = buildReleaseSchedule({
      supply,
      pctSoldByType: { airdrop: 100 },
      pctSoldEmission: 0,
      marketDepthUsd: 1_000_000,
      horizonDays: 100,
      windows: BULL_YEAR,
    })
    expect(truncated.map((e) => e.day)).toEqual([90]) // day 105 dropped

    for (const depth of [0, null]) {
      const events = buildReleaseSchedule({
        supply,
        pctSoldByType: { airdrop: 100 },
        pctSoldEmission: 0,
        marketDepthUsd: depth,
        horizonDays: 360,
        windows: BULL_YEAR,
      })
      expect(events.every((e) => e.inert && e.fastMuPerUsd === 0)).toBe(true)
    }
  })

  it('matches the closed-form impact parameters and day-of-tranche regime', () => {
    const supply = supplyOf([point(0, { airdrop: 1_000 }, 1_000)], 10_000)
    const windows = normalizeMacroWindows(
      [
        { fromMonth: 0, toMonth: 3, condition: 'bull' },
        { fromMonth: 3, toMonth: 12, condition: 'bear' },
      ],
      360,
    )
    const [first] = buildReleaseSchedule({
      supply,
      pctSoldByType: { airdrop: 100 },
      pctSoldEmission: 0,
      marketDepthUsd: 1_000_000,
      horizonDays: 360,
      windows,
    })

    // Recompute the whole chain from the calibration constants (bull at day 0).
    const { slowMonths, ratioFast } = UNLOCK_SELL_PROFILE.bull
    const fastYears = FAST_SELL_DAYS / DAYS_PER_YEAR
    const slowYears = (slowMonths * SLOW_SELL_MONTH_DAYS) / DAYS_PER_YEAR
    const fastDecay = -Math.log(1 - ratioFast) / fastYears
    const slowDecay = -Math.log(UNLOCK_SLOW_CUTOFF) / slowYears
    const targetPerUsd = (-IMPACT_DEPTH_COEFF * 500) / 1_000_000
    const fastMuPerUsd =
      (fastDecay * slowDecay * targetPerUsd) /
      (fastDecay * (1 - ratioFast) + slowDecay * ratioFast)

    expect(first.condition).toBe('bull')
    expect(first.fastDecay).toBeCloseTo(fastDecay, 8)
    expect(first.slowDecay).toBeCloseTo(slowDecay, 8)
    expect(first.fastMuPerUsd).toBeCloseTo(fastMuPerUsd, 12)
    expect(first.fastMuPerUsd).toBeCloseTo(-3.5811e-4, 7) // magnitude sanity
    expect(first.slowMuPerUsd).toBeCloseTo(fastMuPerUsd * (1 - ratioFast), 12)
    // Two-piece structure: hard fast cutoff at D+15, slow clock from D+15,
    // slow expiry after its full decay length (5 / decay years).
    expect(first.fastEndDay - first.day).toBe(FAST_SELL_DAYS)
    expect(first.slowStartDay).toBe(first.fastEndDay)
    expect(first.slowEndDay).toBeCloseTo(
      first.slowStartDay + (5 / slowDecay) * DAYS_PER_YEAR,
      8,
    )

    // At tau = 0 only the fast phase contributes; at the slow start only
    // the slow phase does (fast has stopped), at its full mu.
    expect(unlockImpactMuAtDay(first, 2, first.day)).toBeCloseTo(
      2 * first.fastMuPerUsd,
      12,
    )
    expect(unlockImpactMuAtDay(first, 2, first.slowStartDay)).toBeCloseTo(
      2 * first.slowMuPerUsd,
      12,
    )
    expect(unlockImpactMuAtDay(first, 2, first.slowEndDay)).toBe(0)
    // Closed-form calibration identity: the continuous two-piece profile
    // integrates exactly to the -2% target (fast to its cutoff where the
    // residual is 1 - ratioFast, slow to infinity).
    const continuousIntegral =
      (first.fastMuPerUsd * ratioFast) / first.fastDecay +
      first.slowMuPerUsd / first.slowDecay
    expect(continuousIntegral).toBeCloseTo(targetPerUsd, 12)

    // A month-3 unlock lands in the bear window: shorter, sharper profile.
    const bearMonth = buildReleaseSchedule({
      supply: supplyOf(
        [
          point(0, {}, 0),
          point(1, {}, 0),
          point(2, {}, 1_000),
          point(3, { airdrop: 1_000 }, 2_000),
        ],
        10_000,
      ),
      pctSoldByType: { airdrop: 100 },
      pctSoldEmission: 0,
      marketDepthUsd: 1_000_000,
      horizonDays: 360,
      windows,
    })
    expect(bearMonth[0].condition).toBe('bear')
    const bearSlowYears = (3 * SLOW_SELL_MONTH_DAYS) / DAYS_PER_YEAR
    const bearSlowDecay = -Math.log(UNLOCK_SLOW_CUTOFF) / bearSlowYears
    expect(bearMonth[0].slowEndDay - bearMonth[0].slowStartDay).toBeCloseTo(
      (5 / bearSlowDecay) * DAYS_PER_YEAR,
      8,
    ) // shorter, sharper profile than bull
  })
})

describe('liquidity events', () => {
  // Two active unlock months (1 and 3): tranches at days 30/45 and 90/105.
  const twoUnlockSupply = supplyOf(
    [
      point(0, {}, 0),
      point(1, { airdrop: 1_000 }, 1_000),
      point(2, {}, 1_000),
      point(3, { airdrop: 1_000 }, 2_000),
    ],
    10_000,
  )
  const baseArgs = {
    supply: twoUnlockSupply,
    pctSoldByType: { airdrop: 100 },
    pctSoldEmission: 0,
    marketDepthUsd: 1_000_000,
    horizonDays: 360,
    windows: BULL_YEAR,
  }

  it('leaves the schedule bit-identical when absent or empty', () => {
    const reference = buildReleaseSchedule(baseArgs)
    expect(buildReleaseSchedule({ ...baseArgs, liquidityEvents: [] })).toEqual(
      reference,
    )
    expect(
      buildReleaseSchedule({ ...baseArgs, liquidityEvents: undefined }),
    ).toEqual(reference)
  })

  it('steps the depth at the event month: impact scales exactly', () => {
    const events = buildReleaseSchedule({
      ...baseArgs,
      liquidityEvents: [{ month: 2, depthUsd: 500_000 }],
    })
    expect(events.map((e) => e.day)).toEqual([30, 45, 90, 105])
    // Same tokens sold and regime on both months; only the depth differs,
    // so the closed form scales by exactly the depth ratio (a power of 2).
    expect(events[2].fastMuPerUsd).toBe(2 * events[0].fastMuPerUsd)
    expect(events[3].slowMuPerUsd).toBe(2 * events[1].slowMuPerUsd)

    // An event at month 0 is equivalent to replacing the baseline.
    const viaEvent = buildReleaseSchedule({
      ...baseArgs,
      liquidityEvents: [{ month: 0, depthUsd: 250_000 }],
    })
    const viaBaseline = buildReleaseSchedule({
      ...baseArgs,
      marketDepthUsd: 250_000,
    })
    expect(viaEvent).toEqual(viaBaseline)
  })

  it('handles markets drying up or only listing mid-horizon', () => {
    const dried = buildReleaseSchedule({
      ...baseArgs,
      liquidityEvents: [{ month: 2, depthUsd: 0 }],
    })
    expect(dried.filter((e) => e.day < 60).every((e) => !e.inert)).toBe(true)
    expect(
      dried
        .filter((e) => e.day >= 60)
        .every((e) => e.inert && e.fastMuPerUsd === 0),
    ).toBe(true)

    const listedLater = buildReleaseSchedule({
      ...baseArgs,
      marketDepthUsd: null,
      liquidityEvents: [{ month: 2, depthUsd: 250_000 }],
    })
    expect(listedLater.filter((e) => e.day < 60).every((e) => e.inert)).toBe(
      true,
    )
    expect(listedLater.filter((e) => e.day >= 60).every((e) => !e.inert)).toBe(
      true,
    )
  })

  it('never reactivates a month that is inert by supply facts', () => {
    // Month 1 dilutes 0.5% < 1%: inert regardless of how deep the market is.
    const events = buildReleaseSchedule({
      supply: supplyOf(
        [
          point(0, { treasury: 10_000 }, 10_000),
          point(1, { treasury: 50 }, 10_050),
        ],
        100_000,
      ),
      pctSoldByType: { treasury: 100 },
      pctSoldEmission: 0,
      marketDepthUsd: 1_000_000,
      liquidityEvents: [{ month: 1, depthUsd: 100_000_000 }],
      horizonDays: 60,
      windows: BULL_YEAR,
    })
    expect(events.filter((e) => e.day >= 30).every((e) => e.inert)).toBe(true)
  })

  it('normalizes and validates the event list', () => {
    expect(normalizeDepthEvents(undefined)).toEqual([])
    expect(normalizeDepthEvents([])).toEqual([])
    expect(
      normalizeDepthEvents([
        { month: 6, depthUsd: 1 },
        { month: 2, depthUsd: 3 },
      ]),
    ).toEqual([
      { day: 60, depthUsd: 3 },
      { day: 180, depthUsd: 1 },
    ])
    expect(() =>
      normalizeDepthEvents([
        { month: 2, depthUsd: 1 },
        { month: 2, depthUsd: 2 },
      ]),
    ).toThrow(SimulationInputError)
    expect(() => normalizeDepthEvents([{ month: -1, depthUsd: 1 }])).toThrow(
      SimulationInputError,
    )
    expect(() => normalizeDepthEvents([{ month: 1.5, depthUsd: 1 }])).toThrow(
      SimulationInputError,
    )
    expect(() => normalizeDepthEvents([{ month: 1, depthUsd: NaN }])).toThrow(
      SimulationInputError,
    )
  })
})
