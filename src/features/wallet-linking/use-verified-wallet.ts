'use client'

import { useAccount } from 'wagmi'
import { useWalletLink } from './use-wallet-link'
import { addressesMatch } from './address'

export interface VerifiedWallet {
  /** the wagmi-connected wallet, lowercased; null if nothing is connected */
  connectedAddress: string | null
  /** true iff connectedAddress matches an ACTIVE wallet_links row */
  isVerified: boolean
  /** the matched active link's address, or null if not verified */
  verifiedAddress: string | null
}

/**
 * Crosses the currently connected wagmi wallet against the current user's
 * active wallet links (`useWalletLink().links`, already filtered to
 * `unlinked_at IS NULL`). Pure cross-referencing, no writes: this just tells
 * callers whether the wallet in the browser is one the user has already
 * proven ownership of, using the same case-insensitive comparison the
 * linking flow itself uses (`addressesMatch`).
 */
export function useVerifiedWallet(): VerifiedWallet {
  const { address } = useAccount()
  const { links } = useWalletLink()

  const connectedAddress = address ? address.toLowerCase() : null

  const matchedLink = connectedAddress
    ? links.find((link) =>
        addressesMatch(link.wallet_address, connectedAddress),
      )
    : undefined

  return {
    connectedAddress,
    isVerified: Boolean(matchedLink),
    verifiedAddress: matchedLink?.wallet_address ?? null,
  }
}
