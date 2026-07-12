import { describe, it, expect } from 'vitest'

import type { AllocationWithId } from './math'
import type { EmissionModelFormData, VestingSchedule } from './schemas'
import {
  DEFAULT_EMISSION_SELL_PCT,
  DEFAULT_SELL_PRESSURE_PCT,
  buildProjectionInputs,
  computeSellPressure,
  computeSupplyProjection,
  summarizeProjection,
  type ProjectionScenario,
} from './projections'

const seg = (
  id: string,
  segment_type: string,
  token_amount: string,
  label = segment_type,
): AllocationWithId => ({
  id,
  segment_type,
  label,
  percentage: '0',
  token_amount,
})

const sched = (fields: Partial<VestingSchedule>): VestingSchedule => fields

const emission = (
  fields: Partial<EmissionModelFormData> & { type: string },
): EmissionModelFormData => fields as EmissionModelFormData

const FIXED_CAP = emission({ type: 'fixed_cap', annual_inflation_rate: '5' })

/** One 100%-immediate allocation of 1M tokens: constant emission base. */
const immediateInputs = (em: EmissionModelFormData | null) =>
  buildProjectionInputs({
    allocations: [seg('a', 'treasury', '1,000,000')],
    schedules: { a: sched({ frequency: 'immediate' }) },
    maxSupply: '1,000,000',
    emission: em,
    tgeDate: null,
  })

/** 1M tokens, 10% TGE then linear over 10 months (timeline rounds to 12). */
const linearInputs = (
  em: EmissionModelFormData | null = FIXED_CAP,
  tgeDate: string | null = null,
) =>
  buildProjectionInputs({
    allocations: [seg('a', 'team-founders', '1,000,000')],
    schedules: {
      a: sched({
        tge_percentage: '10',
        duration_months: '10',
        frequency: 'monthly',
      }),
    },
    maxSupply: '1,000,000',
    emission: em,
    tgeDate,
  })

const scenario = (
  overrides: Partial<ProjectionScenario> = {},
): ProjectionScenario => ({
  pctSoldByType: {},
  pctSoldEmission: DEFAULT_EMISSION_SELL_PCT,
  refPriceUsd: null,
  marketDepthUsd: null,
  ...overrides,
})

describe('buildProjectionInputs', () => {
  it('joins schedules by allocation id and parses form strings', () => {
    const inputs = buildProjectionInputs({
      allocations: [
        {
          id: 'a1',
          segment_type: 'team-founders',
          label: 'Team',
          percentage: '18,52',
          token_amount: '320,000,000',
        },
      ],
      schedules: {
        a1: sched({
          cliff_months: '6',
          duration_months: '24',
          frequency: 'monthly',
          tge_percentage: '10',
          cliff_unlock_percentage: '5',
        }),
      },
      maxSupply: '800,000,000',
      emission: null,
      tgeDate: null,
    })
    expect(inputs.maxSupply).toBe(800_000_000)
    expect(inputs.allocations[0]).toEqual({
      label: 'Team',
      segment_type: 'team-founders',
      percentage: 18.52,
      token_amount: 320_000_000,
      vesting: {
        cliff_months: 6,
        duration_months: 24,
        frequency: 'monthly',
        tge_percentage: 10,
        cliff_unlock_percentage: 5,
      },
    })
  })

  it('keeps vesting null for an allocation without a schedule', () => {
    const inputs = buildProjectionInputs({
      allocations: [seg('a1', 'airdrop', '1,000')],
      schedules: {},
      maxSupply: '1,000',
      emission: null,
      tgeDate: null,
    })
    expect(inputs.allocations[0].vesting).toBeNull()
  })

  it('mirrors the fixed_cap UI rule when parsing emission', () => {
    expect(immediateInputs(FIXED_CAP).emission.active).toBe(false)
    expect(
      immediateInputs(
        emission({ type: 'inflationary', annual_inflation_rate: '5' }),
      ).emission,
    ).toMatchObject({ active: true, annualRatePct: 5 })
    expect(immediateInputs(null).emission.active).toBe(false)
  })

  it('sorts the inflation schedule, drops invalid rows, last entry wins', () => {
    const inputs = immediateInputs(
      emission({
        type: 'inflationary',
        inflation_schedule: [
          { year: '2', rate: '5' },
          { year: '1', rate: '10' },
          { year: '2', rate: '4' },
          { year: 'x', rate: '1' },
        ],
      }),
    )
    expect(inputs.emission.schedule).toEqual([
      { year: 1, ratePct: 10 },
      { year: 2, ratePct: 4 },
    ])
    expect(inputs.emission.active).toBe(true)
  })
})

