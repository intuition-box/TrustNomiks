'use client'

import { Wallet } from 'lucide-react'
import { useAccount } from 'wagmi'
import { WalletConnectButton } from '@/components/wallet-connect-button'
import { walletEnabled } from '@/config/wagmi'
import { cn } from '@/lib/utils'

interface WalletGateProps {
  /** the "why now" copy: what connecting unlocks, right here */
  reason: React.ReactNode
  title?: string
  /** rendered once a wallet is connected */
  children: React.ReactNode
  className?: string
}

/**
 * The one connect-at-the-boundary block (docs/redesign/08 §1). Wallet is asked
 * for only where an on-chain action starts, with the reason stated inline.
 * Everywhere else the app stays wallet-silent.
 */
export function WalletGate({
  reason,
  title = 'Connect to continue',
  children,
  className,
}: WalletGateProps) {
  const { isConnected } = useAccount()

  if (!walletEnabled) {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed bg-surface-1 p-4 text-sm text-muted-foreground',
          className,
        )}
      >
        On-chain features are disabled in this environment.
      </div>
    )
  }

  if (isConnected) return <>{children}</>

  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border bg-surface-1 p-4',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[hsl(var(--data-wallet))]/15 text-[hsl(var(--data-wallet))]">
          <Wallet className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="text-sm text-muted-foreground">{reason}</p>
      <WalletConnectButton />
    </div>
  )
}
