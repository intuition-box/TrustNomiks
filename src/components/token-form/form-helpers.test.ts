import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSaveQueue, parseDecimal } from './form-helpers'

describe('parseDecimal', () => {
  it('parses a French-locale comma decimal', () => {
    expect(parseDecimal('18,52')).toBe(18.52)
  })

  it('parses a plain dot decimal unchanged', () => {
    expect(parseDecimal('18.52')).toBe(18.52)
  })

  it('documents the space-thousands + comma-decimal edge case', () => {
    // No dot is present, so the comma is treated as the decimal separator:
    // "1 000,5" -> "1 000.5". parseFloat then stops at the internal space
    // (it only trims leading/trailing whitespace), so this intentionally
    // resolves to 1, not 1000.5. Space-grouped input is not a case this
    // helper normalizes; it stays simple and predictable for the comma case.
    expect(parseDecimal('1 000,5')).toBe(1)
  })

  it('returns NaN for an empty string', () => {
    expect(parseDecimal('')).toBeNaN()
  })

  it('returns NaN for a non-numeric string', () => {
    expect(parseDecimal('abc')).toBeNaN()
  })

  it('treats commas as thousands separators when a dot is also present', () => {
    // Both separators present -> commas are stripped as thousands grouping,
    // so this must resolve to 1000.5, not 1.0005.
    expect(parseDecimal('1,000.5')).toBe(1000.5)
  })
})

describe('createSaveQueue', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs enqueued saves strictly in order, one at a time', async () => {
    const order: string[] = []
    const enqueueSave = createSaveQueue()

    const slow = enqueueSave(async () => {
      order.push('slow:start')
      await new Promise((r) => setTimeout(r, 10))
      order.push('slow:end')
      return true
    })
    const fast = enqueueSave(async () => {
      order.push('fast')
      return true
    })

    await Promise.all([slow, fast])
    expect(order).toEqual(['slow:start', 'slow:end', 'fast'])
  })

  it('propagates the settled value of each save to its own caller', async () => {
    const enqueueSave = createSaveQueue()
    const a = await enqueueSave(async () => true)
    const b = await enqueueSave(async () => false)
    expect(a).toBe(true)
    expect(b).toBe(false)
  })

  it('keeps the queue alive after a save rejects, instead of jamming it', async () => {
    const enqueueSave = createSaveQueue()
    const failing = await enqueueSave(async () => {
      throw new Error('boom')
    })
    const next = await enqueueSave(async () => true)
    expect(failing).toBe(false)
    expect(next).toBe(true)
  })

  // Reproduces the reported bug: a save whose awaited call never settles
  // (e.g. a Supabase request that hangs) must not wedge every later save —
  // autosave, "Continue", "Finish" — behind it forever.
  it('does not let one hung save block every later enqueued save forever', async () => {
    vi.useFakeTimers()
    const onTimeout = vi.fn()
    const enqueueSave = createSaveQueue({ timeoutMs: 1000, onTimeout })

    const neverSettles = () => new Promise<boolean>(() => {})
    const stuck = enqueueSave(neverSettles)

    const laterSave = vi.fn(async () => true)
    const later = enqueueSave(laterSave)

    // Before the timeout fires, the later save must not have run yet: the
    // queue really is serialized.
    await vi.advanceTimersByTimeAsync(500)
    expect(laterSave).not.toHaveBeenCalled()

    // Past the timeout, the stuck save resolves `false` and releases the
    // queue so the later save actually runs.
    await vi.advanceTimersByTimeAsync(600)
    expect(await stuck).toBe(false)
    expect(await later).toBe(true)
    expect(laterSave).toHaveBeenCalledTimes(1)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })
})