describe('computeSupplyProjection', () => {
  it('fixed cap: circulating equals unlocked over the vesting horizon', () => {
    const supply = computeSupplyProjection(linearInputs())
    expect(supply.emissionActive).toBe(false)
    expect(supply.horizonMonths).toBe(12)
    for (const point of supply.points) {
      expect(point.mintedDelta).toBe(0)
      expect(point.circulating).toBe(point.unlocked)
    }
    expect(supply.points[0].unlocked).toBeCloseTo(100_000, 5)
    expect(supply.points[10].unlocked).toBeCloseTo(1_000_000, 5)
    expect(supply.finalCirculatingPctOfMax).toBeCloseTo(100, 5)
  })

  it('flat 5%: twelve monthly steps recompose the annual rate', () => {
    const supply = computeSupplyProjection(
      immediateInputs(
        emission({ type: 'inflationary', annual_inflation_rate: '5' }),
      ),
    )
    expect(supply.horizonMonths).toBe(12) // floor raised for emission
    expect(supply.points[0].minted).toBe(0)
    expect(supply.points[12].circulating).toBeCloseTo(1_050_000, 0)
    expect(supply.finalCirculatingPctOfMax).toBeCloseTo(105, 3)
  })

  it('a non-empty schedule takes precedence over the flat rate', () => {
    const supply = computeSupplyProjection(
      immediateInputs(
        emission({
          type: 'inflationary',
          annual_inflation_rate: '99',
          inflation_schedule: [
            { year: '1', rate: '10' },
            { year: '2', rate: '5' },
          ],
        }),
      ),
      { horizonMonths: 24 },
    )
    expect(supply.points[12].circulating).toBeCloseTo(1_100_000, 0)
    expect(supply.points[24].circulating).toBeCloseTo(1_155_000, 0)
  })

  it('carries the last scheduled rate forward past the final year', () => {
    const supply = computeSupplyProjection(
      immediateInputs(
        emission({
          type: 'inflationary',
          inflation_schedule: [{ year: '1', rate: '10' }],
        }),
      ),
      { horizonMonths: 36 },
    )
    expect(supply.points[36].circulating).toBeCloseTo(1_331_000, 0)
  })

  it('fills schedule gaps with the previous defined rate', () => {
    const supply = computeSupplyProjection(
      immediateInputs(
        emission({
          type: 'inflationary',
          inflation_schedule: [
            { year: '1', rate: '10' },
            { year: '3', rate: '2' },
          ],
        }),
      ),
      { horizonMonths: 36 },
    )
    // year 2 carries 10%: 1M x 1.1 x 1.1 x 1.02
    expect(supply.points[36].circulating).toBeCloseTo(1_234_200, 0)
  })

  it('holds unlocks flat past the vesting end on a longer horizon', () => {
    const supply = computeSupplyProjection(
      linearInputs(FIXED_CAP, '2027-01-01'),
      {
        horizonMonths: 24,
      },
    )
    expect(supply.points[24].unlocked).toBeCloseTo(1_000_000, 5)
    expect(supply.points[24].unlockedDelta).toBe(0)
    expect(supply.points[24].date).toBe('Jan 2029')
  })

  it('degrades to all-zero points on an empty design', () => {
    const supply = computeSupplyProjection(
      buildProjectionInputs({
        allocations: [],
        schedules: {},
        maxSupply: '',
        emission: emission({
          type: 'inflationary',
          annual_inflation_rate: '50',
        }),
        tgeDate: null,
      }),
    )
    expect(supply.finalCirculatingPctOfMax).toBeNull()
    for (const point of supply.points) {
      expect(point.circulating).toBe(0)
      expect(Number.isNaN(point.minted)).toBe(false)
    }
  })

  it('passes custom-frequency segments through without plotting them', () => {
    const supply = computeSupplyProjection(
      buildProjectionInputs({
        allocations: [seg('a', 'rewards', '500,000', 'Rewards')],
        schedules: { a: sched({ frequency: 'custom' }) },
        maxSupply: '500,000',
        emission: null,
        tgeDate: null,
      }),
    )
    expect(supply.customSegments).toEqual(['Rewards'])
    for (const point of supply.points) {
      expect(point.unlocked).toBe(0)
      expect(point.unlockedDeltaByType).toEqual({})
    }
  })
})

