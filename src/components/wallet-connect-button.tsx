'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { formatEther } from 'viem'
import { useBalance } from 'wagmi'
import { ChevronDown, Wallet } from 'lucide-react'
import { walletEnabled } from '@/config/wagmi'
import { INTUITION_CHAIN_ID } from '@/lib/intuition/config'
import type { TrustNomiksStakeSummary } from '@/types/intuition'

export function WalletConnectButton() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

  if (!walletEnabled || !mounted) return null

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted: rainbowMounted,
      }) => {
        const ready = rainbowMounted && mounted
        const connected = ready && account && chain

        if (!ready) {
          return (
            <div
              aria-hidden="true"
              className="h-10 w-36 rounded-md border bg-muted opacity-0"
            />
          )
        }

        if (!connected) {
          return (
            <button
              type="button"
              onClick={openConnectModal}
              className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent"
            >
              <Wallet className="h-4 w-4" />
              Connect wallet
            </button>
          )
        }

        if (chain.unsupported) {
          return (
            <button
              type="button"
              onClick={openChainModal}
              className="inline-flex h-10 items-center rounded-md border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              Wrong network
            </button>
          )
        }

        return (
          <ConnectedWalletSummary
            address={account.address as `0x${string}`}
            displayName={account.displayName}
            openAccountModal={openAccountModal}
          />
        )
      }}
    </ConnectButton.Custom>
  )
}

function ConnectedWalletSummary({
  address,
  displayName,
  openAccountModal,
}: {
  address: `0x${string}`
  displayName: string
  openAccountModal: () => void
}) {
  const { data: balance, isLoading: balanceLoading } = useBalance({
    address,
    chainId: INTUITION_CHAIN_ID,
    query: {
      refetchInterval: 30_000,
    },
  })

  const { data: stake, isLoading: stakeLoading } = useQuery({
    queryKey: ['intuition', 'trustnomiks-stake', address],
    queryFn: async () => {
      const res = await fetch(`/api/intuition/trustnomiks-stake?wallet=${address}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      return (await res.json()) as TrustNomiksStakeSummary
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return (
    <button
      type="button"
      onClick={openAccountModal}
      className="inline-flex min-h-10 max-w-full items-center gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-accent"
    >
      <div className="hidden min-w-0 flex-col leading-tight sm:flex">
        <span className="truncate font-medium">{displayName}</span>
        <span className="text-xs text-muted-foreground">
          {balanceLoading ? 'TRUST ...' : `${formatTrust(balance?.value ?? BigInt(0))} TRUST`}
          <span className="mx-1">/</span>
          {stakeLoading ? 'staked ...' : `${formatTrust(BigInt(stake?.stakedTrustWei ?? '0'))} staked`}
        </span>
      </div>
      <div className="flex min-w-0 flex-col leading-tight sm:hidden">
        <span className="truncate font-medium">{displayName}</span>
        <span className="text-xs text-muted-foreground">
          {formatTrust(balance?.value ?? BigInt(0))} / {formatTrust(BigInt(stake?.stakedTrustWei ?? '0'))}
        </span>
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function formatTrust(valueWei: bigint): string {
  const value = Number(formatEther(valueWei))
  if (!Number.isFinite(value) || value === 0) return '0'
  if (value < 0.001) return '<0.001'
  if (value < 1) return value.toFixed(3)
  if (value < 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return compactNumber(value)
}

function compactNumber(value: number): string {
  return Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value)
}
