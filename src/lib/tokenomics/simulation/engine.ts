/**
 * The Monte-Carlo engine: daily GBM price paths whose drift and volatility
 * are the sum of the precomputed base models plus the path-dependent unlock
 * impact models, then envelope and KPI post-processing.
 *
 * Reproducibility contract: (seed, scenario, ENGINE_VERSION) fully
 * determines the result. Injecting a z matrix bypasses the RNG for
 * deterministic tests and external parity runs.
 */
import { normalizeCategory } from '../schemas'
import type { SupplyProjection } from '../projections'
import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  DEFAULT_N_PATHS,
  DT,
  ENGINE_VERSION,
  MAX_N_PATHS,
  MIN_N_PATHS,
  SQRT_DT,
  SimulationInputError,
  type CrisisType,
  type MacroCondition,
} from './calibration'
import {
  buildBaseDriftVol,
  normalizeMacroWindows,
  type BaseDriftVol,
  type CrisisEventInput,
  type MacroWindowInput,
} from './models'
import {
  buildReleaseSchedule,
  type DepthEventInput,
  type ReleaseEvent,
} from './releases'
import {
  aggregateKpis,
  buildEnvelope,
  computePathKpis,
  type EnvelopePoint,
  type SimulationKpis,
} from './kpis'
import { createRng, type Rng } from './rng'

export interface SimulationScenario {
  seed: number
  /** Default 1000, clamped to [100, 2000]; ignored when z is injected. */
  nPaths?: number
  initialPriceUsd: number
  marketDepthUsd: number | null
  category: string
  /** Same conventions as computeSellPressure. */
  pctSoldByType: Record<string, number>
  pctSoldEmission: number
  /** Must tile the horizon from month 0; the tail regime is extended. */
  macroWindows: MacroWindowInput[]
  crises: CrisisEventInput[]
  /** Dated market-depth changes; absent or empty keeps the baseline. */
  liquidityEvents?: DepthEventInput[]
  horizonMonths: number
}

export interface SimulationOptions {
  /**
   * Test/parity hook: injected STANDARD normals N(0,1), one row per path,
   * each of length steps - 1. Bypasses the RNG; the engine applies sqrt(dt).
   * The row count defines nPaths, unclamped (single hand-computed paths).
   */
  z?: Float64Array[]
}

export interface SimulationMeta {
  seed: number
  nPaths: number
  steps: number
  engineVersion: string
  durationMs: number
}

export interface SimulationResult {
  envelope: EnvelopePoint[]
  kpis: SimulationKpis
  meta: SimulationMeta
}

export interface SimulatePathsArgs {
  initialPriceUsd: number
  base: BaseDriftVol
  /** Active (non-inert) events only, sorted by day. */
  releases: ReleaseEvent[]
  nPaths: number
  steps: number
  z?: Float64Array[]
  /** Required when z is absent. */
  rng?: Rng
}

/**
 * Simulate the price paths into a row-major nPaths x steps matrix (path p
 * is the subarray [p x steps, (p+1) x steps)).
 *
 * Time convention (mirrors the engine's reference semantics): step t
 * computes price[t] from price[t-1] with models evaluated at day t; an
 * unlock activates at the first evaluation day >= its release day, using
 * the path's previous price as the activation price.
 */
