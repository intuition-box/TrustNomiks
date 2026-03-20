/**
 * Computes a month-by-month vesting unlock timeline from allocation segments
 * and their vesting schedules. Used to render stacked area charts.
 */

import { addMonths as addMonthsFns, format } from 'date-fns'

export interface AllocationWithVesting {
  label: string
  segment_type: string
  percentage: number
  token_amount: number
  vesting: {
    cliff_months: number
    duration_months: number
    frequency: string // 'immediate' | 'daily' | 'monthly' | 'yearly' | 'custom'
    tge_percentage: number
    cliff_unlock_percentage: number
  } | null
}

export interface VestingTimelineConfig {
  allocations: AllocationWithVesting[]
  maxSupply: number
  tgeDate: string | null
}

export interface VestingTimelinePoint {
  month: number
  date: string | null
  total: number
  [segmentLabel: string]: number | string | null | undefined
}

export interface VestingTimelineResult {
  timeline: VestingTimelinePoint[]
  customSegments: string[]
  maxMonth: number
  /**
   * Maps each unique display key back to the original segment_type.
   * Needed when labels are deduplicated (e.g., "Team (1)", "Team (2)").
   */
  segmentKeys: Array<{ key: string; label: string; segment_type: string }>
}

export function computeVestingTimeline(config: VestingTimelineConfig): VestingTimelineResult {
  const { allocations, maxSupply, tgeDate } = config
  const customSegments: string[] = []

  // --- Step 1: Deduplicate labels ---
  // Two allocations with the same label would silently merge their data series.
  // We generate unique keys and maintain a mapping for display.
  const labelCount = new Map<string, number>()
  for (const alloc of allocations) {
    labelCount.set(alloc.label, (labelCount.get(alloc.label) ?? 0) + 1)
  }

  const labelIndex = new Map<string, number>()
  const uniqueKeys: string[] = []
  const segmentKeys: VestingTimelineResult['segmentKeys'] = []

  for (const alloc of allocations) {
    const count = labelCount.get(alloc.label) ?? 1
    let key: string
    if (count > 1) {
      const idx = (labelIndex.get(alloc.label) ?? 0) + 1
      labelIndex.set(alloc.label, idx)
      key = `${alloc.label} (${idx})`
    } else {
      key = alloc.label
    }
    uniqueKeys.push(key)
    segmentKeys.push({ key, label: alloc.label, segment_type: alloc.segment_type })
  }

  // --- Step 2: Determine max duration ---
  let maxDuration = 0
  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i]
    if (alloc.vesting && alloc.vesting.frequency === 'custom') {
      customSegments.push(uniqueKeys[i])
      continue
    }
    if (alloc.vesting && alloc.vesting.frequency !== 'immediate') {
      const end = alloc.vesting.cliff_months + alloc.vesting.duration_months
      if (end > maxDuration) maxDuration = end
    }
  }

  // Round up to nearest 6 months for clean axis ticks, minimum 1
  maxDuration = Math.max(Math.ceil(maxDuration / 6) * 6, 1)

  // Collect segment keys (excluding custom)
  const activeKeys = uniqueKeys.filter((_, i) => allocations[i].vesting?.frequency !== 'custom')

  // --- Step 3: Initialize timeline ---
  const timeline: VestingTimelinePoint[] = []
  for (let m = 0; m <= maxDuration; m++) {
    const point: VestingTimelinePoint = {
      month: m,
      date: tgeDate ? formatMonth(tgeDate, m) : null,
      total: 0,
    }
    for (const key of activeKeys) {
      point[key] = 0
    }
    timeline.push(point)
  }

  // --- Step 4: Process each allocation ---
  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i]
    const key = uniqueKeys[i]
    if (alloc.vesting?.frequency === 'custom') continue

    const tokenAmount = alloc.token_amount || (alloc.percentage / 100) * maxSupply
    if (tokenAmount <= 0) continue

    const vesting = alloc.vesting

    // No vesting or immediate: 100% at TGE
    if (!vesting || vesting.frequency === 'immediate' || vesting.duration_months === 0) {
      timeline[0][key] = (timeline[0][key] as number) + tokenAmount
      continue
    }

    // TGE unlock
    const tgePct = Math.min(vesting.tge_percentage, 100)
    const tgeTokens = tokenAmount * (tgePct / 100)
    timeline[0][key] = (timeline[0][key] as number) + tgeTokens

    let remaining = tokenAmount - tgeTokens

    // Cliff unlock
    const cliffEnd = vesting.cliff_months
    const cliffPct = Math.min(vesting.cliff_unlock_percentage, 100)
    const cliffTokens = remaining * (cliffPct / 100)

    if (cliffEnd > 0 && cliffEnd <= maxDuration) {
      timeline[cliffEnd][key] = (timeline[cliffEnd][key] as number) + cliffTokens
    } else if (cliffEnd === 0 && cliffPct > 0) {
      timeline[0][key] = (timeline[0][key] as number) + cliffTokens
    }

    remaining -= cliffTokens

    // Linear vesting of remaining tokens
    const vestingStart = cliffEnd
    const vestingEnd = vestingStart + vesting.duration_months

    if (remaining > 0 && vesting.duration_months > 0) {
      switch (vesting.frequency) {
        case 'monthly':
        case 'daily': {
          const periods = vesting.duration_months
          const perPeriod = remaining / periods
          for (let m = vestingStart + 1; m <= Math.min(vestingEnd, maxDuration); m++) {
            timeline[m][key] = (timeline[m][key] as number) + perPeriod
          }
          break
        }
        case 'yearly': {
          // Convention: unlocks at each 12-month anniversary within the duration.
          // If duration is not a multiple of 12, a final unlock occurs at the end
          // of the exact duration. Total unlock events = ceil(duration / 12).
          // Amount per event is remaining / totalEvents.
          const totalEvents = Math.ceil(vesting.duration_months / 12)
          const perEvent = remaining / totalEvents

          for (let e = 1; e <= totalEvents; e++) {
            // First (totalEvents - 1) events at 12-month boundaries,
            // last event at the exact end of the duration
            const m = e < totalEvents
              ? vestingStart + e * 12
              : vestingEnd
            if (m <= maxDuration) {
              timeline[m][key] = (timeline[m][key] as number) + perEvent
            }
          }
          break
        }
        default: {
          const periods = vesting.duration_months
          const perPeriod = remaining / periods
          for (let m = vestingStart + 1; m <= Math.min(vestingEnd, maxDuration); m++) {
            timeline[m][key] = (timeline[m][key] as number) + perPeriod
          }
        }
      }
    }
  }

  // --- Step 5: Convert to cumulative ---
  for (let m = 1; m <= maxDuration; m++) {
    for (const key of activeKeys) {
      timeline[m][key] = (timeline[m][key] as number) + (timeline[m - 1][key] as number)
    }
  }

  // Compute totals
  for (let m = 0; m <= maxDuration; m++) {
    let total = 0
    for (const key of activeKeys) {
      total += timeline[m][key] as number
    }
    timeline[m].total = total
  }

  return { timeline, customSegments, maxMonth: maxDuration, segmentKeys }
}

/**
 * Add months to an ISO date string and return formatted "MMM yyyy".
 * Uses date-fns for safe month arithmetic (handles month boundaries correctly).
 */
function formatMonth(isoDate: string, months: number): string {
  const d = addMonthsFns(new Date(isoDate), months)
  return format(d, 'MMM yyyy')
}

/**
 * Format a number compactly: 1000000 → "1M", 1500 → "1.5K", etc.
 */
export function formatCompactNumber(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return value.toFixed(0)
}
