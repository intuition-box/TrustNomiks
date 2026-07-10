'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import {
  Activity,
  AlertCircle,
  Atom,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { WalletConnectButton } from '@/components/wallet-connect-button'
import { useVerifiedWallet } from '@/features/wallet-linking/use-verified-wallet'
import type {
  IntuitionAccountActivity,
  IntuitionPositionSummary,
} from '@/types/intuition'

interface AccountActivityCardProps {
  variant?: 'card' | 'embedded'
  limit?: number
  createdLimit?: number
}

export function AccountActivityCard({
  variant = 'card',
  limit = 10,
  createdLimit = 5,
}: AccountActivityCardProps) {
  const { address, isConnected } = useAccount()
  // Only the wallet the user has PROVEN ownership of (an active wallet_links
  // row) may surface its on-chain activity here: a merely-connected wallet can
  // belong to another identity and would leak that identity's data onto this
  // account's profile.
  const { isVerified } = useVerifiedWallet()
  const [data, setData] = useState<IntuitionAccountActivity | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchActivity = useCallback(async () => {
    if (!address) return

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        wallet: address,
        limit: String(limit),
        createdLimit: String(createdLimit),
      })
      const response = await fetch(
        `/api/intuition/account-activity?${params.toString()}`,
      )
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${response.status}`)
      }
      setData((await response.json()) as IntuitionAccountActivity)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load Intuition activity',
      )
    } finally {
      setLoading(false)
    }
  }, [address, createdLimit, limit])

  useEffect(() => {
    if (isConnected && address && isVerified) {
      fetchActivity()
    } else {
      setData(null)
      setError(null)
    }
  }, [address, fetchActivity, isConnected, isVerified])

  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <h3 className="font-semibold leading-none tracking-tight">
              Intuition Testnet Activity
            </h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Indexed on-chain positions and created terms for the connected
            wallet.
          </p>
        </div>
        {isConnected && address && isVerified && (
          <Button
            variant="outline"
            size="sm"
            onClick={fetchActivity}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        )}
      </div>

      {!isConnected || !address ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Connect your wallet to load Intuition testnet positions and created
            atoms/triples.
          </p>
          <WalletConnectButton />
        </div>
      ) : !isVerified ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            This wallet is not linked to your account. Link it from your profile
            to see its Intuition activity here.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && !data && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading Intuition activity...
            </div>
          )}

          {data && (
            <>
              <ActivityStats data={data} />
              <RecentPositions positions={data.positions} />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span>Updated {new Date(data.fetchedAt).toLocaleString()}</span>
                <a
                  href="https://testnet.hub.intuition.systems/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  Open Intuition Hub
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )

  if (variant === 'embedded') {
    return <div className="rounded-lg border p-4">{content}</div>
  }

  return (
    <Card>
      <CardContent className="p-6">{content}</CardContent>
    </Card>
  )
}

function ActivityStats({ data }: { data: IntuitionAccountActivity }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <ActivityStat
        icon={Wallet}
        label="Positions"
        value={data.aggregates.activePositions}
      />
      <ActivityStat
        icon={Atom}
        label="Atoms created"
        value={data.aggregates.atomsCreated}
      />
      <ActivityStat
        icon={GitBranch}
        label="Triples created"
        value={data.aggregates.triplesCreated}
      />
      <ActivityStat
        icon={Activity}
        label="Shares"
        value={formatCompactTokenAmount(data.aggregates.activePositionShares)}
      />
    </div>
  )
}

function ActivityStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity
  label: string
  value: number | string
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs uppercase text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  )
}

function RecentPositions({
  positions,
}: {
  positions: IntuitionPositionSummary[]
}) {
  if (positions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No active Intuition testnet positions found for this wallet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        Recent positions
      </p>
      <div className="space-y-2">
        {positions.slice(0, 5).map((position) => {
          const triple = position.triple
          const atom = position.atom
          const label = triple
            ? `${triple.subject?.label ?? 'Unknown'} / ${triple.predicate?.label ?? 'claim'} / ${triple.object?.label ?? 'Unknown'}`
            : (atom?.label ?? position.termId)

          return (
            <div
              key={position.id}
              className="flex items-start justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{label}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {position.termId.slice(0, 10)}...{position.termId.slice(-8)}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {formatCompactTokenAmount(position.shares)} shares
              </Badge>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatCompactTokenAmount(value: string | null): string {
  if (!value) return '0'
  try {
    const whole = BigInt(value) / BigInt('1000000000000000000')
    if (whole > BigInt(0)) return whole.toLocaleString()
    return '<1'
  } catch {
    return value
  }
}
