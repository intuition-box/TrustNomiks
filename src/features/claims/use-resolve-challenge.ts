'use client'

import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Json } from './challenge-value'
import { extractErrorMessage } from './error-message'

/**
 * Owner/moderator resolution of an open challenge (milestone J2a).
 * `resolve` never writes the token metric itself — `resolve_challenge_tx`
 * only returns `next_action` (a `{ kind: 'studio_correction', ... }` object)
 * on accept, so the UI can deep-link into the studio to apply the correction
 * via the save_*_tx path (see supabase/migrations/20260709_add_challenges_rpcs.sql).
 * `next_action` is typed here as `Json | null` per the agreed contract, even
 * though at runtime an accept returns a structured object rather than a
 * scalar — callers that need its fields (claim_type/claim_id/field_key/
 * proposed_value/...) should narrow it themselves, or read those same
 * values off the already-fetched Challenge row instead.
 */
export function useResolveChallenge(tokenId: string) {
  const queryClient = useQueryClient()
  const [isPending, setIsPending] = useState(false)

  const invalidate = useCallback(
    async (challengeId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['challenges', 'token', tokenId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['challenges', 'events', challengeId],
        }),
      ])
    },
    [queryClient, tokenId],
  )

  const resolve = useCallback(
    async (
      challengeId: string,
      decision: 'accept' | 'reject',
      reason: string,
    ): Promise<Json | null> => {
      setIsPending(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase.rpc('resolve_challenge_tx', {
          p_challenge_id: challengeId,
          p_decision: decision,
          p_reason: reason,
        })

        if (error) {
          toast.error(extractErrorMessage(error, 'Failed to resolve challenge'))
          return null
        }

        await invalidate(challengeId)
        toast.success(
          decision === 'accept' ? 'Challenge accepted' : 'Challenge rejected',
        )
        return (data as { next_action?: Json } | null)?.next_action ?? null
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Failed to resolve challenge'))
        return null
      } finally {
        setIsPending(false)
      }
    },
    [invalidate],
  )

  const withdraw = useCallback(
    async (challengeId: string): Promise<boolean> => {
      setIsPending(true)
      try {
        const supabase = createClient()
        const { error } = await supabase.rpc('withdraw_challenge_tx', {
          p_challenge_id: challengeId,
        })

        if (error) {
          toast.error(
            extractErrorMessage(error, 'Failed to withdraw challenge'),
          )
          return false
        }

        await invalidate(challengeId)
        toast.success('Challenge withdrawn')
        return true
      } catch (err) {
        toast.error(extractErrorMessage(err, 'Failed to withdraw challenge'))
        return false
      } finally {
        setIsPending(false)
      }
    },
    [invalidate],
  )

  return { resolve, withdraw, isPending }
}
