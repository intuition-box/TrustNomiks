'use client'

import { useAccount } from 'wagmi'
import { Link2, ShieldCheck, Star, Unlink, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HashText } from '@/components/composite/hash-text'
import { WalletGate } from '@/components/composite/wallet-gate'
import { walletEnabled } from '@/config/wagmi'
import { useWalletLink, type WalletLink } from './use-wallet-link'
import { addressesMatch } from './address'

/**
 * Milestone J1d: shows the wallets the current user has proven ownership of
 * (via the nonce + sign + verify handshake) and lets them link the currently
 * connected wallet, promote a wallet to primary, or unlink one.
 */
export function WalletLinksCard() {
  const { address } = useAccount()
  const {
    links,
    isLoading,
    error,
    linkWallet,
    isLinking,
    unlink,
    isUnlinking,
    setPrimary,
    isSettingPrimary,
  } = useWalletLink()

  const connectedAlreadyLinked = links.some((link) =>
    addressesMatch(link.wallet_address, address),
  )

  return (
    <section className="rounded-xl border bg-surface-1 p-5">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-data-wallet" aria-hidden />
        <h3 className="font-semibold leading-none tracking-tight">
          Linked wallets
        </h3>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Wallets you have proven ownership of by signing a one-time message.
        TrustNomiks uses your primary wallet for on-chain actions.
      </p>

      <div className="mt-4 space-y-2">
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading wallets...</p>
        )}
        {!isLoading && error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {!isLoading && !error && links.length === 0 && (
          <p className="text-sm text-muted-foreground">Not set</p>
        )}
        {!isLoading && links.length > 0 && (
          <ul className="space-y-2">
            {links.map((link) => (
              <WalletLinkRow
                key={link.wallet_address}
                link={link}
                onMakePrimary={() => setPrimary(link.wallet_address)}
                onUnlink={() => unlink(link.wallet_address)}
                pending={isSettingPrimary || isUnlinking}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 border-t pt-4">
        {!walletEnabled ? (
          <p className="text-sm text-muted-foreground">
            On-chain features are disabled in this environment.
          </p>
        ) : connectedAlreadyLinked ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
            Connected wallet is already linked
          </div>
        ) : (
          <WalletGate reason="Sign a one-time message to prove you own this wallet and link it to your TrustNomiks account.">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={linkWallet} disabled={isLinking}>
                <Link2 className="mr-1.5 h-4 w-4" aria-hidden />
                {isLinking ? 'Linking...' : 'Link this wallet'}
              </Button>
              {address && <HashText value={address} withCopy={false} />}
            </div>
          </WalletGate>
        )}
      </div>
    </section>
  )
}

function WalletLinkRow({
  link,
  onMakePrimary,
  onUnlink,
  pending,
}: {
  link: WalletLink
  onMakePrimary: () => void
  onUnlink: () => void
  pending: boolean
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <HashText value={link.wallet_address} />
        {link.is_primary && (
          <Badge variant="secondary" className="gap-1">
            <Star className="h-3 w-3" aria-hidden />
            Primary
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!link.is_primary && (
          <Button
            variant="outline"
            size="sm"
            onClick={onMakePrimary}
            disabled={pending}
          >
            Make primary
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onUnlink}
          disabled={pending}
        >
          <Unlink className="mr-1 h-3.5 w-3.5" aria-hidden />
          Unlink
        </Button>
      </div>
    </li>
  )
}
