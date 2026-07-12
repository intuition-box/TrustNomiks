/**
 * Calibration constants for the Monte-Carlo stress-test engine: time grid,
 * market-regime and crisis drift/volatility tables per token category, and
 * the unlock price-impact profile. All values are engine constants; any
 * change here is a behavioral change and must bump ENGINE_VERSION.
 */
import type { CategoryType } from '../schemas'

export const ENGINE_VERSION = '1'

/** Calendar year used to annualize daily steps. */
export const DAYS_PER_YEAR = 365.2525
/** Time step: one day, in years. */
export const DT = 1 / DAYS_PER_YEAR
export const SQRT_DT = Math.sqrt(DT)
/** Scenario time grid: one scenario month is 30 simulated days. */
export const DAYS_PER_MONTH = 30
/** Month length used for slow-sell durations (5 x 30.5d bull, 3 x 30.5d bear). */
export const SLOW_SELL_MONTH_DAYS = 30.5

/** Structural market optimism applied to every path (annualized drift). */
export const CONSTANT_BIAS_MU = 0.3

export type MacroCondition = 'bull' | 'bear'
export type CrisisType = 'covid' | 'ftx' | 'terra'

/** Annualized drift and volatility contributed by a model at a given day. */
export interface DriftVol {
  mu: number
  sigma: number
}

/** Market-regime drift/vol per token category, annualized. */
export const MACRO_CALIBRATION: Record<
  MacroCondition,
  Record<CategoryType, DriftVol>
> = {
  bull: {
    'two-sided-market': { mu: 0.4645, sigma: 1.0044 },
    infrastructure: { mu: 1.1603, sigma: 0.898 },
    'open-digital-economy': { mu: 0.6239, sigma: 0.9022 },
    financial: { mu: 1.2621, sigma: 1.004 },
    payment: { mu: 0.7257, sigma: 0.9539 },
  },
  bear: {
    'two-sided-market': { mu: -1.447, sigma: 1.1602 },
    infrastructure: { mu: -1.2261, sigma: 1.0771 },
    'open-digital-economy': { mu: -0.7776, sigma: 1.2527 },
    financial: { mu: -1.1351, sigma: 0.9836 },
    payment: { mu: -1.3078, sigma: 1.122 },
  },
}

export interface CrisisCalibration {
  /** Acute phase length in days; drives the exponential decay rate. */
  durationDays: number
  /** Base drift/vol per category, before the shock multiplier. */
  base: Record<CategoryType, DriftVol>
}

/**
 * Historical crisis replays. Effective mu0/sigma0 are base x
 * CRISIS_EXP_MULT and decay by exp(-decay * years) with decay =
 * CRISIS_EXP_MULT * 365 / durationDays (~90% decayed by the end of the
 * crisis window).
 */
export const CRISIS_CALIBRATION: Record<CrisisType, CrisisCalibration> = {
  covid: {
    durationDays: 7,
    base: {
      payment: { mu: -23.57, sigma: 2.87 },
      'two-sided-market': { mu: -23.22, sigma: 3.59 },
      'open-digital-economy': { mu: -23.13, sigma: 4.32 },
      infrastructure: { mu: -23.85, sigma: 3.63 },
      financial: { mu: -20.88, sigma: 4.4 },
    },
  },
  ftx: {
    durationDays: 10,
    base: {
      payment: { mu: -4.03, sigma: 2.1 },
      'two-sided-market': { mu: -10.54, sigma: 2.04 },
      'open-digital-economy': { mu: -9.44, sigma: 2.03 },
      infrastructure: { mu: -9.82, sigma: 1.86 },
      financial: { mu: -6.62, sigma: 1.68 },
    },
  },
  terra: {
    durationDays: 11,
    base: {
      payment: { mu: -12.87, sigma: 2.27 },
      'two-sided-market': { mu: -12.62, sigma: 2.68 },
      'open-digital-economy': { mu: -10.95, sigma: 2.58 },
      infrastructure: { mu: -11.76, sigma: 1.94 },
      financial: { mu: -8.9, sigma: 1.96 },
    },
  },
}

export const CRISIS_EXP_MULT = 2.3
/** The crisis decay rate uses a flat 365-day year by definition. */
export const CRISIS_DECAY_DAYS_PER_YEAR = 365

/** Selling one full 2%-depth of the market moves the price ~2%. */
export const IMPACT_DEPTH_COEFF = 0.02
/** Length of the rapid sell-off phase after an unlock. */
export const FAST_SELL_DAYS = 15

/** Sell-off profile per market regime at the unlock date. */
export const UNLOCK_SELL_PROFILE: Record<
  MacroCondition,
  { slowMonths: number; ratioFast: number }
> = {
  bull: { slowMonths: 5, ratioFast: 0.88 },
  bear: { slowMonths: 3, ratioFast: 0.43 },
}

/** The slow phase is sized so ~99% of its pressure fits inside it. */
export const UNLOCK_SLOW_CUTOFF = 0.01
/** Supply dilutions below 1% of the prior circulating have no impact. */
export const DILUTION_INERTIA_THRESHOLD = 0.01
/** Once 70% of the eventual supply circulates, new unlocks have no impact. */
export const VESTED_INERTIA_THRESHOLD = 0.7

export const DEFAULT_N_PATHS = 1000
export const MIN_N_PATHS = 100
export const MAX_N_PATHS = 2000

/** Invalid scenario/config input (caller error, not an engine bug). */
export class SimulationInputError extends Error {}
