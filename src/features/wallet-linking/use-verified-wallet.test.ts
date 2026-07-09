import { describe, it, expect } from 'vitest'
import {
  resolveVerifiedWallet,
  type VerifiableLink,
} from './use-verified-wallet'

const ACTIVE_LINK: VerifiableLink = {
  wallet_address: '0xAbC1230000000000000000000000000000dEaD',
  unlinked_at: null,
}

const UNLINKED_LINK: VerifiableLink = {
  wallet_address: '0x0000000000000000000000000000000000beef',
  unlinked_at: '2026-01-01T00:00:00.000Z',
}

describe('resolveVerifiedWallet', () => {
  it('matches the connected address against an active link, case-insensitively', () => {
    expect(
      resolveVerifiedWallet('0xabc1230000000000000000000000000000dead', [
        ACTIVE_LINK,
      ]),
    ).toEqual({
      isVerified: true,
      verifiedAddress: ACTIVE_LINK.wallet_address,
    })
  })

  it('returns not verified when no link matches the connected address', () => {
    expect(
      resolveVerifiedWallet('0x1111111111111111111111111111111111aaaa', [
        ACTIVE_LINK,
      ]),
    ).toEqual({ isVerified: false, verifiedAddress: null })
  })

  it('returns not verified when connectedAddress is null', () => {
    expect(resolveVerifiedWallet(null, [ACTIVE_LINK])).toEqual({
      isVerified: false,
      verifiedAddress: null,
    })
  })

  it('does not count an unlinked row (unlinked_at != null) as a match', () => {
    expect(
      resolveVerifiedWallet(UNLINKED_LINK.wallet_address.toLowerCase(), [
        UNLINKED_LINK,
      ]),
    ).toEqual({ isVerified: false, verifiedAddress: null })
  })

  it('returns not verified against an empty links list', () => {
    expect(
      resolveVerifiedWallet('0xabc1230000000000000000000000000000dead', []),
    ).toEqual({ isVerified: false, verifiedAddress: null })
  })
})
