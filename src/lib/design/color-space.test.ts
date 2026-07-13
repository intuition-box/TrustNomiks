import { describe, expect, it } from 'vitest'
import {
  BLACK,
  hslToRgb,
  lighten,
  mixOklab,
  parseHslTriplet,
  WHITE,
} from './color-space'

describe('hslToRgb', () => {
  it('maps the sRGB primaries and extremes', () => {
    expect(hslToRgb(0, 0, 100)).toEqual([255, 255, 255])
    expect(hslToRgb(0, 0, 0)).toEqual([0, 0, 0])
    expect(hslToRgb(0, 100, 50)).toEqual([255, 0, 0])
    expect(hslToRgb(120, 100, 50)).toEqual([0, 255, 0])
    expect(hslToRgb(240, 100, 50)).toEqual([0, 0, 255])
    expect(hslToRgb(0, 0, 50)).toEqual([128, 128, 128])
  })

  it('wraps hue', () => {
    expect(hslToRgb(360, 100, 50)).toEqual(hslToRgb(0, 100, 50))
    expect(hslToRgb(-120, 100, 50)).toEqual(hslToRgb(240, 100, 50))
  })
})

describe('parseHslTriplet', () => {
  it('parses the bare triplet our tokens store', () => {
    // --chart-funding-private, dark
    expect(parseHslTriplet('217 91% 60%')).toEqual([60, 131, 246])
  })

  it('tolerates surrounding whitespace (getComputedStyle pads)', () => {
    expect(parseHslTriplet('  217 91% 60%  ')).toEqual([60, 131, 246])
  })

  it('returns null on anything else, so callers fall back', () => {
    expect(parseHslTriplet('')).toBeNull()
    expect(parseHslTriplet('#3b82f6')).toBeNull()
    expect(parseHslTriplet('217, 91%, 60%')).toBeNull()
  })
})

describe('mixOklab', () => {
  const teal: [number, number, number] = [20, 160, 150]

  it('is the identity at the endpoints', () => {
    expect(mixOklab(teal, WHITE, 1)).toEqual(teal)
    expect(mixOklab(teal, WHITE, 0)).toEqual(WHITE)
  })

  it('mixing a color with itself is a no-op at any weight', () => {
    expect(mixOklab(teal, teal, 0.37)).toEqual(teal)
  })

  it('clamps the weight', () => {
    expect(mixOklab(teal, WHITE, 5)).toEqual(teal)
    expect(mixOklab(teal, WHITE, -5)).toEqual(WHITE)
  })

  it('mixing toward white lightens every channel, toward black darkens', () => {
    const lighter = mixOklab(teal, WHITE, 0.5)
    const darker = mixOklab(teal, BLACK, 0.5)
    for (let i = 0; i < 3; i++) {
      expect(lighter[i]).toBeGreaterThan(teal[i])
      expect(darker[i]).toBeLessThan(teal[i])
    }
  })

  it('stays in gamut', () => {
    for (const w of [0, 0.25, 0.5, 0.82, 1]) {
      for (const c of mixOklab([255, 0, 0], WHITE, w)) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(255)
      }
    }
  })
})

describe('lighten', () => {
  it('0 leaves the color alone, 1 is white', () => {
    const c: [number, number, number] = [60, 131, 246]
    expect(lighten(c, 0)).toEqual(c)
    expect(lighten(c, 1)).toEqual(WHITE)
  })
})
