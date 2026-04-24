'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { walletEnabled } from '@/config/wagmi'

export function WalletConnectButton() {
  if (!walletEnabled) return null

  return (
    <ConnectButton
      chainStatus="icon"
      accountStatus="avatar"
      showBalance={false}
    />
  )
}
