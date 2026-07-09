'use client'

import { useState } from 'react'
import { Coins, Info } from 'lucide-react'
import { useAccount, useBalance } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConsensusBar } from '@/components/patterns/consensus-bar'
import { StakeSlider } from '@/components/patterns/stake-slider'
import { WalletGate } from '@/components/composite/wallet-gate'
import { useChallengeStake } from '@/features/claims/use-challenge-stake'
import { INTUITION_CHAIN_ID } from '@/lib/intuition/config'
import type { Challenge } from '@/types/challenges'

interface ResolveBoxStakeProps {
  challenge: Challenge
  fieldLabel: string
}

/**
 * Band ③ of the Resolve Box: on-chain stake for an OPEN dispute. Reads the
 * consensus snapshot (for/against tTRUST behind the claim triple vs. its
 * counter-triple) and lets a connected wallet add to or withdraw from the
 * dispute side. Defensively no-ops for anything but an open dispute — the
 * caller already gates rendering on that, this is a belt-and-braces guard.
 */
export function ResolveBoxStake({
  challenge,
  fieldLabel,
}: ResolveBoxStakeProps) {
  const { consensus, isLoading, stakeAgainst, withdraw, isPending } =
    useChallengeStake(challenge.id)
  const { address } = useAccount()
  const { data: balance } = useBalance({
    address,
    chainId: INTUITION_CHAIN_ID,
  })
  const [valueWei, setValueWei] = useState(BigInt(0))

  if (challenge.challenge_type !== 'dispute' || challenge.status !== 'open') {
    return null
  }

  const handleStake = async () => {
    const ok = await stakeAgainst(valueWei)
    if (ok) setValueWei(BigInt(0))
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="h-4 w-4 text-muted-foreground" aria-hidden />
          On-chain positions
        </h3>
        <p className="text-xs text-muted-foreground">
          Stake tTRUST for or against the disputed value of {fieldLabel}.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-2" aria-live="polite">
          <Skeleton className="h-6 w-full" />
          <p className="text-xs text-muted-foreground">Loading positions…</p>
        </div>
      )}

      {!isLoading && consensus && !consensus.published && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed bg-surface-2 p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            This claim isn&apos;t published on-chain yet, so it can&apos;t be
            staked. Publish the token to enable staking.
          </p>
        </div>
      )}

      {!isLoading && consensus?.published && (
        <div className="space-y-4">
          <ConsensusBar
            forAssetsWei={consensus.for?.totalAssetsWei ?? '0'}
            againstAssetsWei={consensus.against?.totalAssetsWei ?? '0'}
          />

          <WalletGate reason="Connect your wallet to stake tTRUST on this dispute.">
            <div className="space-y-3">
              <StakeSlider
                valueWei={valueWei}
                onChange={setValueWei}
                maxWei={balance?.value ?? BigInt(0)}
                disabled={isPending}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending || valueWei === BigInt(0)}
                  onClick={handleStake}
                >
                  {isPending ? 'Staking…' : 'Stake against this claim'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => withdraw()}
                >
                  {isPending ? 'Withdrawing…' : 'Withdraw my position'}
                </Button>
              </div>
            </div>
          </WalletGate>
        </div>
      )}
    </div>
  )
}