describe('computeSellPressure', () => {
  it('applies per-segment percentages and the -2% depth formula', () => {
    const supply = computeSupplyProjection(
      buildProjectionInputs({
        allocations: [
          seg('a', 'team-founders', '1,000'),
          seg('b', 'treasury', '1,000'),
        ],
        schedules: {
          a: sched({ frequency: 'immediate' }),
          b: sched({ frequency: 'immediate' }),
        },
        maxSupply: '2,000',
        emission: null,
        tgeDate: null,
      }),
    )
    const pressure = computeSellPressure(
      supply,
      scenario({
        pctSoldByType: { 'team-founders': 50, treasury: 10 },
        refPriceUsd: 0.1,
        marketDepthUsd: 30,
      }),
    )
    expect(pressure.points[0].tokensSold).toBeCloseTo(600, 5) // 500 + 100
    expect(pressure.points[0].soldByType['team-founders']).toBeCloseTo(500, 5)
    expect(pressure.points[0].soldByType.treasury).toBeCloseTo(100, 5)
    expect(pressure.points[0].soldFromEmission).toBe(0)
    expect(pressure.points[0].soldUsd).toBeCloseTo(60, 5)
    expect(pressure.points[0].priceImpactPct).toBeCloseTo(-4, 5)

    // selling exactly the depth estimates a -2% move
    const pivot = computeSellPressure(
      supply,
      scenario({
        pctSoldByType: { 'team-founders': 50, treasury: 10 },
        refPriceUsd: 0.1,
        marketDepthUsd: 60,
      }),
    )
    expect(pivot.points[0].priceImpactPct).toBeCloseTo(-2, 5)
  })

  it('falls back to DEFAULT_SELL_PRESSURE_PCT for missing types', () => {
    const supply = computeSupplyProjection(
      buildProjectionInputs({
        allocations: [seg('a', 'airdrop', '100')],
        schedules: { a: sched({ frequency: 'immediate' }) },
        maxSupply: '100',
        emission: null,
        tgeDate: null,
      }),
    )
    const pressure = computeSellPressure(supply, scenario())
    expect(DEFAULT_SELL_PRESSURE_PCT.airdrop).toBe(90)
    expect(pressure.points[0].tokensSold).toBeCloseTo(90, 5)
  })

  it('includes minted tokens in the monthly pressure', () => {
    const supply = computeSupplyProjection(
      immediateInputs(
        emission({ type: 'inflationary', annual_inflation_rate: '5' }),
      ),
    )
    const pressure = computeSellPressure(
      supply,
      scenario({ pctSoldByType: { treasury: 0 }, pctSoldEmission: 50 }),
    )
    const m12 = pressure.points[12]
    expect(m12.mintedDelta).toBeGreaterThan(0)
    expect(m12.newTokens).toBeCloseTo(m12.mintedDelta, 8)
    expect(m12.tokensSold).toBeCloseTo(m12.mintedDelta * 0.5, 8)
    expect(m12.soldFromEmission).toBeCloseTo(m12.mintedDelta * 0.5, 8)
    expect(m12.soldByType).toEqual({}) // treasury at 0%: zero rows omitted
  })

  it('clamps percentages and treats NaN as zero', () => {
    const supply = computeSupplyProjection(
      buildProjectionInputs({
        allocations: [seg('a', 'treasury', '1,000')],
        schedules: { a: sched({ frequency: 'immediate' }) },
        maxSupply: '1,000',
        emission: null,
        tgeDate: null,
      }),
    )
    const over = computeSellPressure(
      supply,
      scenario({ pctSoldByType: { treasury: 150 } }),
    )
    expect(over.points[0].tokensSold).toBeCloseTo(1_000, 5)
    const nan = computeSellPressure(
      supply,
      scenario({ pctSoldByType: { treasury: NaN }, pctSoldEmission: NaN }),
    )
    expect(nan.points[0].tokensSold).toBe(0)
  })

  it('runs tokens-only when no price is set', () => {
    const supply = computeSupplyProjection(linearInputs())
    const pressure = computeSellPressure(
      supply,
      scenario({ pctSoldByType: { 'team-founders': 100 } }),
    )
    expect(pressure.hasPrice).toBe(false)
    expect(pressure.points[0].tokensSold).toBeCloseTo(100_000, 5)
    expect(pressure.points[0].soldUsd).toBeNull()
    expect(pressure.points[0].priceImpactPct).toBeNull()
  })

  it('skips the impact estimate without a positive depth', () => {
    const supply = computeSupplyProjection(linearInputs())
    for (const depth of [0, null]) {
      const pressure = computeSellPressure(
        supply,
        scenario({
          pctSoldByType: { 'team-founders': 100 },
          refPriceUsd: 1,
          marketDepthUsd: depth,
        }),
      )
      expect(pressure.hasDepth).toBe(false)
      expect(pressure.points[0].soldUsd).toBeCloseTo(100_000, 5)
      expect(pressure.points[0].priceImpactPct).toBeNull()
    }
  })
})

