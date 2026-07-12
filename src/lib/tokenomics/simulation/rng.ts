/**
 * Seeded, reproducible random number generation for the simulation engine.
 * xoshiro128** over four uint32 words (no BigInt anywhere near the hot
 * loop), state seeded by splitmix32. The same seed always yields the same
 * sequence, which makes every simulation replayable from (seed, scenario).
 */

/** Seeded generator; consumption order is part of the reproducibility contract. */
export interface Rng {
  /** Uniform in [0, 1) with 32 bits of entropy. */
  nextUniform(): number
  /** Standard normal N(0,1) via Box-Muller (pair cached). */
  nextNormal(): number
}

/** splitmix32: expands a 32-bit seed into well-mixed state words. */
const splitmix32 = (state: number): { value: number; state: number } => {
  state = (state + 0x9e3779b9) | 0
  let z = state
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
  z = z ^ (z >>> 15)
  return { value: z >>> 0, state }
}

const rotl = (x: number, k: number): number =>
  ((x << k) | (x >>> (32 - k))) >>> 0

export function createRng(seed: number): Rng {
  let sm = Math.floor(seed) >>> 0
  let s0 = 0
  let s1 = 0
  let s2 = 0
  let s3 = 0
  // Seed the four state words; re-seed until at least one is non-zero
  // (an all-zero xoshiro state is a fixed point).
  do {
    ;({ value: s0, state: sm } = splitmix32(sm))
    ;({ value: s1, state: sm } = splitmix32(sm))
    ;({ value: s2, state: sm } = splitmix32(sm))
    ;({ value: s3, state: sm } = splitmix32(sm))
  } while ((s0 | s1 | s2 | s3) === 0)

  const nextUint32 = (): number => {
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0
    const t = (s1 << 9) >>> 0
    s2 = (s2 ^ s0) >>> 0
    s3 = (s3 ^ s1) >>> 0
    s1 = (s1 ^ s2) >>> 0
    s0 = (s0 ^ s3) >>> 0
    s2 = (s2 ^ t) >>> 0
    s3 = rotl(s3, 11)
    return result
  }

  // (u32 + 0.5) / 2^32: strictly inside (0, 1), so Math.log never sees 0.
  const nextUniform = (): number => (nextUint32() + 0.5) * 2 ** -32

  let cachedNormal: number | null = null
  const nextNormal = (): number => {
    if (cachedNormal !== null) {
      const value = cachedNormal
      cachedNormal = null
      return value
    }
    const u1 = nextUniform()
    const u2 = nextUniform()
    const r = Math.sqrt(-2 * Math.log(u1))
    const theta = 2 * Math.PI * u2
    cachedNormal = r * Math.sin(theta)
    return r * Math.cos(theta)
  }

  return { nextUniform, nextNormal }
}

/**
 * nPaths rows of n standard normals, drawn strictly sequentially. This is
 * both how the engine consumes randomness in RNG mode and the export format
 * of the parity harness (which injects the matrix back via the engine's
 * z option).
 */
export function drawStandardNormalMatrix(
  rng: Rng,
  nPaths: number,
  n: number,
): Float64Array[] {
  const rows: Float64Array[] = []
  for (let p = 0; p < nPaths; p++) {
    const row = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      row[i] = rng.nextNormal()
    }
    rows.push(row)
  }
  return rows
}
