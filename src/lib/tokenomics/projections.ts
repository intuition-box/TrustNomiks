/**
 * Deterministic tokenomics projections: circulating-supply curve (vesting
 * unlocks + inflationary emission) and nominal monthly sell pressure vs. a
 * 2% market depth. Pure and server-safe.
 *
 * Layering mirrors the rest of the domain library: `buildProjectionInputs`
 * is form-space (strings, parsed via parseDecimal) like funding.ts, the
 * compute functions are number-space like vesting.ts. The boundary is also
 * the UI memoization boundary: scenario knobs only affect
 * computeSellPressure / summarizeProjection, never the supply projection.
 *
 * Burn and buyback are descriptive-only in the emission schema (no numeric
 * fields) and are not modeled here.
 */
import { addMonths, format } from 'date-fns'

import { parseDecimal } from './math'
import type { AllocationWithId } from './math'
import { normalizeVestingFrequency } from './schemas'
import type {
  EmissionModelFormData,
  SegmentType,
  VestingSchedule,
} from './schemas'
import { computeVestingTimeline } from './vesting'
import type {
  AllocationWithVesting,
  VestingTimelinePoint,
  VestingTimelineResult,
} from './vesting'

/**
 * Default "share of new tokens sold at unlock" per segment type. These are
 * UI starting assumptions for the scenario sliders, not market data: holders
 * of investor/airdrop tranches typically sell most of an unlock, treasuries
 * and liquidity provisions typically do not.
 */
export const DEFAULT_SELL_PRESSURE_PCT: Record<SegmentType, number> = {
  'funding-private': 80,
  'funding-public': 90,
  'team-founders': 60,
  treasury: 20,
  marketing: 70,
  airdrop: 90,
  rewards: 40,
  liquidity: 0,
}

/** Default share of newly emitted (minted) tokens assumed sold. */
export const DEFAULT_EMISSION_SELL_PCT = 40

/** Scenario knobs owned by the panel (ephemeral slider state, numbers). */
export interface ProjectionScenario {
  /**
   * Share of each month's newly unlocked tokens assumed sold, 0-100, keyed
   * by segment_type. Missing types fall back to DEFAULT_SELL_PRESSURE_PCT,
   * then 0. Values are clamped; NaN counts as 0.
   */
  pctSoldByType: Record<string, number>
  /** Share of newly minted tokens assumed sold, 0-100 (clamped, NaN → 0). */
  pctSoldEmission: number
  /** Reference token price in USD; null or <= 0 → tokens-only mode. */
  refPriceUsd: number | null
  /** 2%-depth of the market in USD; null or <= 0 → no impact estimate. */
  marketDepthUsd: number | null
}

/** Raw studio state, form-space strings. */
export interface ProjectionInputsConfig {
  /** Saved allocation rows (string percentage/token_amount + DB id). */
  allocations: AllocationWithId[]
  /** Vesting form record keyed by allocation id. */
  schedules: Record<string, VestingSchedule | undefined>
  /** Formatted form string, commas tolerated, '' when unset. */
  maxSupply: string
  /** Emission form data; null before the section exists. */
  emission: EmissionModelFormData | null
  /** ISO date for month labels; null → month indices only. */
  tgeDate: string | null
}

/** Parsed emission parameters. Rates stay in percent. */
export interface EmissionParams {
  /** False when the type is missing/'fixed_cap' or no rate is positive. */
  active: boolean
  /** Flat annual inflation, %; 0 when unset, unparsable, or negative. */
  annualRatePct: number
  /**
   * Valid schedule entries sorted by year (duplicates last-wins, negative
   * rates clamped to 0). Non-empty → takes precedence over annualRatePct.
   * `year` is the relative year since TGE (1 covers months 1-12).
   */
  schedule: Array<{ year: number; ratePct: number }>
}

/** Number-space inputs; allocations feed computeVestingTimeline as-is. */
export interface ProjectionInputs {
  allocations: AllocationWithVesting[]
  /** 0 when unset or unparsable (never NaN). */
  maxSupply: number
  tgeDate: string | null
  emission: EmissionParams
}

