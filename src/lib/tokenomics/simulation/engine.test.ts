import { describe, it, expect } from 'vitest'

import { buildProjectionInputs, computeSupplyProjection } from '../projections'
import type { SupplyProjection, SupplyProjectionPoint } from '../projections'
import {
  DAYS_PER_YEAR,
  DT,
  MACRO_CALIBRATION,
  SQRT_DT,
  SimulationInputError,
} from './calibration'
import { runSimulation, simulatePaths, type SimulationScenario } from './engine'
import { createRng } from './rng'

const emptyPoint = (month: number): SupplyProjectionPoint => ({
  month,
  date: null,
  unlocked: 0,
  minted: 0,
  circulating: 0,
  unlockedDelta: 0,
  mintedDelta: 0,
  unlockedDeltaByType: {},
})

const EMPTY_SUPPLY: SupplyProjection = {
  points: [emptyPoint(0), emptyPoint(1)],
  horizonMonths: 1,
  maxSupply: 0,
  emissionActive: false,
  timeline: [],
  segmentKeys: [],
  customSegments: [],
  finalCirculating: 0,
  finalCirculatingPctOfMax: null,
}

/** Real projection: 1M team tokens, 10% TGE then linear over 10 months. */
const teamSupply = () =>
  computeSupplyProjection(
    buildProjectionInputs({
      allocations: [
        {
          id: 'a',
          segment_type: 'team-founders',
          label: 'Team',
          percentage: '0',
          token_amount: '1,000,000',
        },
      ],
      schedules: {
        a: {
          tge_percentage: '10',
          duration_months: '10',
          frequency: 'monthly',
        },
      },
      maxSupply: '1,000,000',
      emission: null,
      tgeDate: null,
    }),
  )

const scenarioOf = (
  overrides: Partial<SimulationScenario> = {},
): SimulationScenario => ({
  seed: 42,
  initialPriceUsd: 100,
  marketDepthUsd: null,
  category: 'financial',
  pctSoldByType: {},
  pctSoldEmission: 0,
  macroWindows: [{ fromMonth: 0, toMonth: 12, condition: 'bull' }],
  crises: [],
  horizonMonths: 12,
  ...overrides,
})

describe('simulatePaths', () => {
  it('reproduces a hand-computed single path from injected z', () => {
    const { mu, sigma } = MACRO_CALIBRATION.bull.financial
    const dayMu = 0.3 + mu // constant bias + macro
    const base = {
      mu: Float64Array.from([0, dayMu, dayMu]),
      sigma: Float64Array.from([0, sigma, sigma]),
    }
    const paths = simulatePaths({
      initialPriceUsd: 100,
      base,
      releases: [],
      nPaths: 1,
      steps: 3,
      z: [Float64Array.from([0.5, -1])],
    })
    const step = (price: number, z: number) =>
      price * Math.exp((dayMu - 0.5 * sigma * sigma) * DT + sigma * SQRT_DT * z)
    const p1 = step(100, 0.5)
    const p2 = step(p1, -1)
    expect(paths[0]).toBe(100)
    expect(paths[1]).toBeCloseTo(p1, 10)
    expect(paths[2]).toBeCloseTo(p2, 10)
  })

  it('is a martingale at zero drift and collapses on zero noise', () => {
    const steps = 91
    const sigma = 0.8
    const base = {
      mu: new Float64Array(steps).fill(0),
      sigma: new Float64Array(steps).fill(sigma),
    }
    const nPaths = 500
    const paths = simulatePaths({
      initialPriceUsd: 100,
      base,
      releases: [],
      nPaths,
      steps,
      rng: createRng(7),
    })
    let sum = 0
    for (let p = 0; p < nPaths; p++) {
      sum += paths[p * steps + steps - 1]
    }
    // E[final] = initial; tolerance ~3 standard errors of the lognormal.
    expect(Math.abs(sum / nPaths - 100)).toBeLessThan(6)

    const still = simulatePaths({
      initialPriceUsd: 100,
      base,
      releases: [],
      nPaths: 1,
      steps,
      z: [new Float64Array(steps - 1)], // all-zero noise
    })
    const totalYears = (steps - 1) / DAYS_PER_YEAR
    expect(still[steps - 1]).toBeCloseTo(
      100 * Math.exp(-0.5 * sigma * sigma * totalYears),
      8,
    )
  })
})

