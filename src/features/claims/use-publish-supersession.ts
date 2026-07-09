'use client'

import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWalletClient, usePublicClient } from 'wagmi'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { resolveChallengeTripleFull } from '@/lib/intuition/claim-triple'
import { executeOpenUpdate } from '@/lib/intuition/challenge-executor'
import { extractErrorMessage } from '@/features/claims/error-message'
import type { Challenge } from '@/types/challenges'

/**
 * Publishes the on-chain leg of an ACCEPTED update challenge (milestone J5):
 * mints the corrected value as a new claim triple and links the disputed
 * (old) claim to it via `superseded_by`, then persists the resulting term
 * ids + tx hashes back onto the challenge row via
 * `POST /api/challenges/[id]/record-supersession` (server resolves +
 * recomputes the term ids). Idempotent — once `new_claim_term_id` is set on
 * the challenge, `publish` is a no-op.
 */
export function usePublishSupersession(tokenId: string) {
  const queryClient = useQueryClient()
  const [isPublishing, setIsPublishing] = useState(false)
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  const publish = useCallback(
    async (challenge: Challenge): Promise<boolean> => {
      if (
        challenge.status !== 'accepted' ||
        challenge.challenge_type !== 'update' ||
        challenge.proposed_value == null
      ) {
        toast.error('Only an accepted update challenge can be published.')
        return false
      }

      if (challenge.new_claim_term_id) {
        toast.error('Already published on-chain')
        return false
      }

      if (!walletClient || !publicClient) {
        toast.error('Connect your wallet to publish this correction.')
        return false
      }

      setIsPublishing(true)
      try {
        const supabase = createClient()
        const resolved = await resolveChallengeTripleFull(supabase, {
          tokenId: challenge.token_id,
          claimType: challenge.claim_type,
          claimId: challenge.claim_id,
          fieldKey: challenge.field_key,
        })

        if (!resolved) {
          toast.error(
            'This claim is not published on-chain yet, so it cannot be superseded.',
          )
          return false
        }

        const newValue = String(challenge.proposed_value)

        const result = await executeOpenUpdate(walletClient, publicClient, {
          subjectTermId: resolved.subjectTermId,
          predicateTermId: resolved.predicateTermId,
          oldTripleTermId: resolved.tripleTermId,
          newValue,
        })

        const res = await fetch(
          `/api/challenges/${challenge.id}/record-supersession`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txHashes: result.txHashes }),
          },
        )

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          toast.error(body.error ?? 'Failed to record the supersession')
          return false
        }

        await queryClient.invalidateQueries({
          queryKey: ['challenges', 'token', tokenId],
        })
        toast.success('Update published on-chain')
        return true
      } catch (err) {
        toast.error(
          extractErrorMessage(err, 'Failed to publish the update on-chain'),
        )
        return false
      } finally {
        setIsPublishing(false)
      }
    },
    [walletClient, publicClient, queryClient, tokenId],
  )

  return { publish, isPublishing }
}