describe('summarizeProjection', () => {
  const linearScenario = scenario({
    pctSoldByType: { 'team-founders': 100 },
    pctSoldEmission: 0,
    refPriceUsd: 1,
    marketDepthUsd: 100_000,
  })

  it('reports FDV, the worst month, and months above depth', () => {
    const supply = computeSupplyProjection(linearInputs())
    const pressure = computeSellPressure(supply, linearScenario)
    const summary = summarizeProjection(supply, pressure, linearScenario)
    expect(summary.impliedFdvUsd).toBe(1_000_000)
    // TGE unlock (100k) equals the depth; months 1-10 sell 90k each
    expect(summary.worstMonth?.month).toBe(0)
    expect(summary.worstMonth?.soldUsd).toBeCloseTo(100_000, 5)
    expect(summary.monthsAboveDepth).toBe(0) // strictly above only
  })

  it('keeps the earliest month on ties', () => {
    const supply = computeSupplyProjection(
      buildProjectionInputs({
        allocations: [seg('a', 'team-founders', '1,000')],
        schedules: {
          a: sched({ duration_months: '10', frequency: 'monthly' }),
        },
        maxSupply: '1,000',
        emission: null,
        tgeDate: null,
      }),
    )
    const pressure = computeSellPressure(supply, linearScenario)
    const summary = summarizeProjection(supply, pressure, linearScenario)
    expect(summary.worstMonth?.month).toBe(1) // months 1-10 all sell 100
  })

  it('falls back to token counts in tokens-only mode', () => {
    const tokensOnly = scenario({ pctSoldByType: { 'team-founders': 100 } })
    const supply = computeSupplyProjection(linearInputs())
    const pressure = computeSellPressure(supply, tokensOnly)
    const summary = summarizeProjection(supply, pressure, tokensOnly)
    expect(summary.impliedFdvUsd).toBeNull()
    expect(summary.worstMonth?.month).toBe(0)
    expect(summary.worstMonth?.soldUsd).toBeNull()
    expect(summary.monthsAboveDepth).toBeNull()
  })

  it('returns a null worst month when nothing is sold', () => {
    const nothingSold = scenario({
      pctSoldByType: { 'team-founders': 0 },
      pctSoldEmission: 0,
      refPriceUsd: 1,
      marketDepthUsd: 1_000,
    })
    const supply = computeSupplyProjection(linearInputs())
    const pressure = computeSellPressure(supply, nothingSold)
    const summary = summarizeProjection(supply, pressure, nothingSold)
    expect(summary.worstMonth).toBeNull()
    expect(summary.monthsAboveDepth).toBe(0)
  })
})
