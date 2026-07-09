'use client'

import { useAccount } from 'wagmi'
import { useWalletLink, type WalletLink } from './use-wallet-link'
import { addressesMatch } from './address'

export interface VerifiedWallet {
  /** the wagmi-connected wallet, lowercased; null if nothing is connected */
  connectedAddress: string | null
  /** true iff connectedAddress matches an ACTIVE wallet_links row */
  isVerified: boolean
  /** the matched active link's address, or null if not verified */
  verifiedAddress: string | null
}

/** The subset of a wallet_links row `resolveVerifiedWallet` needs to cross-reference. */
export type VerifiableLink = Pick<WalletLink, 'wallet_address' | 'unlinked_at'>

/**
 * Crosses a connected wallet address against a list of wallet_links rows.
 * Pure cross-referencing, no writes: this just tells callers whether the
 * wallet in the browser is one the user has already proven ownership of,
 * using the same case-insensitive comparison the linking flow itself uses
 * (`addressesMatch`). Rows with a non-null `unlinked_at` are inactive and
 * never count as a match, mirroring the `unlinked_at IS NULL` filter that
 * `useWalletLink` already applies at the query level; filtering here too
 * keeps this helper correct even if it is ever called with an unfiltered
 * list. Exported for unit testing.
 */
export function resolveVerifiedWallet(
  connectedAddress: string | null,
  links: VerifiableLink[],
): { isVerified: boolean; verifiedAddress: string | null } {
  const matchedLink = connectedAddress
    ? links.find(
        (link) =>
          link.unlinked_at === null &&
          addressesMatch(link.wallet_address, connectedAddress),
      )
    : undefined

  return {
    isVerified: Boolean(matchedLink),
    verifiedAddress: matchedLink?.wallet_address ?? null,
  }
}

/**
 * Crosses the currently connected wagmi wallet against the current user's
 * active wallet links (`useWalletLink().links`, already filtered to
 * `unlinked_at IS NULL`). See `resolveVerifiedWallet` for the pure
 * cross-referencing logic this delegates to.
 */
export function useVerifiedWallet(): VerifiedWallet {
  const { address } = useAccount()
  const { links } = useWalletLink()

  const connectedAddress = address ? address.toLowerCase() : null
  const { isVerified, verifiedAddress } = resolveVerifiedWallet(
    connectedAddress,
    links,
  )

  return { connectedAddress, isVerified, verifiedAddress }
}
