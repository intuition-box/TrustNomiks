/**
 * The step curve. This is the one bit of the engine where a bug does not look
 * like a bug: it just draws a smoother line, and the chart quietly lies about
 * when a vesting cliff released its tokens.
 */
import { describe, expect, it } from 'vitest'
import { resample } from './dither-paint'

describe('resample — linear (upstream)', () => {
  it('interpolates between points', () => {
    // Two points, 0 → 10, over 3 columns: the middle column is the midpoint.
    expect(resample([0, 10], 3)).toEqual([0, 5, 10])
  })

  it('is unchanged when no curve is passed', () => {
    expect(resample([0, 10], 3)).toEqual(resample([0, 10], 3, 'linear'))
  })
})

describe('resample — step (added)', () => {
  it('holds the left value instead of ramping to the next', () => {
    // Same input as above: nothing happens until the next point arrives.
    expect(resample([0, 10], 3, 'step')).toEqual([0, 0, 10])
  })

  it('never invents a value between two points', () => {
    // A cliff: nothing, then everything. Linear would draw supply that has not
    // unlocked yet; step must only ever emit values that actually occur.
    const cliff = [0, 0, 100, 100]
    const out = resample(cliff, 24, 'step')
    for (const v of out) {
      expect(cliff).toContain(v)
    }
  })

  it('holds the plateau across the whole gap, then jumps', () => {
    const out = resample([0, 100], 5, 'step')
    expect(out).toEqual([0, 0, 0, 0, 100])
    // The jump lands exactly on the point, not before it.
    expect(out.indexOf(100)).toBe(4)
  })

  it('a linear resample of the same cliff does invent values — the bug we avoid', () => {
    const out = resample([0, 100], 5, 'linear')
    expect(out.some((v) => v > 0 && v < 100)).toBe(true)
  })

  it('preserves the endpoints', () => {
    const src = [3, 7, 5, 9]
    const out = resample(src, 16, 'step')
    expect(out[0]).toBe(3)
    expect(out.at(-1)).toBe(9)
  })

  it('survives a single-point series', () => {
    expect(resample([42], 4, 'step')).toEqual([42, 42, 42, 42])
  })
})

describe('resample — the unclamped-index bug we fixed in the fork', () => {
  // Upstream read src[Math.floor(t)] with no clamp. A single-point series
  // forces `last` to 1, so the final column indexed past the array, fell
  // through `?? 0`, and the series dropped to the floor at the right edge.
  it('does not collapse the last column of a single-point series', () => {
    expect(resample([42], 4, 'linear')).toEqual([42, 42, 42, 42])
    expect(resample([42], 4, 'step')).toEqual([42, 42, 42, 42])
  })

  it('still ends on the real last value for a multi-point series', () => {
    expect(resample([1, 2, 3], 5, 'linear').at(-1)).toBe(3)
    expect(resample([1, 2, 3], 5, 'step').at(-1)).toBe(3)
  })
})
