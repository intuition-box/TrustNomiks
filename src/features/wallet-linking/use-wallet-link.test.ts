import { describe, it, expect } from 'vitest'
import { humanizeWalletLinkError } from './use-wallet-link'

const CONFLICT_MESSAGE =
  'This wallet is already linked to a different TrustNomiks account.'

describe('humanizeWalletLinkError', () => {
  it('maps the CONFLICT/already-linked message to the friendly copy', () => {
    expect(
      humanizeWalletLinkError(
        new Error('CONFLICT: wallet already linked to an account'),
      ),
    ).toBe(CONFLICT_MESSAGE)
  })

  it('maps a Postgrest unique-violation (code 23505) to the friendly copy', () => {
    expect(
      humanizeWalletLinkError({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      }),
    ).toBe(CONFLICT_MESSAGE)
  })

  it('falls back to the error message for a generic error', () => {
    expect(humanizeWalletLinkError(new Error('network timeout'))).toBe(
      'network timeout',
    )
  })

  it('falls back to a generic message for an unknown error shape', () => {
    expect(humanizeWalletLinkError('not an error object')).toBe(
      'Failed to link wallet',
    )
  })
})
