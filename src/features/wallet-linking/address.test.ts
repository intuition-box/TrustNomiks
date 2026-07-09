import { describe, it, expect } from 'vitest'
import { addressesMatch } from './address'

describe('addressesMatch', () => {
  it('matches the same address in different casings', () => {
    // Checksummed vs lowercase must still be considered the same wallet:
    // recoverMessageAddress and the stored nonce row are not guaranteed to
    // share the same casing.
    expect(
      addressesMatch(
        '0xAbC1230000000000000000000000000000dEaD',
        '0xabc1230000000000000000000000000000dead',
      ),
    ).toBe(true)
  })

  it('rejects two genuinely different addresses', () => {
    expect(
      addressesMatch(
        '0xabc1230000000000000000000000000000dead',
        '0x0000000000000000000000000000000000beef',
      ),
    ).toBe(false)
  })

  it('rejects when either side is null', () => {
    expect(
      addressesMatch(null, '0xabc1230000000000000000000000000000dead'),
    ).toBe(false)
    expect(
      addressesMatch('0xabc1230000000000000000000000000000dead', null),
    ).toBe(false)
  })

  it('rejects when either side is undefined', () => {
    expect(
      addressesMatch(undefined, '0xabc1230000000000000000000000000000dead'),
    ).toBe(false)
    expect(
      addressesMatch('0xabc1230000000000000000000000000000dead', undefined),
    ).toBe(false)
  })

  it('rejects when either side is an empty string', () => {
    // Empty string is falsy, so it must short-circuit the same as null/undefined
    // rather than reaching the trim/lowercase comparison.
    expect(addressesMatch('', '0xabc1230000000000000000000000000000dead')).toBe(
      false,
    )
    expect(addressesMatch('0xabc1230000000000000000000000000000dead', '')).toBe(
      false,
    )
  })

  it('matches when equal but padded with surrounding whitespace', () => {
    // Values sourced from form inputs or copy/paste can carry stray whitespace;
    // the comparison must trim before lowercasing so this stays a match.
    expect(
      addressesMatch(
        '  0xabc1230000000000000000000000000000dead  ',
        '0xabc1230000000000000000000000000000dead',
      ),
    ).toBe(true)
  })

  it('rejects a value that is only whitespace', () => {
    // Whitespace-only trims to empty, which must be treated as absent.
    expect(
      addressesMatch('   ', '0xabc1230000000000000000000000000000dead'),
    ).toBe(false)
  })
})
