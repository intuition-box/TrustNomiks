import { describe, it, expect } from 'vitest'

import { createRng, drawStandardNormalMatrix } from './rng'

describe('createRng', () => {
  it('is deterministic per seed and diverges across seeds', () => {
    const a = createRng(42)
    const b = createRng(42)
    const c = createRng(43)
    const seqA: number[] = []
    const seqB: number[] = []
    const seqC: number[] = []
    for (let i = 0; i < 100; i++) {
      seqA.push(a.nextUniform(), a.nextNormal())
      seqB.push(b.nextUniform(), b.nextNormal())
      seqC.push(c.nextUniform(), c.nextNormal())
    }
    expect(seqA).toEqual(seqB)
    expect(seqA).not.toEqual(seqC)
  })

  it('keeps uniforms strictly inside [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 10_000; i++) {
      const u = rng.nextUniform()
      expect(u).toBeGreaterThan(0) // (u32 + 0.5) * 2^-32 is never 0
      expect(u).toBeLessThan(1)
    }
  })

  it('produces uniforms with the expected moments', () => {
    const rng = createRng(1234)
    const n = 50_000
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < n; i++) {
      const u = rng.nextUniform()
      sum += u
      sumSq += u * u
    }
    const mean = sum / n
    const variance = sumSq / n - mean * mean
    expect(mean).toBeCloseTo(0.5, 2)
    expect(Math.abs(variance - 1 / 12)).toBeLessThan(0.01)
  })

  it('produces standard normals and a faithful matrix export', () => {
    const rng = createRng(99)
    const n = 10_001 // odd: exercises the Box-Muller pair cache boundary
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < n; i++) {
      const z = rng.nextNormal()
      sum += z
      sumSq += z * z
    }
    const mean = sum / n
    const variance = sumSq / n - mean * mean
    expect(Math.abs(mean)).toBeLessThan(0.05)
    expect(Math.abs(variance - 1)).toBeLessThan(0.05)

    // The matrix is exactly the sequential normal stream of a twin RNG.
    const matrix = drawStandardNormalMatrix(createRng(5), 2, 5)
    const twin = createRng(5)
    const flat = [...matrix[0], ...matrix[1]]
    for (const value of flat) {
      expect(value).toBe(twin.nextNormal())
    }
  })
})