export function simulatePaths(args: SimulatePathsArgs): Float64Array {
  const { initialPriceUsd, base, releases, nPaths, steps, z, rng } = args
  if (!z && !rng) {
    throw new SimulationInputError('simulatePaths needs a z matrix or an rng')
  }

  const out = new Float64Array(nPaths * steps)
  const releaseCount = releases.length

  // Structure-of-arrays view of the releases: no property lookups in the
  // hot loop, and the only per-path state is the activation price.
  const day = new Float64Array(releaseCount)
  const fastEndDay = new Float64Array(releaseCount)
  const slowStartDay = new Float64Array(releaseCount)
  const slowEndDay = new Float64Array(releaseCount)
  const fastMuPerUsd = new Float64Array(releaseCount)
  const slowMuPerUsd = new Float64Array(releaseCount)
  const fastDecay = new Float64Array(releaseCount)
  const slowDecay = new Float64Array(releaseCount)
  for (let j = 0; j < releaseCount; j++) {
    const release = releases[j]
    day[j] = release.day
    fastEndDay[j] = release.fastEndDay
    slowStartDay[j] = release.slowStartDay
    slowEndDay[j] = release.slowEndDay
    fastMuPerUsd[j] = release.fastMuPerUsd
    slowMuPerUsd[j] = release.slowMuPerUsd
    fastDecay[j] = release.fastDecay
    slowDecay[j] = release.slowDecay
  }
  const activation = new Float64Array(releaseCount)

  const baseMu = base.mu
  const baseSigma = base.sigma

  for (let p = 0; p < nPaths; p++) {
    const offset = p * steps
    out[offset] = initialPriceUsd
    const zRow = z ? z[p] : null
    let next = 0 // first release not yet activated on this path
    let lo = 0 // first release possibly still alive

    for (let t = 1; t < steps; t++) {
      const price = out[offset + t - 1]

      while (next < releaseCount && day[next] <= t) {
        activation[next] = price
        next++
      }

      let mu = baseMu[t]
      const sigma = baseSigma[t]
      for (let j = lo; j < next; j++) {
        if (t >= slowEndDay[j]) {
          if (j === lo) lo++
          continue
        }
        // Two-piece profile: the fast phase stops hard at fastEndDay, the
        // slow phase runs on its own clock from slowStartDay.
        if (t < fastEndDay[j]) {
          const tau = (t - day[j]) / DAYS_PER_YEAR
          mu += activation[j] * fastMuPerUsd[j] * Math.exp(-fastDecay[j] * tau)
        }
        if (t >= slowStartDay[j]) {
          const tau = (t - slowStartDay[j]) / DAYS_PER_YEAR
          mu += activation[j] * slowMuPerUsd[j] * Math.exp(-slowDecay[j] * tau)
        }
      }

      const n = zRow ? zRow[t - 1] : (rng as Rng).nextNormal()
      out[offset + t] =
        price * Math.exp((mu - 0.5 * sigma * sigma) * DT + sigma * SQRT_DT * n)
    }
  }

  return out
}

export function runSimulation(
  supply: SupplyProjection,
  scenario: SimulationScenario,
  options?: SimulationOptions,
): SimulationResult {
  const startedAt = performance.now()

  if (
    !Number.isFinite(scenario.initialPriceUsd) ||
    scenario.initialPriceUsd <= 0
  ) {
    throw new SimulationInputError('initialPriceUsd must be a positive number')
  }
  const category = normalizeCategory(scenario.category)
  if (!category) {
    throw new SimulationInputError(`Unknown category "${scenario.category}"`)
  }

  const horizonMonths = Math.max(1, Math.floor(scenario.horizonMonths))
  const horizonDays = horizonMonths * DAYS_PER_MONTH
  const steps = horizonDays + 1

  const windows = normalizeMacroWindows(scenario.macroWindows, horizonDays)
  const base = buildBaseDriftVol({
    horizonDays,
    category,
    windows,
    crises: scenario.crises,
  })
  const releases = buildReleaseSchedule({
    supply,
    pctSoldByType: scenario.pctSoldByType,
    pctSoldEmission: scenario.pctSoldEmission,
    marketDepthUsd: scenario.marketDepthUsd,
    liquidityEvents: scenario.liquidityEvents,
    horizonDays,
    windows,
  }).filter((release) => !release.inert)

  let nPaths: number
  let rng: Rng | undefined
  if (options?.z) {
    if (options.z.length === 0) {
      throw new SimulationInputError('Injected z matrix has no rows')
    }
    for (const row of options.z) {
      if (row.length !== steps - 1) {
        throw new SimulationInputError(
          `Injected z rows must have ${steps - 1} entries, got ${row.length}`,
        )
      }
    }
    nPaths = options.z.length
  } else {
    nPaths = Math.min(
      MAX_N_PATHS,
      Math.max(MIN_N_PATHS, Math.floor(scenario.nPaths ?? DEFAULT_N_PATHS)),
    )
    rng = createRng(scenario.seed)
  }

  const paths = simulatePaths({
    initialPriceUsd: scenario.initialPriceUsd,
    base,
    releases,
    nPaths,
    steps,
    z: options?.z,
    rng,
  })

  const horizonYears = horizonDays / DAYS_PER_YEAR
  const perPath: ReturnType<typeof computePathKpis>[] = []
  for (let p = 0; p < nPaths; p++) {
    perPath.push(
      computePathKpis(
        paths.subarray(p * steps, (p + 1) * steps),
        scenario.initialPriceUsd,
        horizonYears,
      ),
    )
  }

  return {
    envelope: buildEnvelope(paths, nPaths, steps),
    kpis: aggregateKpis(perPath),
    meta: {
      seed: scenario.seed,
      nPaths,
      steps,
      engineVersion: ENGINE_VERSION,
      durationMs: Math.round(performance.now() - startedAt),
    },
  }
}

export type { MacroCondition, CrisisType }
