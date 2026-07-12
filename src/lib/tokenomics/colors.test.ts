import { describe, it, expect } from 'vitest'
import { chartColorsFor, getSegmentChartColor } from './colors'

describe('getSegmentChartColor', () => {
  it('returns the base hsl(var(--chart-*)) for a known type at first occurrence', () => {
    expect(getSegmentChartColor('team-founders')).toBe(
      'hsl(var(--chart-team-founders))',
    )
    expect(getSegmentChartColor('liquidity', 0)).toBe(
      'hsl(var(--chart-liquidity))',
    )
  })

  it('ramps repeated same-type segments through color-mix lightness steps', () => {
    expect(getSegmentChartColor('team-founders', 1)).toBe(
      'color-mix(in oklab, hsl(var(--chart-team-founders)) 82%, white)',
    )
    expect(getSegmentChartColor('team-founders', 2)).toBe(
      'color-mix(in oklab, hsl(var(--chart-team-founders)) 82%, black)',
    )
    // Past the last ramp step, the mix clamps to the final entry
    expect(getSegmentChartColor('team-founders', 99)).toBe(
      'color-mix(in oklab, hsl(var(--chart-team-founders)) 46%, white)',
    )
  })

  it('rotates unknown custom types through the chart palette modulo its length', () => {
    expect(getSegmentChartColor('community-pool', 0)).toBe(
      'hsl(var(--chart-funding-private))',
    )
    expect(getSegmentChartColor('community-pool', 1)).toBe(
      'hsl(var(--chart-funding-public))',
    )
    // 8 palette entries: occurrence 8 wraps back to the first token
    expect(getSegmentChartColor('community-pool', 8)).toBe(
      'hsl(var(--chart-funding-private))',
    )
  })
})

describe('chartColorsFor', () => {
  it('counts per-type occurrences in list order so charts and legends agree', () => {
    expect(
      chartColorsFor(['team-founders', 'liquidity', 'team-founders']),
    ).toEqual([
      'hsl(var(--chart-team-founders))',
      'hsl(var(--chart-liquidity))',
      'color-mix(in oklab, hsl(var(--chart-team-founders)) 82%, white)',
    ])
  })
})