export interface SupplyProjectionPoint {
  month: number
  /** "MMM yyyy" when a TGE date is known, else null. */
  date: string | null
  /** Cumulative tokens unlocked by vesting through this month. */
  unlocked: number
  /** Cumulative tokens minted by emission through this month. */
  minted: number
  /** unlocked + minted. */
  circulating: number
  /** Tokens newly unlocked this month (month 0 = the TGE unlock). */
  unlockedDelta: number
  /** Tokens minted this month (0 at month 0). */
  mintedDelta: number
  /** This month's unlock, split by segment_type (for per-type sell %). */
  unlockedDeltaByType: Record<string, number>
}

export interface SupplyProjection {
  /** Months 0..horizonMonths inclusive. */
  points: SupplyProjectionPoint[]
  horizonMonths: number
  /** Parsed max supply, 0 when unknown. */
  maxSupply: number
  emissionActive: boolean
  /** Cumulative per-label vesting timeline, for the unlock chart. */
  timeline: VestingTimelinePoint[]
  segmentKeys: VestingTimelineResult['segmentKeys']
  /** Segment keys excluded from the plot (frequency 'custom'). */
  customSegments: string[]
  finalCirculating: number
  /** May exceed 100 for inflationary designs; null when maxSupply is 0. */
  finalCirculatingPctOfMax: number | null
}

export interface SellPressurePoint {
  month: number
  date: string | null
  /** New tokens this month = unlockedDelta + mintedDelta. */
  newTokens: number
  unlockedDelta: number
  mintedDelta: number
  /** Tokens assumed sold this month; computed even without a price. */
  tokensSold: number
  /** tokensSold x refPriceUsd; null in tokens-only mode. */
  soldUsd: number | null
  /**
   * Estimated price impact in %, -2 x soldUsd / marketDepthUsd (selling
   * exactly the 2% depth moves the price ~2%); null without price or depth.
   */
  priceImpactPct: number | null
}

export interface SellPressureResult {
  points: SellPressurePoint[]
  /** False → tokens-only mode (refPriceUsd absent or <= 0). */
  hasPrice: boolean
  /** False → no impact estimate (marketDepthUsd absent or <= 0). */
  hasDepth: boolean
}

export interface ProjectionSummary {
  /** refPriceUsd x maxSupply, rounded to cents; null without both. */
  impliedFdvUsd: number | null
  /**
   * Month with the highest soldUsd (highest tokensSold in tokens-only
   * mode), earliest month on ties; null when no month sells anything.
   */
  worstMonth: {
    month: number
    tokensSold: number
    soldUsd: number | null
    priceImpactPct: number | null
  } | null
  /** Months where soldUsd strictly exceeds the depth; null without either. */
  monthsAboveDepth: number | null
}

