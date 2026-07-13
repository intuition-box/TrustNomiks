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
  SimulationInputError,
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
  /**
   * Baseline 2% depth from day 0. null / <= 0 / non-finite means no depth:
   * impact is disabled until a liquidity event supplies one (if any).
   */
  marketDepthUsd: number | null
  /**
   * Dated depth changes (step function over the baseline): the depth at a
   * tranche day is the latest event at or before it. Optional; empty or
   * absent leaves the schedule bit-identical to the constant-depth build.
   */
  liquidityEvents?: DepthEventInput[]
  horizonDays: number
  windows: NormalizedMacroWindow[]
}

export interface DepthEventInput {
  /** Scenario month; the new depth takes effect at day month x 30. */
  month: number
  /** New 2% market depth from that day on; <= 0 models a market gone dry. */
  depthUsd: number
}

/**
 * Sort and validate liquidity events into engine days. Config bugs throw
 * (same philosophy as normalizeMacroWindows): months must be distinct
 * non-negative integers and depths finite. A depth <= 0 is VALID input;
 * it disables the impact models from that day on.
 */
export function normalizeDepthEvents(
  events: DepthEventInput[] | undefined,
): Array<{ day: number; depthUsd: number }> {
  if (!events || events.length === 0) return []
  const sorted = [...events].sort((a, b) => a.month - b.month)
  const normalized: Array<{ day: number; depthUsd: number }> = []
  let prevMonth = -1
  for (const event of sorted) {
    if (!Number.isInteger(event.month) || event.month < 0) {
      throw new SimulationInputError(
        `Liquidity event month ${event.month} must be a non-negative integer`,
      )
    }
    if (event.month === prevMonth) {
      throw new SimulationInputError(
        `Duplicate liquidity event at month ${event.month}`,
      )
    }
    if (!Number.isFinite(event.depthUsd)) {
      throw new SimulationInputError(
        `Liquidity event at month ${event.month} has a non-finite depth`,
      )
    }
    normalized.push({
      day: event.month * DAYS_PER_MONTH,
      depthUsd: event.depthUsd,
    })
    prevMonth = event.month
  }
  return normalized
}

/**
 * One 15-day sell tranche with its two-piece impact model precomputed.
 * The profile is piecewise: the fast phase runs on [day, fastEndDay) and
 * stops hard; the slow phase starts at fastEndDay with its own clock and
 * expires at slowEndDay (its exponential is fully decayed there). The
 * target calibration assumes exactly this structure.
 */
export interface ReleaseEvent {
  /** Activation day D (30m or 30m + 15): the path price is captured here. */
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
  /** Exclusive end of the fast phase: day + FAST_SELL_DAYS. */
  fastEndDay: number
  /** The slow phase clock starts here (= fastEndDay). */
  slowStartDay: number
  /** Exclusive expiry: slowStartDay + its full decay length. */
  slowEndDay: number
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
  let mu = 0
  if (day >= event.day && day < event.fastEndDay) {
    const tau = (day - event.day) / DAYS_PER_YEAR
    mu += event.fastMuPerUsd * Math.exp(-event.fastDecay * tau)
  }
  if (day >= event.slowStartDay && day < event.slowEndDay) {
    const tau = (day - event.slowStartDay) / DAYS_PER_YEAR
    mu += event.slowMuPerUsd * Math.exp(-event.slowDecay * tau)
  }
  return activationPriceUsd * mu
}

/**
 * Build the tranche schedule, sorted by day. Inert events are kept (they
 * document why a month has no impact); the engine filters them out.
 *
 * Depth is resolved per tranche (baseline stepped by liquidity events); a
 * tranche whose day has no positive depth is inert, so a market that dries
 * up mid-horizon stops moving prices and one that lists later starts to.
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
    liquidityEvents,
    horizonDays,
    windows,
  } = args

  const depthEvents = normalizeDepthEvents(liquidityEvents)
  // Step function over the baseline; with no events this returns the very
  // same marketDepthUsd number, keeping the schedule bit-identical.
  const depthAtDay = (day: number): number | null => {
    let depth = marketDepthUsd
    for (const event of depthEvents) {
      if (event.day <= day) depth = event.depthUsd
      else break
    }
    return depth
  }

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
    // Supply-fact inertia, judged per month; depth availability is judged
    // per tranche below (liquidity events can change it mid-horizon).
    const inertiaBase =
      (preSupply > 0 && supplyDelta / preSupply < DILUTION_INERTIA_THRESHOLD) ||
      (fullyVested > 0 && postSupply >= VESTED_INERTIA_THRESHOLD * fullyVested)

    for (const day of [firstDay, firstDay + FAST_SELL_DAYS]) {
      if (day > horizonDays) continue
      const tokensSold = tokensSoldMonth / 2
      const condition = macroConditionAtDay(windows, day)

      const depth = depthAtDay(day)
      const hasDepth = depth !== null && Number.isFinite(depth) && depth > 0
      const inert = !hasDepth || inertiaBase

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
          fastEndDay: day,
          slowStartDay: day,
          slowEndDay: day,
        })
        continue
      }

      const { slowMonths, ratioFast } = UNLOCK_SELL_PROFILE[condition]
      const slowYears = (slowMonths * SLOW_SELL_MONTH_DAYS) / DAYS_PER_YEAR
      const fastDecay = -Math.log(1 - ratioFast) / fastYears
      const slowDecay = -Math.log(UNLOCK_SLOW_CUTOFF) / slowYears
      const targetPerUsd =
        (-IMPACT_DEPTH_COEFF * tokensSold) / (depth as number)
      const fastMuPerUsd =
        (fastDecay * slowDecay * targetPerUsd) /
        (fastDecay * (1 - ratioFast) + slowDecay * ratioFast)

      const slowStartDay = day + FAST_SELL_DAYS
      events.push({
        day,
        tokensSold,
        condition,
        inert: false,
        fastMuPerUsd,
        slowMuPerUsd: fastMuPerUsd * (1 - ratioFast),
        fastDecay,
        slowDecay,
        fastEndDay: slowStartDay,
        // The slow exponential's own full decay length: 5 / decay years
        // (residual < 1%); kept fractional so the cutoff lands exactly.
        slowStartDay,
        slowEndDay: slowStartDay + (5 / slowDecay) * DAYS_PER_YEAR,
      })
    }
  }

  return events
}
