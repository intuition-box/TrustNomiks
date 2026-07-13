import { describe, it, expect } from 'vitest'

import { DAYS_PER_YEAR } from './calibration'
import {
  aggregateKpis,
  buildEnvelope,
  computePathKpis,
  quantileSorted,
  type PathKpis,
} from './kpis'

describe('quantileSorted', () => {
  it('implements the type-7 convention', () => {
    const sorted = Float64Array.from([1, 2, 3, 4, 5])
    expect(quantileSorted(sorted, 0.5)).toBe(3)
    expect(quantileSorted(sorted, 0.25)).toBe(2) // idx = 1 exactly
    expect(quantileSorted(sorted, 0.1)).toBeCloseTo(1.4, 12) // idx 0.4
    expect(quantileSorted(sorted, 0)).toBe(1)
    expect(quantileSorted(sorted, 1)).toBe(5)
  })
})

describe('computePathKpis', () => {
  it('matches a hand-computed fixed series', () => {
    const path = Float64Array.from([100, 110, 99, 120, 120])
    const horizonYears = 4 / DAYS_PER_YEAR
    const kpis = computePathKpis(path, 100, horizonYears)
    expect(kpis.finalPrice).toBe(120)
    expect(kpis.maxPrice).toBe(120)
    expect(kpis.minPrice).toBe(99)
    expect(kpis.meanPrice).toBeCloseTo(109.8, 10)
    expect(kpis.medianPrice).toBe(110)
    expect(kpis.maxDrawdown).toBeCloseTo((99 - 110) / 110, 12) // -0.1
    expect(kpis.pctTimeIncreasing).toBe(50) // 2 strict rises / 4 steps
    expect(kpis.pctTimeBelowInitial).toBe(20) // 1 day of 5 below 100
    expect(kpis.cagr).toBeCloseTo(Math.pow(1.2, 1 / horizonYears) - 1, 6)
    expect(Number.isFinite(kpis.annualizedVolatility)).toBe(true)
  })

  it('annualizes volatility from sample log-returns; flat series degrade', () => {
    const path = Float64Array.from([
      100,
      100 * Math.exp(0.01),
      100 * Math.exp(0.03),
    ])
    const kpis = computePathKpis(path, 100, 2 / DAYS_PER_YEAR)
    // returns {0.01, 0.02}: sample std = sqrt(5e-5)
    const expectedVol = Math.sqrt(5e-5) * Math.sqrt(DAYS_PER_YEAR)
    expect(kpis.annualizedVolatility).toBeCloseTo(expectedVol, 10)
    // The 2-day cagr is astronomical, so compare sharpe at float64-relative
    // precision rather than absolute decimal places.
    expect(kpis.sharpe / (kpis.cagr / expectedVol)).toBeCloseTo(1, 10)

    const flat = computePathKpis(
      Float64Array.from([50, 50, 50]),
      50,
      2 / DAYS_PER_YEAR,
    )
    expect(flat.annualizedVolatility).toBe(0)
    expect(flat.sharpe).toBe(0)
    expect(flat.maxDrawdown).toBe(0)
    expect(flat.pctTimeIncreasing).toBe(0)
    expect(flat.pctTimeBelowInitial).toBe(0)
  })
})

describe('aggregateKpis and buildEnvelope', () => {
  const pathKpisOf = (finalPrice: number): PathKpis => ({
    finalPrice,
    cagr: finalPrice / 100,
    annualizedVolatility: 1,
    sharpe: 1,
    maxDrawdown: -0.1,
    maxPrice: finalPrice,
    meanPrice: finalPrice,
    medianPrice: finalPrice,
    minPrice: finalPrice,
    pctTimeIncreasing: 50,
    pctTimeBelowInitial: 50,
  })

  it('aggregates percentiles per metric', () => {
    const aggregate = aggregateKpis([
      pathKpisOf(10),
      pathKpisOf(40),
      pathKpisOf(20),
    ])
    expect(aggregate.finalPrice.mean).toBeCloseTo(70 / 3, 10)
    expect(aggregate.finalPrice.p20).toBeCloseTo(14, 10) // idx 0.4 in [10,20,40]
    expect(aggregate.finalPrice.p50).toBe(20)
    expect(aggregate.finalPrice.p80).toBeCloseTo(32, 10) // idx 1.6
    expect(aggregate.cagr.p50).toBeCloseTo(0.2, 12)
  })

  it('samples the envelope weekly plus the final day', () => {
    const nPaths = 3
    const steps = 16
    const paths = new Float64Array(nPaths * steps)
    for (let p = 0; p < nPaths; p++) {
      paths.fill(p + 1, p * steps, (p + 1) * steps) // constant paths 1, 2, 3
    }
    const envelope = buildEnvelope(paths, nPaths, steps)
    expect(envelope.map((point) => point.day)).toEqual([0, 7, 14, 15])
    for (const point of envelope) {
      expect(point.median).toBe(2)
      expect(point.p05).toBeCloseTo(1.1, 12) // idx 0.1 in [1,2,3]
      expect(point.p95).toBeCloseTo(2.9, 12)
    }
  })
})
