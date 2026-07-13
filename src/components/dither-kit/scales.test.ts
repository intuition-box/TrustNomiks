/**
 * Covers the two primitives we added to the vendored engine: range bands and a
 * free y domain. The non-regression cases matter as much as the new ones — a
 * chart that declares no range must scale exactly as it did upstream.
 */
import { describe, expect, it } from 'vitest'
import { buildYScale, computeBands } from './scales'

const rows = [
  { a: 10, b: 5, p05: 0.8, p95: 1.6 },
  { a: 20, b: 5, p05: 0.5, p95: 2.4 },
  { a: 30, b: 10, p05: 0.2, p95: 3.0 },
]

describe('computeBands — upstream behaviour is untouched', () => {
  it('floors every series at zero for stackType default', () => {
    const { bands, max, min } = computeBands(rows, ['a', 'b'], 'default')
    expect(bands.a).toEqual([
      [0, 10],
      [0, 20],
      [0, 30],
    ])
    expect(bands.b[2]).toEqual([0, 10])
    expect(max).toBe(30)
    expect(min).toBe(0)
  })

  it('piles series on top of each other when stacked', () => {
    const { bands, max, min } = computeBands(rows, ['a', 'b'], 'stacked')
    expect(bands.a[0]).toEqual([0, 10])
    expect(bands.b[0]).toEqual([10, 15]) // b sits on a
    expect(max).toBe(40) // 30 + 10
    expect(min).toBe(0)
  })

  it('falls back to a max of 1 on empty data, so the scale never collapses', () => {
    expect(computeBands([], ['a'], 'default').max).toBe(1)
  })
})

describe('computeBands — range series (added)', () => {
  const ranges = { envelope: ['p05', 'p95'] as [string, string] }

  it('reads the band straight off the two row fields', () => {
    const { bands } = computeBands(rows, ['envelope'], 'default', ranges)
    expect(bands.envelope).toEqual([
      [0.8, 1.6],
      [0.5, 2.4],
      [0.2, 3.0],
    ])
  })

  it('reports the true min and max, so the axis can fit the envelope', () => {
    const { min, max } = computeBands(rows, ['envelope'], 'default', ranges)
    expect(min).toBe(0.2)
    expect(max).toBe(3.0)
  })

  it('orders the pair, so a swapped lower/upper still paints', () => {
    const { bands } = computeBands([{ hi: 5, lo: 1 }], ['r'], 'default', {
      r: ['hi', 'lo'],
    })
    expect(bands.r[0]).toEqual([1, 5])
  })

  it('keeps a range series out of the stack while the others still pile', () => {
    const { bands } = computeBands(rows, ['envelope', 'a', 'b'], 'stacked', {
      envelope: ['p05', 'p95'],
    })
    // The range keeps its own floor…
    expect(bands.envelope[0]).toEqual([0.8, 1.6])
    // …and a and b stack against each other, not against it.
    expect(bands.a[0]).toEqual([0, 10])
    expect(bands.b[0]).toEqual([10, 15])
  })

  it('a chart with no range still reports min 0 even if a value dips', () => {
    const { min } = computeBands([{ a: -5 }], ['a'], 'default')
    expect(min).toBe(0)
  })
})

describe('buildYScale', () => {
  it('anchors at zero by default, as upstream does', () => {
    const y = buildYScale(0, 100, 200)
    expect(y.domain()).toEqual([0, 100])
    expect(y(0)).toBe(200) // floor at the bottom of the plot
    expect(y(100)).toBe(0)
  })

  it('honours an explicit domain, so a price axis need not start at zero', () => {
    const y = buildYScale(0, 3, 200, [0.2, 3])
    expect(y.domain()[0]).toBeGreaterThan(0)
    expect(y(0.2)).toBeGreaterThan(y(3)) // lower value sits lower on screen
  })

  it('an envelope pinned near $1.20 does not collapse into a sliver', () => {
    const zeroBased = buildYScale(0, 1.6, 200)
    const fitted = buildYScale(0.8, 1.6, 200, [0.8, 1.6])
    const spread = (s: typeof fitted) => Math.abs(s(1.6) - s(0.8))
    // The fitted axis gives the same data far more vertical room.
    expect(spread(fitted)).toBeGreaterThan(spread(zeroBased) * 1.5)
  })
})
