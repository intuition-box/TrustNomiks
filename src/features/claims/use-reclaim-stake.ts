'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Hex } from 'viem'
import { useWalletClient, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import {
  readContestationShares,
  executeWithdrawContestation,
} from '@/lib/intuition/challenge-executor'
import { extractErrorMessage } from '@/features/claims/error-message'
import type { Challenge } from '@/types/challenges'

/**
 * Surfaces and reclaims an "orphan" dispute stake (milestone J5): the tTRUST a
 * challenger staked into a claim's counter-triple stays locked there after the
 * dispute is resolved or the claim is superseded on-chain. This hook reads the
 * connected wallet's live share balance on the challenge's `counter_term_id`
 * vault and, when non-zero, offers to redeem it — reusing the same
 * `executeWithdrawContestation` redeem path as an active withdrawal.
 *
 * Reads only run for a challenge that actually staked on-chain (a non-null
 * counter_term_id / curve_id) and while a wallet is connected.
 */
export function useReclaimStake(challenge: Challenge | null | undefined) {
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const [shares, setShares] = useState<bigint | null>(null)
  const [isReclaiming, setIsReclaiming] = useState(false)

  const counterTermId = (challenge?.counter_term_id ?? null) as Hex | null
  const curveId = challenge?.curve_id ?? null

  useEffect(() => {
    let cancelled = false
    async function check() {
      if (!walletClient || !publicClient || !counterTermId || curveId == null) {
        setShares(null)
        return
      }
      try {
        const s = await readContestationShares(
          walletClient,
          publicClient,
          counterTermId,
          BigInt(curveId),
        )
        if (!cancelled) setShares(s)
      } catch {
        // Read failure (RPC hiccup, term not on-chain) — treat as "nothing to
        // reclaim" rather than surfacing an error on a passive lookup.
        if (!cancelled) setShares(null)
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [walletClient, publicClient, counterTermId, curveId])

  const reclaim = useCallback(async (): Promise<boolean> => {
    if (!walletClient || !publicClient || !counterTermId || curveId == null) {
      toast.error('Connect your wallet to reclaim this stake.')
      return false
    }
    setIsReclaiming(true)
    try {
      await executeWithdrawContestation(walletClient, publicClient, {
        counterTermId,
        curveId: BigInt(curveId),
      })
      setShares(BigInt(0))
      toast.success('Stake reclaimed')
      return true
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to reclaim your stake'))
      return false
    } finally {
      setIsReclaiming(false)
    }
  }, [walletClient, publicClient, counterTermId, curveId])

  const hasReclaimableStake = shares != null && shares > BigInt(0)
  return { hasReclaimableStake, shares, reclaim, isReclaiming }
}
