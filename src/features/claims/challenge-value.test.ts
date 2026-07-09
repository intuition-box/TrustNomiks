import { describe, it, expect } from 'vitest'
import { encodeFieldValue } from './challenge-value'

describe('encodeFieldValue', () => {
  describe('number / percentage', () => {
    it('coerces a numeric string to a number', () => {
      expect(encodeFieldValue('number', '42')).toBe(42)
      expect(encodeFieldValue('percentage', '12.5')).toBe(12.5)
    })

    it('passes a plain number through unchanged', () => {
      expect(encodeFieldValue('number', 1_000_000)).toBe(1_000_000)
    })

    it('returns null for null, undefined, and empty string', () => {
      expect(encodeFieldValue('number', null)).toBeNull()
      expect(encodeFieldValue('number', undefined)).toBeNull()
      expect(encodeFieldValue('number', '')).toBeNull()
    })

    it('returns null for a value that does not parse to a number', () => {
      expect(encodeFieldValue('number', 'not-a-number')).toBeNull()
      expect(encodeFieldValue('percentage', 'abc')).toBeNull()
    })

    it('documents the >2^53 precision note: a plain JS number is used, so', () => {
      // A value one larger than MAX_SAFE_INTEGER may not encode to the exact
      // decimal digits Postgres' numeric column stores. This is acceptable
      // for challenge matching: a resulting mismatch only ever downgrades an
      // auto-accept to 'stale' in mark_stale_challenges_for_field, it never
      // corrupts the stored value (that always comes from the save_*_tx
      // path, not from this encoder).
      const huge = '9007199254740993' // MAX_SAFE_INTEGER + 2, not representable exactly
      const encoded = encodeFieldValue('number', huge)
      expect(encoded).toBe(Number(huge))
      expect(String(encoded)).not.toBe(huge)
    })
  })

  describe('boolean', () => {
    it('accepts true-like values', () => {
      expect(encodeFieldValue('boolean', true)).toBe(true)
      expect(encodeFieldValue('boolean', 'true')).toBe(true)
      expect(encodeFieldValue('boolean', 1)).toBe(true)
    })

    it('accepts false-like values', () => {
      expect(encodeFieldValue('boolean', false)).toBe(false)
      expect(encodeFieldValue('boolean', 'false')).toBe(false)
      expect(encodeFieldValue('boolean', 0)).toBe(false)
      expect(encodeFieldValue('boolean', '')).toBe(false)
    })

    it('returns null for null/undefined', () => {
      expect(encodeFieldValue('boolean', null)).toBeNull()
      expect(encodeFieldValue('boolean', undefined)).toBeNull()
    })
  })

  describe('date', () => {
    it('slices an ISO timestamp down to the date portion', () => {
      expect(encodeFieldValue('date', '2026-07-09T00:00:00.000Z')).toBe(
        '2026-07-09',
      )
    })

    it('passes a bare YYYY-MM-DD string through unchanged', () => {
      expect(encodeFieldValue('date', '2026-07-09')).toBe('2026-07-09')
    })

    it('returns null for null, undefined, and empty string', () => {
      expect(encodeFieldValue('date', null)).toBeNull()
      expect(encodeFieldValue('date', undefined)).toBeNull()
      expect(encodeFieldValue('date', '')).toBeNull()
    })
  })

  describe('text / enum', () => {
    it('trims whitespace', () => {
      expect(encodeFieldValue('text', '  Ethereum  ')).toBe('Ethereum')
      expect(encodeFieldValue('enum', ' linear ')).toBe('linear')
    })

    it('stringifies a non-string value', () => {
      expect(encodeFieldValue('text', 42)).toBe('42')
    })

    it('returns null for null, undefined, and a whitespace-only string', () => {
      expect(encodeFieldValue('text', null)).toBeNull()
      expect(encodeFieldValue('text', undefined)).toBeNull()
      expect(encodeFieldValue('enum', '   ')).toBeNull()
    })
  })
})
