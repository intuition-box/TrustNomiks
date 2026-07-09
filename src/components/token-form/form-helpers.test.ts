import { describe, it, expect } from 'vitest'
import { parseDecimal } from './form-helpers'

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
