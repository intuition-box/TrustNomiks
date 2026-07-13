/**
 * Canvas chart space. Vitest runs in `node`, so getComputedStyle is out of
 * reach and every read falls back — which is exactly the SSR / first-paint path
 * we want pinned. The live-token path is exercised in the browser.
 */
import { describe, expect, it } from 'vitest'
import { hslToRgb, mixOklab, WHITE } from './color-space'
import { chartRgbFor, getSegmentChartRgb, getNeutralRgb } from './tokens'

const TREASURY_DARK = hslToRgb(25, 95, 53)

describe('getSegmentChartRgb', () => {
  it('falls back to the dark token value when no CSS is readable', () => {
    expect(getSegmentChartRgb('treasury')).toEqual(TREASURY_DARK)
  })

  it('replays the OKLab ramp for repeated occurrences of a type', () => {
    // Ramp step 1 = `color-mix(in oklab, base 82%, white)`.
    expect(getSegmentChartRgb('treasury', 1)).toEqual(
      mixOklab(TREASURY_DARK, WHITE, 0.82),
    )
  })

  it('gives each occurrence of a type a distinct color', () => {
    const seen = new Set(
      [0, 1, 2, 3, 4, 5].map((n) => getSegmentChartRgb('team-founders', n).join()),
    )
    expect(seen.size).toBe(6)
  })

  it('clamps past the last ramp step instead of going undefined', () => {
    expect(getSegmentChartRgb('treasury', 99)).toEqual(
      getSegmentChartRgb('treasury', 5),
    )
  })

  it('rotates unknown custom types through the palette, unramped', () => {
    // 8 tokens in the rotation, so occurrence 8 wraps back to occurrence 0.
    expect(getSegmentChartRgb('my-custom-pool', 0)).toEqual(
      getSegmentChartRgb('my-custom-pool', 8),
    )
    expect(getSegmentChartRgb('my-custom-pool', 0)).not.toEqual(
      getSegmentChartRgb('my-custom-pool', 1),
    )
  })

  it('is a valid RGB triple', () => {
    for (const c of getSegmentChartRgb('marketing', 3)) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(255)
    }
  })
})

describe('chartRgbFor', () => {
  it('counts occurrences per type, like its CSS twin chartColorsFor', () => {
    const colors = chartRgbFor(['treasury', 'marketing', 'treasury'])
    expect(colors[0]).toEqual(getSegmentChartRgb('treasury', 0))
    expect(colors[1]).toEqual(getSegmentChartRgb('marketing', 0))
    expect(colors[2]).toEqual(getSegmentChartRgb('treasury', 1))
  })

  it('keeps two pools of the same type tellable apart', () => {
    const [a, b] = chartRgbFor(['team-founders', 'team-founders'])
    expect(a).not.toEqual(b)
  })
})

describe('getNeutralRgb', () => {
  it('falls back to the muted-foreground token', () => {
    expect(getNeutralRgb()).toEqual(hslToRgb(240, 5, 68))
  })
})
