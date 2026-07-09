'use client'

import { useRouter } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WalletGate } from '@/components/composite/wallet-gate'
import { useWalletLink } from '@/features/wallet-linking/use-wallet-link'
import { useRole } from '@/hooks/use-role'

interface RoleGateProps {
  /** the "why now" copy: what linking a wallet unlocks, right here */
  reason?: React.ReactNode
  title?: string
  /** rendered once the viewer is a contributor (>= 1 active wallet link) */
  children: React.ReactNode
  className?: string
}

/**
 * Gates contributor-only actions behind a linked wallet. Mirrors WalletGate
 * (docs/redesign/08 §1): connect-at-the-boundary, inline card not a modal.
 * Delegates the disabled-environment and not-connected states to WalletGate
 * itself, so the two stay in lockstep, and adds the one extra step
 * contributor status requires: signing to link the connected wallet.
 */
export function RoleGate({
  reason = 'Contributing to TrustNomiks, submitting data, staking, or challenging claims, requires a wallet you have proven ownership of.',
  title = 'Link a wallet to contribute',
  children,
  className,
}: RoleGateProps) {
  const router = useRouter()
  const { isContributor } = useRole()
  const { linkWallet, isLinking } = useWalletLink()

  if (isContributor) return <>{children}</>

  const handleLink = async () => {
    await linkWallet()
    router.refresh()
  }

  return (
    <WalletGate reason={reason} title={title} className={className}>
      <Button onClick={handleLink} disabled={isLinking}>
        <Wallet className="mr-1.5 h-4 w-4" aria-hidden />
        {isLinking ? 'Linking…' : 'Link wallet to contribute'}
      </Button>
    </WalletGate>
  )
}
