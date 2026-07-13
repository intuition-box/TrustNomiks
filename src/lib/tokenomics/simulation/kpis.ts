/**
 * Post-processing of simulated price paths: per-path KPIs, cross-path
 * aggregates (percentile per metric, never the metrics of a percentile
 * path) and the weekly price envelope.
 */
import { DAYS_PER_YEAR } from './calibration'

export interface EnvelopePoint {
  day: number
  /** p50. */
  median: number
  p05: number
  p95: number
  p10: number
  p90: number
  p20: number
  p80: number
  p35: number
  p65: number
}

/**
 * Type-7 quantile (linear interpolation, idx = q * (n - 1)) on a SORTED
 * array; the default convention of R and NumPy.
 */
export function quantileSorted(sorted: Float64Array, q: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  if (n === 1) return sorted[0]
  const idx = q * (n - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export interface PathKpis {
  finalPrice: number
  /** (final/initial)^(1/years) - 1, fraction. */
  cagr: number
  /** Sample std of daily log-returns x sqrt(days per year), fraction. */
  annualizedVolatility: number
  /** cagr / vol, risk-free 0; 0 when vol is 0. */
  sharpe: number
  /** min((p - cummax) / cummax), <= 0, fraction. */
  maxDrawdown: number
  maxPrice: number
  meanPrice: number
  medianPrice: number
  minPrice: number
  /** % of steps with a strict price increase, 0-100. */
  pctTimeIncreasing: number
  /** % of days (initial day included) spent below the initial price, 0-100. */
  pctTimeBelowInitial: number
}

export function computePathKpis(
  path: Float64Array,
  initialPriceUsd: number,
  horizonYears: number,
): PathKpis {
  const steps = path.length
  const returns = steps - 1

  let minPrice = Infinity
  let maxPrice = -Infinity
  let sum = 0
  let cummax = -Infinity
  let maxDrawdown = 0
  let increasing = 0
  let belowInitial = 0
  let logSum = 0
  let logSumSq = 0

  for (let t = 0; t < steps; t++) {
    const price = path[t]
    if (price < minPrice) minPrice = price
    if (price > maxPrice) maxPrice = price
    sum += price
    if (price > cummax) cummax = price
    const drawdown = (price - cummax) / cummax
    if (drawdown < maxDrawdown) maxDrawdown = drawdown
    if (price < initialPriceUsd) belowInitial++
    if (t > 0) {
      const prev = path[t - 1]
      if (price > prev) increasing++
      const logReturn = Math.log(price / prev)
      logSum += logReturn
      logSumSq += logReturn * logReturn
    }
  }

  const finalPrice = path[steps - 1]
  const cagr =
    horizonYears > 0
      ? Math.pow(finalPrice / initialPriceUsd, 1 / horizonYears) - 1
      : 0

  let annualizedVolatility = 0
  if (returns > 1) {
    const meanLog = logSum / returns
    const variance = Math.max(
      0,
      (logSumSq - returns * meanLog * meanLog) / (returns - 1),
    )
    annualizedVolatility = Math.sqrt(variance) * Math.sqrt(DAYS_PER_YEAR)
  }
  const sharpe = annualizedVolatility > 0 ? cagr / annualizedVolatility : 0

  const sorted = path.slice().sort()
  const medianPrice = quantileSorted(sorted, 0.5)

  return {
    finalPrice,
    cagr,
    annualizedVolatility,
    sharpe,
    maxDrawdown,
    maxPrice,
    meanPrice: sum / steps,
    medianPrice,
    minPrice,
    pctTimeIncreasing: returns > 0 ? (increasing / returns) * 100 : 0,
    pctTimeBelowInitial: (belowInitial / steps) * 100,
  }
}

export interface KpiAggregate {
  mean: number
  p20: number
  p50: number
  p80: number
}

export interface SimulationKpis {
  finalPrice: KpiAggregate
  cagr: KpiAggregate
  annualizedVolatility: KpiAggregate
  sharpe: KpiAggregate
  maxDrawdown: KpiAggregate
  maxPrice: KpiAggregate
  meanPrice: KpiAggregate
  medianPrice: KpiAggregate
  minPrice: KpiAggregate
  pctTimeIncreasing: KpiAggregate
  pctTimeBelowInitial: KpiAggregate
}

const KPI_KEYS = [
  'finalPrice',
  'cagr',
  'annualizedVolatility',
  'sharpe',
  'maxDrawdown',
  'maxPrice',
  'meanPrice',
  'medianPrice',
  'minPrice',
  'pctTimeIncreasing',
  'pctTimeBelowInitial',
] as const satisfies ReadonlyArray<keyof PathKpis>

/** Percentiles PER METRIC across the per-path KPIs. */
export function aggregateKpis(perPath: PathKpis[]): SimulationKpis {
  const result = {} as Record<keyof PathKpis, KpiAggregate>
  const values = new Float64Array(perPath.length)
  for (const key of KPI_KEYS) {
    let sum = 0
    for (let p = 0; p < perPath.length; p++) {
      values[p] = perPath[p][key]
      sum += values[p]
    }
    const sorted = values.slice().sort()
    result[key] = {
      mean: perPath.length > 0 ? sum / perPath.length : 0,
      p20: quantileSorted(sorted, 0.2),
      p50: quantileSorted(sorted, 0.5),
      p80: quantileSorted(sorted, 0.8),
    }
  }
  return result
}

/**
 * Cross-path quantile envelope at sampled days 0, everyDays, 2 x everyDays,
 * ..., plus the final day. Sampling before taking quantiles is numerically
 * identical to quantiling every day and then sampling, at a fraction of the
 * cost. `paths` is row-major nPaths x steps.
 */
export function buildEnvelope(
  paths: Float64Array,
  nPaths: number,
  steps: number,
  everyDays = 7,
): EnvelopePoint[] {
  const days: number[] = []
  for (let day = 0; day < steps; day += everyDays) {
    days.push(day)
  }
  if (days[days.length - 1] !== steps - 1) {
    days.push(steps - 1)
  }

  const column = new Float64Array(nPaths)
  return days.map((day) => {
    for (let p = 0; p < nPaths; p++) {
      column[p] = paths[p * steps + day]
    }
    const sorted = column.slice().sort()
    return {
      day,
      median: quantileSorted(sorted, 0.5),
      p05: quantileSorted(sorted, 0.05),
      p95: quantileSorted(sorted, 0.95),
      p10: quantileSorted(sorted, 0.1),
      p90: quantileSorted(sorted, 0.9),
      p20: quantileSorted(sorted, 0.2),
      p80: quantileSorted(sorted, 0.8),
      p35: quantileSorted(sorted, 0.35),
      p65: quantileSorted(sorted, 0.65),
    }
  })
}
