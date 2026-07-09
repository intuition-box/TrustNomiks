'use client'

import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { ChallengeType } from '@/types/challenges'
import type { Json } from './challenge-value'
import { extractErrorMessage } from './error-message'

export interface OpenChallengeInput {
  tokenId: string
  claimType: string
  claimId: string | null
  fieldKey: string
  challengeType: ChallengeType
  reason: string
  proposedValue: Json | null
  snapshotValue: Json
  evidenceUrl?: string | null
  evidenceNote?: string | null
  evidenceSourceId?: string | null
  challengerWalletAddress: string
}

interface OpenChallengeResult {
  id: string
}

/** Opens a challenge against a claim field via `open_challenge_tx` (milestone J2a). */
export function useOpenChallenge(tokenId: string) {
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)

  const open = useCallback(
    async (input: OpenChallengeInput): Promise<OpenChallengeResult | null> => {
      setIsPending(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase.rpc('open_challenge_tx', {
          p_token_id: input.tokenId,
          p_claim_type: input.claimType,
          p_claim_id: input.claimId,
          p_field_key: input.fieldKey,
          p_challenge_type: input.challengeType,
          p_reason: input.reason,
          p_proposed_value: input.proposedValue,
          p_snapshot_value: input.snapshotValue,
          p_evidence_url: input.evidenceUrl ?? null,
          p_evidence_note: input.evidenceNote ?? null,
          p_evidence_source_id: input.evidenceSourceId ?? null,
          p_challenger_wallet_address: input.challengerWalletAddress,
        })

        if (error) {
          toast.error(extractErrorMessage(error, 'Failed to open challenge'))
          return null
        }

        await queryClient.invalidateQueries({
          queryKey: ['challenges', 'token', tokenId],
        })
        toast.success('Challenge opened')
        return { id: (data as OpenChallengeResult).id }
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Failed to open challenge'))
        return null
      } finally {
        setIsPending(false)
      }
    },
    [queryClient, tokenId],
  )

  return { open, isPending }
}