/** Strip thousands separators and parse; 0 when missing or unparsable. */
const parseSupplyString = (value: string): number => {
  if (!value) return 0
  const parsed = parseFloat(String(value).replace(/,/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** parseDecimal with NaN/negative collapsed to 0. */
const parseNonNegative = (value: string | undefined): number => {
  if (!value || value.trim() === '') return 0
  const parsed = parseDecimal(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const clampPct = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

const round2 = (value: number): number => Math.round(value * 100) / 100

const toAllocationsWithVesting = (
  allocations: AllocationWithId[],
  schedules: Record<string, VestingSchedule | undefined>,
): AllocationWithVesting[] =>
  allocations.map((alloc) => {
    const schedule = schedules[alloc.id]
    return {
      label: alloc.label || alloc.segment_type || 'Allocation',
      segment_type: alloc.segment_type,
      percentage: parseNonNegative(alloc.percentage),
      token_amount: parseSupplyString(alloc.token_amount ?? ''),
      vesting: schedule
        ? {
            cliff_months: Math.floor(parseNonNegative(schedule.cliff_months)),
            duration_months: Math.floor(
              parseNonNegative(schedule.duration_months),
            ),
            frequency: normalizeVestingFrequency(schedule.frequency),
            tge_percentage: parseNonNegative(schedule.tge_percentage),
            cliff_unlock_percentage: parseNonNegative(
              schedule.cliff_unlock_percentage,
            ),
          }
        : null,
    }
  })

const parseEmission = (
  emission: EmissionModelFormData | null,
): EmissionParams => {
  const type = emission?.type ?? ''
  const typeAllowsEmission = type !== '' && type !== 'fixed_cap'

  const annualRatePct = typeAllowsEmission
    ? parseNonNegative(emission?.annual_inflation_rate)
    : 0

  const byYear = new Map<number, number>()
  if (typeAllowsEmission) {
    for (const entry of emission?.inflation_schedule ?? []) {
      const year = parseInt(entry.year, 10)
      if (!Number.isFinite(year) || year <= 0) continue
      const rate = parseDecimal(entry.rate)
      if (!Number.isFinite(rate)) continue
      byYear.set(year, Math.max(0, rate)) // last entry for a year wins
    }
  }
  const schedule = [...byYear.entries()]
    .map(([year, ratePct]) => ({ year, ratePct }))
    .sort((a, b) => a.year - b.year)

  const hasPositiveRate =
    annualRatePct > 0 || schedule.some((entry) => entry.ratePct > 0)

  return {
    active: typeAllowsEmission && hasPositiveRate,
    annualRatePct,
    schedule,
  }
}

/**
 * Annual rate for a relative year. A schedule entry's rate carries forward
 * until the next defined year (and past the last one: inflationary tokens
 * typically state a terminal "X% thereafter" rate, and dropping to 0 would
 * silently understate dilution). Years before the first entry emit nothing.
 */
const annualRatePctForYear = (
  params: EmissionParams,
  yearIndex: number,
): number => {
  if (params.schedule.length === 0) return params.annualRatePct
  let rate = 0
  for (const entry of params.schedule) {
    if (entry.year > yearIndex) break
    rate = entry.ratePct
  }
  return rate
}

const monthlyRateFromAnnualPct = (pct: number): number =>
  Math.pow(1 + pct / 100, 1 / 12) - 1

/** "MMM yyyy" label for a month offset past the vesting timeline's end. */
const formatMonthLabel = (isoDate: string, month: number): string =>
  format(addMonths(new Date(isoDate), month), 'MMM yyyy')

/**
 * Join saved allocations with their vesting schedules by allocation id and
 * parse everything to number-space. A row with no schedule keeps
 * vesting: null, which the timeline renders as 100% unlocked at month 0 —
 * consistent with the unlock chart next to the panel.
 */
export function buildProjectionInputs(
  config: ProjectionInputsConfig,
): ProjectionInputs {
  return {
    allocations: toAllocationsWithVesting(config.allocations, config.schedules),
    maxSupply: parseSupplyString(config.maxSupply),
    tgeDate: config.tgeDate,
    emission: parseEmission(config.emission),
  }
}

/**
 * Circulating-supply projection: the vesting unlock timeline plus compound
 * monthly emission. Each month mints (1 + annualRate)^(1/12) - 1 of the
 * previous month's projected circulating supply, so twelve monthly steps on
 * a constant base recompose the annual rate exactly. The default horizon is
 * the vesting timeline's own maxMonth, raised to at least 12 months when
 * emission is active (a 100%-TGE inflationary design still gets a full year
 * of emission on screen); `options.horizonMonths` overrides it, holding
 * unlocks flat past the vesting end.
 */
export function computeSupplyProjection(
  inputs: ProjectionInputs,
  options?: { horizonMonths?: number },
): SupplyProjection {
  const { allocations, maxSupply, tgeDate, emission } = inputs
  const vt = computeVestingTimeline({ allocations, maxSupply, tgeDate })

  const defaultHorizon = emission.active
    ? Math.max(vt.maxMonth, 12)
    : vt.maxMonth
  const horizonMonths = Math.max(
    1,
    Math.floor(options?.horizonMonths ?? defaultHorizon),
  )

  const plottedKeys = vt.segmentKeys.filter(
    ({ key }) => !vt.customSegments.includes(key),
  )

  const points: SupplyProjectionPoint[] = []
  for (let m = 0; m <= horizonMonths; m++) {
    const timelinePoint = vt.timeline[Math.min(m, vt.maxMonth)]
    const unlocked = timelinePoint.total

    const unlockedDeltaByType: Record<string, number> = {}
    let unlockedDelta = 0
    if (m <= vt.maxMonth) {
      const prevPoint = m > 0 ? vt.timeline[m - 1] : null
      for (const { key, segment_type } of plottedKeys) {
        const cumulative = (timelinePoint[key] as number) ?? 0
        const previous = prevPoint ? ((prevPoint[key] as number) ?? 0) : 0
        const delta = cumulative - previous
        if (delta === 0) continue
        unlockedDeltaByType[segment_type] =
          (unlockedDeltaByType[segment_type] ?? 0) + delta
        unlockedDelta += delta
      }
    }

    let minted = 0
    let mintedDelta = 0
    if (m > 0) {
      const prev = points[m - 1]
      if (emission.active) {
        const yearIndex = Math.floor((m - 1) / 12) + 1
        const annualPct = annualRatePctForYear(emission, yearIndex)
        mintedDelta = prev.circulating * monthlyRateFromAnnualPct(annualPct)
      }
      minted = prev.minted + mintedDelta
    }

    points.push({
      month: m,
      date:
        m <= vt.maxMonth
          ? timelinePoint.date
          : tgeDate
            ? formatMonthLabel(tgeDate, m)
            : null,
      unlocked,
      minted,
      circulating: unlocked + minted,
      unlockedDelta,
      mintedDelta,
      unlockedDeltaByType,
    })
  }

  const finalCirculating = points[points.length - 1].circulating

  return {
    points,
    horizonMonths,
    maxSupply,
    emissionActive: emission.active,
    timeline: vt.timeline,
    segmentKeys: vt.segmentKeys,
    customSegments: vt.customSegments,
    finalCirculating,
    finalCirculatingPctOfMax:
      maxSupply > 0 ? (finalCirculating / maxSupply) * 100 : null,
  }
}

/** Nominal monthly sell pressure from a supply projection under a scenario. */
export function computeSellPressure(
  supply: SupplyProjection,
  scenario: ProjectionScenario,
): SellPressureResult {
  const hasPrice =
    scenario.refPriceUsd !== null &&
    Number.isFinite(scenario.refPriceUsd) &&
    scenario.refPriceUsd > 0
  const hasDepth =
    scenario.marketDepthUsd !== null &&
    Number.isFinite(scenario.marketDepthUsd) &&
    scenario.marketDepthUsd > 0

  const pctForType = (segmentType: string): number =>
    clampPct(
      scenario.pctSoldByType[segmentType] ??
        DEFAULT_SELL_PRESSURE_PCT[segmentType as SegmentType] ??
        0,
    )
  const pctEmission = clampPct(scenario.pctSoldEmission)

  const points: SellPressurePoint[] = supply.points.map((point) => {
    let tokensSold = 0
    for (const [segmentType, delta] of Object.entries(
      point.unlockedDeltaByType,
    )) {
      tokensSold += delta * (pctForType(segmentType) / 100)
    }
    tokensSold += point.mintedDelta * (pctEmission / 100)

    const soldUsd = hasPrice
      ? tokensSold * (scenario.refPriceUsd as number)
      : null
    const priceImpactPct =
      soldUsd !== null && hasDepth
        ? (-2 * soldUsd) / (scenario.marketDepthUsd as number)
        : null

    return {
      month: point.month,
      date: point.date,
      newTokens: point.unlockedDelta + point.mintedDelta,
      unlockedDelta: point.unlockedDelta,
      mintedDelta: point.mintedDelta,
      tokensSold,
      soldUsd,
      priceImpactPct,
    }
  })

  return { points, hasPrice, hasDepth }
}

/** Headline stats for the panel's summary bar. */
export function summarizeProjection(
  supply: SupplyProjection,
  pressure: SellPressureResult,
  scenario: ProjectionScenario,
): ProjectionSummary {
  const impliedFdvUsd =
    pressure.hasPrice && supply.maxSupply > 0
      ? round2((scenario.refPriceUsd as number) * supply.maxSupply)
      : null

  let worstMonth: ProjectionSummary['worstMonth'] = null
  for (const point of pressure.points) {
    const magnitude = pressure.hasPrice
      ? (point.soldUsd as number)
      : point.tokensSold
    if (magnitude <= 0) continue
    const currentWorst = worstMonth
      ? pressure.hasPrice
        ? (worstMonth.soldUsd as number)
        : worstMonth.tokensSold
      : -Infinity
    if (magnitude > currentWorst) {
      worstMonth = {
        month: point.month,
        tokensSold: point.tokensSold,
        soldUsd: point.soldUsd,
        priceImpactPct: point.priceImpactPct,
      }
    }
  }

  const monthsAboveDepth =
    pressure.hasPrice && pressure.hasDepth
      ? pressure.points.filter(
          (point) =>
            (point.soldUsd as number) > (scenario.marketDepthUsd as number),
        ).length
      : null

  return { impliedFdvUsd, worstMonth, monthsAboveDepth }
}
