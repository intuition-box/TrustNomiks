'use client'

import { useState } from 'react'
import { Clock, Coins, Gavel, Info, Scale, Users } from 'lucide-react'
import { formatEther } from 'viem'
import { useAccount, useBalance } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConsensusBar } from '@/components/patterns/consensus-bar'
import { StakeSlider } from '@/components/patterns/stake-slider'
import { WalletGate } from '@/components/composite/wallet-gate'
import { formatDate } from '@/components/token-detail/detail-helpers'
import {
  useChallengeStake,
  type ThresholdVerdict,
} from '@/features/claims/use-challenge-stake'
import { INTUITION_CHAIN_ID } from '@/lib/intuition/config'
import { cn } from '@/lib/utils'
import type { Challenge } from '@/types/challenges'

interface ResolveBoxStakeProps {
  challenge: Challenge
  fieldLabel: string
}

/** Tokened tones for the verdict banner: color is never alone (§2), each tone pairs with a glyph below. */
const VERDICT_TONE_CLASS: Record<'warning' | 'info' | 'muted', string> = {
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info',
  muted: 'border-dashed bg-surface-2 text-muted-foreground',
}

/**
 * Auto-threshold verdict banner: maps the evaluate-threshold state machine's
 * status to a tone + glyph + plain-language line, per DESIGN-RULES (tokens
 * only, glyph pairs with color, no em-dash). `not_published`/`not_a_dispute`
 * render nothing extra since the band's own published/dispute gating already
 * covers those cases; this is a defensive no-op.
 */
function ThresholdVerdictBanner({ verdict }: { verdict: ThresholdVerdict }) {
  if (
    verdict.status === 'not_published' ||
    verdict.status === 'not_a_dispute'
  ) {
    return null
  }

  let tone: keyof typeof VERDICT_TONE_CLASS
  let Icon: typeof Info
  let content: React.ReactNode

  switch (verdict.status) {
    case 'veto_started':
    case 'in_veto_window':
      tone = 'warning'
      Icon = Gavel
      content = (
        <div className="space-y-0.5">
          <p>
            Community stake threshold met. A moderator can still resolve this
            before it auto-adopts.
          </p>
          {verdict.vetoUntil && (
            <p className="tabular text-xs opacity-90">
              Veto window closes {formatDate(verdict.vetoUntil)}.
            </p>
          )}
        </div>
      )
      break
    case 'auto_adopted':
      tone = 'info'
      Icon = Users
      content = <p>Community-adopted after the veto window.</p>
      break
    case 'waiting_owner_window':
      tone = 'muted'
      Icon = Clock
      content = (
        <div className="space-y-0.5">
          <p>Waiting for the owner-response window.</p>
          {verdict.eligibleFrom && (
            <p className="tabular text-xs opacity-90">
              Eligible from {formatDate(verdict.eligibleFrom)}.
            </p>
          )}
        </div>
      )
      break
    case 'below_threshold':
    case 'veto_cleared':
    default:
      tone = 'muted'
      Icon = Info
      content = (
        <div className="space-y-0.5">
          <p>Community stake is below the auto-adopt threshold.</p>
          <p className="tabular text-xs opacity-90">
            {verdict.distinctAccounts} distinct account
            {verdict.distinctAccounts === 1 ? '' : 's'},{' '}
            {formatEther(BigInt(verdict.totalStakeWei))} tTRUST staked
          </p>
        </div>
      )
      break
  }

  return (
    <div
      aria-live="polite"
      className={cn(
        'flex items-start gap-2 rounded-lg border p-3 text-sm',
        VERDICT_TONE_CLASS[tone],
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {content}
    </div>
  )
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
  const {
    consensus,
    isLoading,
    stakeAgainst,
    withdraw,
    isPending,
    evaluateThreshold,
    isEvaluating,
  } = useChallengeStake(challenge.id)
  const { address } = useAccount()
  const { data: balance } = useBalance({
    address,
    chainId: INTUITION_CHAIN_ID,
  })
  const [valueWei, setValueWei] = useState(BigInt(0))
  const [verdict, setVerdict] = useState<ThresholdVerdict | null>(null)

  if (challenge.challenge_type !== 'dispute' || challenge.status !== 'open') {
    return null
  }

  const handleStake = async () => {
    const ok = await stakeAgainst(valueWei)
    if (ok) setValueWei(BigInt(0))
  }

  const handleEvaluateThreshold = async () => {
    const result = await evaluateThreshold()
    if (result) setVerdict(result)
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

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isEvaluating}
              onClick={handleEvaluateThreshold}
            >
              <Scale className="mr-2 h-4 w-4" aria-hidden />
              {isEvaluating ? 'Checking…' : 'Check community threshold'}
            </Button>

            {verdict && <ThresholdVerdictBanner verdict={verdict} />}
          </div>
        </div>
      )}
    </div>
  )
}