describe('runSimulation', () => {
  it('is bit-reproducible per seed and stamps the meta', () => {
    const first = runSimulation(EMPTY_SUPPLY, scenarioOf({ nPaths: 100 }))
    const second = runSimulation(EMPTY_SUPPLY, scenarioOf({ nPaths: 100 }))
    const reseeded = runSimulation(
      EMPTY_SUPPLY,
      scenarioOf({ nPaths: 100, seed: 43 }),
    )
    expect(second.envelope).toEqual(first.envelope)
    expect(second.kpis).toEqual(first.kpis)
    expect(reseeded.kpis.finalPrice.p50).not.toBe(first.kpis.finalPrice.p50)
    expect(first.meta.engineVersion).toBe('1')
    expect(first.meta.steps).toBe(12 * 30 + 1)
    expect(first.meta.nPaths).toBe(100)
    expect(first.meta.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('runs end-to-end on a real projection with ordered envelope bands', () => {
    const supply = teamSupply()
    const scenario = scenarioOf({
      nPaths: 100,
      marketDepthUsd: 50_000,
      pctSoldByType: { 'team-founders': 100 },
      macroWindows: [{ fromMonth: 0, toMonth: 12, condition: 'bear' }],
      crises: [{ month: 2, type: 'ftx' }],
    })
    const result = runSimulation(supply, scenario)

    expect(result.envelope).toHaveLength(53) // 0,7,...,357 plus day 360
    expect(result.envelope[result.envelope.length - 1].day).toBe(360)
    for (const point of result.envelope) {
      expect(point.p05).toBeLessThanOrEqual(point.p10)
      expect(point.p10).toBeLessThanOrEqual(point.p20)
      expect(point.p20).toBeLessThanOrEqual(point.p35)
      expect(point.p35).toBeLessThanOrEqual(point.median)
      expect(point.median).toBeLessThanOrEqual(point.p65)
      expect(point.p65).toBeLessThanOrEqual(point.p80)
      expect(point.p80).toBeLessThanOrEqual(point.p90)
      expect(point.p90).toBeLessThanOrEqual(point.p95)
    }
    for (const aggregate of Object.values(result.kpis)) {
      expect(Number.isFinite(aggregate.mean)).toBe(true)
      expect(Number.isFinite(aggregate.p50)).toBe(true)
    }

    // Unlock pressure lowers the median outcome at identical noise (the
    // release models consume no randomness, so both runs see the same z).
    const noSales = runSimulation(
      supply,
      scenarioOf({
        nPaths: 100,
        marketDepthUsd: 50_000,
        pctSoldByType: { 'team-founders': 0 },
        macroWindows: [{ fromMonth: 0, toMonth: 12, condition: 'bear' }],
        crises: [{ month: 2, type: 'ftx' }],
      }),
    )
    expect(result.kpis.finalPrice.p50).toBeLessThan(noSales.kpis.finalPrice.p50)
  })

  it('treats liquidity events as a pure extension of the scenario', () => {
    const supply = teamSupply()
    const scenario = scenarioOf({
      nPaths: 100,
      marketDepthUsd: 50_000,
      pctSoldByType: { 'team-founders': 100 },
      macroWindows: [{ fromMonth: 0, toMonth: 12, condition: 'bear' }],
    })
    const baseline = runSimulation(supply, scenario)

    // No events, an empty list and a day-0 restatement of the baseline
    // depth are all bit-identical: the extension cannot drift the engine.
    const empty = runSimulation(supply, { ...scenario, liquidityEvents: [] })
    const restated = runSimulation(supply, {
      ...scenario,
      liquidityEvents: [{ month: 0, depthUsd: 50_000 }],
    })
    expect(empty.envelope).toEqual(baseline.envelope)
    expect(empty.kpis).toEqual(baseline.kpis)
    expect(restated.envelope).toEqual(baseline.envelope)
    expect(restated.kpis).toEqual(baseline.kpis)

    // Halving the depth mid-horizon steepens the unlock impact: lower
    // median at identical noise (releases consume no randomness).
    const halved = runSimulation(supply, {
      ...scenario,
      liquidityEvents: [{ month: 6, depthUsd: 25_000 }],
    })
    expect(halved.kpis.finalPrice.p50).toBeLessThan(
      baseline.kpis.finalPrice.p50,
    )
  })

  it('validates its inputs and clamps nPaths', () => {
    expect(() =>
      runSimulation(EMPTY_SUPPLY, scenarioOf({ initialPriceUsd: 0 })),
    ).toThrow(SimulationInputError)
    expect(() =>
      runSimulation(EMPTY_SUPPLY, scenarioOf({ category: 'not-a-category' })),
    ).toThrow(SimulationInputError)
    expect(() =>
      runSimulation(
        EMPTY_SUPPLY,
        scenarioOf({
          macroWindows: [
            { fromMonth: 0, toMonth: 3, condition: 'bull' },
            { fromMonth: 4, toMonth: 12, condition: 'bear' },
          ],
        }),
      ),
    ).toThrow(SimulationInputError)
    expect(() =>
      runSimulation(EMPTY_SUPPLY, scenarioOf({ horizonMonths: 1 }), {
        z: [new Float64Array(5)], // expected width is 30
      }),
    ).toThrow(SimulationInputError)

    const small = runSimulation(
      EMPTY_SUPPLY,
      scenarioOf({ nPaths: 5, horizonMonths: 1 }),
    )
    expect(small.meta.nPaths).toBe(100)
    const large = runSimulation(
      EMPTY_SUPPLY,
      scenarioOf({ nPaths: 5000, horizonMonths: 1 }),
    )
    expect(large.meta.nPaths).toBe(2000)
  })

  it('defines nPaths from an injected z matrix without clamping', () => {
    const result = runSimulation(
      EMPTY_SUPPLY,
      scenarioOf({ horizonMonths: 1 }),
      {
        z: [new Float64Array(30)],
      },
    )
    expect(result.meta.nPaths).toBe(1)
    // A single path makes every aggregate collapse to the same value.
    expect(result.kpis.finalPrice.p20).toBe(result.kpis.finalPrice.p80)
    expect(result.kpis.finalPrice.mean).toBe(result.kpis.finalPrice.p50)
  })
})
