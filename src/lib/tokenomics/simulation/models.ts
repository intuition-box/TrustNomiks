/**
 * Path-independent model layer: macro-regime windows, crisis replays and
 * the constant bias, precomputed once per simulation into per-day drift and
 * volatility arrays. The only path-dependent model (unlock price impact)
 * lives in releases.ts and is applied inside the engine loop.
 */
import type { CategoryType } from '../schemas'
import {
  CONSTANT_BIAS_MU,
  CRISIS_CALIBRATION,
  CRISIS_DECAY_DAYS_PER_YEAR,
  CRISIS_EXP_MULT,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  MACRO_CALIBRATION,
  SimulationInputError,
  type CrisisType,
  type DriftVol,
  type MacroCondition,
} from './calibration'

export interface MacroWindowInput {
  fromMonth: number
  toMonth: number
  condition: MacroCondition
}

/** Window in engine days, half-open [fromDay, toDay). */
export interface NormalizedMacroWindow {
  fromDay: number
  toDay: number
  condition: MacroCondition
}

/**
 * Sort, convert months to days and validate: the first window must start at
 * month 0 and windows must tile without gaps or overlaps (a hole is a config
 * bug worth surfacing, not padding over). A horizon extending past the last
 * window keeps its condition, so lengthening the horizon never invalidates
 * a saved scenario.
 */
export function normalizeMacroWindows(
  windows: MacroWindowInput[],
  horizonDays: number,
): NormalizedMacroWindow[] {
  if (windows.length === 0) {
    throw new SimulationInputError('At least one macro window is required')
  }
  const sorted = [...windows].sort((a, b) => a.fromMonth - b.fromMonth)
  const normalized: NormalizedMacroWindow[] = []
  let cursor = 0
  for (const window of sorted) {
    if (window.toMonth <= window.fromMonth) {
      throw new SimulationInputError(
        `Macro window ${window.fromMonth}-${window.toMonth} is empty or inverted`,
      )
    }
    if (window.fromMonth !== cursor) {
      throw new SimulationInputError(
        `Macro windows must tile the horizon: expected a window starting at month ${cursor}, got ${window.fromMonth}`,
      )
    }
    normalized.push({
      fromDay: window.fromMonth * DAYS_PER_MONTH,
      toDay: window.toMonth * DAYS_PER_MONTH,
      condition: window.condition,
    })
    cursor = window.toMonth
  }
  const last = normalized[normalized.length - 1]
  if (last.toDay < horizonDays) {
    last.toDay = horizonDays
  }
  return normalized
}

/** Regime at a given day; windows must be normalized (tiling, sorted). */
export function macroConditionAtDay(
  windows: NormalizedMacroWindow[],
  day: number,
): MacroCondition {
  for (const window of windows) {
    if (day >= window.fromDay && day < window.toDay) return window.condition
  }
  // Only reachable past the last window on an unextended list; carry the
  // final regime rather than failing an out-of-range lookup.
  return windows[windows.length - 1].condition
}

export interface CrisisEventInput {
  month: number
  type: CrisisType
}

/**
 * Crisis contribution at a given day: zero before startDay, then the base
 * table times the shock multiplier, decaying exponentially with
 * decay = CRISIS_EXP_MULT x 365 / durationDays per (flat) year. The shock
 * expires after its full decay length (5 / decay years, <1% residual);
 * past that the contribution is exactly zero, not a lingering tail.
 */
export function crisisDriftVolAtDay(
  type: CrisisType,
  category: CategoryType,
  startDay: number,
  day: number,
): DriftVol {
  if (day < startDay) return { mu: 0, sigma: 0 }
  const { durationDays, base } = CRISIS_CALIBRATION[type]
  const decay = (CRISIS_EXP_MULT * CRISIS_DECAY_DAYS_PER_YEAR) / durationDays
  const elapsedYears = (day - startDay) / DAYS_PER_YEAR
  if (elapsedYears >= 5 / decay) return { mu: 0, sigma: 0 }
  const factor = CRISIS_EXP_MULT * Math.exp(-decay * elapsedYears)
  const calibration = base[category]
  return { mu: calibration.mu * factor, sigma: calibration.sigma * factor }
}

/** Per-day base drift/vol, indexed by evaluation day 1..horizonDays. */
export interface BaseDriftVol {
  /** mu[d] / sigma[d] are the model sums at day d; index 0 is unused. */
  mu: Float64Array
  sigma: Float64Array
}

/**
 * Precompute the path-independent models (bias + macro + crises) for every
 * evaluation day. Crisis start days sit on the month grid (month x 30); the
 * exponential is evaluated exactly out to the horizon.
 */
export function buildBaseDriftVol(args: {
  horizonDays: number
  category: CategoryType
  windows: NormalizedMacroWindow[]
  crises: CrisisEventInput[]
}): BaseDriftVol {
  const { horizonDays, category, windows, crises } = args
  const mu = new Float64Array(horizonDays + 1)
  const sigma = new Float64Array(horizonDays + 1)
  const crisisStarts = crises.map((crisis) => ({
    type: crisis.type,
    startDay: crisis.month * DAYS_PER_MONTH,
  }))
  for (let day = 1; day <= horizonDays; day++) {
    const macro = MACRO_CALIBRATION[macroConditionAtDay(windows, day)][category]
    let dayMu = CONSTANT_BIAS_MU + macro.mu
    let daySigma = macro.sigma
    for (const crisis of crisisStarts) {
      const contribution = crisisDriftVolAtDay(
        crisis.type,
        category,
        crisis.startDay,
        day,
      )
      dayMu += contribution.mu
      daySigma += contribution.sigma
    }
    mu[day] = dayMu
    sigma[day] = Math.max(daySigma, 0)
  }
  return { mu, sigma }
}
