/**
 * Unlock release schedule: turns the deterministic supply projection into
 * dated sell tranches with precomputed price-impact parameters. The impact
 * target is linear in the path's activation price, so everything except
 * that one scalar is computed here, once, outside the hot loop.
 */
import type { SupplyProjection } from '../projections'
import { DEFAULT_SELL_PRESSURE_PCT } from '../projections'
import type { SegmentType } from '../schemas'
import {
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  DILUTION_INERTIA_THRESHOLD,
  FAST_SELL_DAYS,
  IMPACT_DEPTH_COEFF,
  SLOW_SELL_MONTH_DAYS,
  UNLOCK_SELL_PROFILE,
  UNLOCK_SLOW_CUTOFF,
  VESTED_INERTIA_THRESHOLD,
  type MacroCondition,
} from './calibration'
import { macroConditionAtDay, type NormalizedMacroWindow } from './models'

export interface ReleaseScheduleArgs {
  supply: SupplyProjection
  /** Same conventions as computeSellPressure (clamp 0-100, DEFAULT fallback). */
  pctSoldByType: Record<string, number>
  pctSoldEmission: number
  /** null / <= 0 / non-finite disables every impact model (all inert). */
  marketDepthUsd: number | null
  horizonDays: number
  windows: NormalizedMacroWindow[]
}

/** One 15-day sell tranche with its impact model precomputed. */
export interface ReleaseEvent {
  /** Activation day D (30m or 30m + 15). */
  day: number
  /** Tokens sold by this tranche (half of the month's sold delta). */
  tokensSold: number
  /** Market regime at day D; fixes the fast/slow sell profile. */
  condition: MacroCondition
  /** true: no impact (inertia thresholds or missing depth); engine skips it. */
  inert: boolean
  /** fastMu = fastMuPerUsd x the path's activation price; 0 when inert. */
  fastMuPerUsd: number
  /** = fastMuPerUsd x (1 - ratioFast). */
  slowMuPerUsd: number
  /** Fast phase decay, per year. */
  fastDecay: number
  /** Slow phase decay, per year. */
  slowDecay: number
  /** Exclusive expiry day: day + slow phase length (<1% residual). */
  endDay: number
}

const clampPct = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

/**
 * Impact drift of one tranche at a given day for a given activation price.
 * Exported for tests; the engine loop inlines this formula.
 */
export function unlockImpactMuAtDay(
  event: ReleaseEvent,
  activationPriceUsd: number,
  day: number,
): number {
  if (day < event.day || day >= event.endDay) return 0
  const tau = (day - event.day) / DAYS_PER_YEAR
  return (
    activationPriceUsd *
    (event.fastMuPerUsd * Math.exp(-event.fastDecay * tau) +
      event.slowMuPerUsd * Math.exp(-event.slowDecay * tau))
  )
}

/**
 * Build the tranche schedule, sorted by day. Inert events are kept (they
 * document why a month has no impact); the engine filters them out.
 *
 * Inertia is judged per month on the total supply delta (unlocked + minted,
 * a supply fact independent of the share sold): a dilution below 1% of the
 * prior circulating supply, or a post-release circulating supply at 70%+ of
 * the eventual supply, moves no price. The eventual supply includes minted
 * emission (max of maxSupply and the projection's final circulating), so
 * inflationary designs are not spuriously inert.
 */
export function buildReleaseSchedule(
  args: ReleaseScheduleArgs,
): ReleaseEvent[] {
  const {
    supply,
    pctSoldByType,
    pctSoldEmission,
    marketDepthUsd,
    horizonDays,
    windows,
  } = args

  const hasDepth =
    marketDepthUsd !== null &&
    Number.isFinite(marketDepthUsd) &&
    marketDepthUsd > 0

  const pctForType = (segmentType: string): number =>
    clampPct(
      pctSoldByType[segmentType] ??
        DEFAULT_SELL_PRESSURE_PCT[segmentType as SegmentType] ??
        0,
    )
  const pctEmission = clampPct(pctSoldEmission)

  const fullyVested = Math.max(supply.maxSupply, supply.finalCirculating)
  const fastYears = FAST_SELL_DAYS / DAYS_PER_YEAR

  const events: ReleaseEvent[] = []
  for (const point of supply.points) {
    const month = point.month
    const firstDay = month * DAYS_PER_MONTH
    if (firstDay > horizonDays) break

    let tokensSoldMonth = 0
    for (const [segmentType, delta] of Object.entries(
      point.unlockedDeltaByType,
    )) {
      tokensSoldMonth += delta * (pctForType(segmentType) / 100)
    }
    tokensSoldMonth += point.mintedDelta * (pctEmission / 100)
    if (tokensSoldMonth <= 0) continue

    const preSupply = month > 0 ? supply.points[month - 1].circulating : 0
    const postSupply = point.circulating
    const supplyDelta = postSupply - preSupply
    const inert =
      !hasDepth ||
      (preSupply > 0 && supplyDelta / preSupply < DILUTION_INERTIA_THRESHOLD) ||
      (fullyVested > 0 && postSupply >= VESTED_INERTIA_THRESHOLD * fullyVested)

    for (const day of [firstDay, firstDay + FAST_SELL_DAYS]) {
      if (day > horizonDays) continue
      const tokensSold = tokensSoldMonth / 2
      const condition = macroConditionAtDay(windows, day)

      if (inert) {
        events.push({
          day,
          tokensSold,
          condition,
          inert: true,
          fastMuPerUsd: 0,
          slowMuPerUsd: 0,
          fastDecay: 0,
          slowDecay: 0,
          endDay: day,
        })
        continue
      }

      const { slowMonths, ratioFast } = UNLOCK_SELL_PROFILE[condition]
      const slowYears = (slowMonths * SLOW_SELL_MONTH_DAYS) / DAYS_PER_YEAR
      const fastDecay = -Math.log(1 - ratioFast) / fastYears
      const slowDecay = -Math.log(UNLOCK_SLOW_CUTOFF) / slowYears
      const targetPerUsd =
        (-IMPACT_DEPTH_COEFF * tokensSold) / (marketDepthUsd as number)
      const fastMuPerUsd =
        (fastDecay * slowDecay * targetPerUsd) /
        (fastDecay * (1 - ratioFast) + slowDecay * ratioFast)

      events.push({
        day,
        tokensSold,
        condition,
        inert: false,
        fastMuPerUsd,
        slowMuPerUsd: fastMuPerUsd * (1 - ratioFast),
        fastDecay,
        slowDecay,
        endDay: day + Math.ceil(slowYears * DAYS_PER_YEAR),
      })
    }
  }

  return events
}
