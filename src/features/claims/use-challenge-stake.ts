'use client'

import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWalletClient, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import type { Hex } from 'viem'
import { createClient } from '@/lib/supabase/client'
import {
  executeContestationDeposit,
  executeWithdrawContestation,
} from '@/lib/intuition/challenge-executor'
import type { ConsensusSnapshot } from '@/lib/intuition/consensus'
import { extractErrorMessage } from '@/features/claims/error-message'

async function fetchConsensus(challengeId: string): Promise<ConsensusSnapshot> {
  const res = await fetch(`/api/challenges/${challengeId}/consensus`)
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Rate limited, try again in a moment.')
    }
    const body = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `Failed to load on-chain consensus (HTTP ${res.status})`,
    )
  }
  return (await res.json()) as ConsensusSnapshot
}

/**
 * On-chain stake band (Resolve Box band ③) for one challenge: the read side
 * (consensus snapshot) plus the two write actions (stake against / withdraw)
 * against the claim triple's counter-triple. Persists each write via
 * `record_challenge_onchain_tx` so the challenge row carries its on-chain
 * references, then invalidates the consensus query (and, best-effort, any
 * token-scoped challenge list) so the UI reflects the new balance.
 */
export function useChallengeStake(challengeId: string | null) {
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)

  const { data: consensus, isLoading } = useQuery({
    queryKey: ['challenges', 'consensus', challengeId],
    queryFn: () => fetchConsensus(challengeId as string),
    enabled: !!challengeId,
    staleTime: 30_000,
  })

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['challenges', 'consensus', challengeId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['challenges', 'token'],
      }),
    ])
  }, [queryClient, challengeId])

  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const stakeAgainst = useCallback(
    async (amountWei: bigint): Promise<boolean> => {
      if (!challengeId) return false

      if (
        !consensus?.published ||
        !consensus.tripleTermId ||
        !consensus.counterTermId ||
        !consensus.curveId
      ) {
        toast.error('This claim is not published on-chain yet')
        return false
      }

      if (!walletClient || !publicClient) {
        toast.error('Connect your wallet to stake on this dispute.')
        return false
      }

      setIsPending(true)
      try {
        const result = await executeContestationDeposit(
          walletClient,
          publicClient,
          {
            tripleTermId: consensus.tripleTermId as Hex,
            counterTermId: consensus.counterTermId as Hex,
            curveId: BigInt(consensus.curveId),
            amountWei,
          },
        )

        const supabase = createClient()
        const { error } = await supabase.rpc('record_challenge_onchain_tx', {
          p_challenge_id: challengeId,
          p_tx_hash: result.txHash,
          p_target_triple_term_id: consensus.tripleTermId,
          p_counter_term_id: consensus.counterTermId,
          p_curve_id: Number(consensus.curveId),
          p_stake_wei: amountWei.toString(),
          p_action: 'contest',
        })
        if (error) {
          toast.error(extractErrorMessage(error, 'Failed to record the stake'))
          return false
        }

        await invalidate()
        toast.success('Stake recorded against this claim')
        return true
      } catch (err) {
        toast.error(
          extractErrorMessage(err, 'Failed to stake against this claim'),
        )
        return false
      } finally {
        setIsPending(false)
      }
    },
    [challengeId, consensus, walletClient, publicClient, invalidate],
  )

  const withdraw = useCallback(async (): Promise<boolean> => {
    if (!challengeId) return false

    if (
      !consensus?.published ||
      !consensus.counterTermId ||
      !consensus.curveId
    ) {
      toast.error('This claim is not published on-chain yet')
      return false
    }

    if (!walletClient || !publicClient) {
      toast.error('Connect your wallet to withdraw your position.')
      return false
    }

    setIsPending(true)
    try {
      const result = await executeWithdrawContestation(
        walletClient,
        publicClient,
        {
          counterTermId: consensus.counterTermId as Hex,
          curveId: BigInt(consensus.curveId),
        },
      )

      const supabase = createClient()
      const { error } = await supabase.rpc('record_challenge_onchain_tx', {
        p_challenge_id: challengeId,
        p_tx_hash: result.txHash,
        p_target_triple_term_id: consensus.tripleTermId,
        p_counter_term_id: consensus.counterTermId,
        p_curve_id: Number(consensus.curveId),
        p_stake_wei: '0',
        p_action: 'withdraw',
      })
      if (error) {
        toast.error(
          extractErrorMessage(error, 'Failed to record the withdrawal'),
        )
        return false
      }

      await invalidate()
      toast.success('Position withdrawn')
      return true
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to withdraw your position'))
      return false
    } finally {
      setIsPending(false)
    }
  }, [challengeId, consensus, walletClient, publicClient, invalidate])

  return { consensus, isLoading, stakeAgainst, withdraw, isPending }
}
