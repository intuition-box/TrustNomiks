'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Challenge, ChallengeEvent } from '@/types/challenges'

async function fetchTokenChallenges(tokenId: string): Promise<Challenge[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('token_id', tokenId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Challenge[]
}

async function fetchChallengeEvents(
  challengeId: string,
): Promise<ChallengeEvent[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('challenge_events')
    .select('*')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as ChallengeEvent[]
}

/**
 * All challenges for one token (any status, newest first), plus lookups
 * scoped to a single claim field. `claimId` uses plain `===` equality —
 * null-safe since both sides are `string | null`, matching the (null for
 * 1:1 claim types) convention in src/lib/claims/field-registry.ts.
 */
export function useTokenChallenges(tokenId: string) {
  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ['challenges', 'token', tokenId],
    queryFn: () => fetchTokenChallenges(tokenId),
    enabled: Boolean(tokenId),
  })

  const forField = useCallback(
    (
      claimType: string,
      claimId: string | null,
      fieldKey: string,
    ): Challenge[] =>
      challenges.filter(
        (c) =>
          c.claim_type === claimType &&
          c.claim_id === claimId &&
          c.field_key === fieldKey,
      ),
    [challenges],
  )

  const openFor = useCallback(
    (
      claimType: string,
      claimId: string | null,
      fieldKey: string,
    ): Challenge | undefined =>
      forField(claimType, claimId, fieldKey).find((c) => c.status === 'open'),
    [forField],
  )

  return { challenges, isLoading, forField, openFor }
}

/** Audit trail for one challenge, oldest first. Disabled while challengeId is null. */
export function useChallengeEvents(challengeId: string | null) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['challenges', 'events', challengeId],
    queryFn: () => fetchChallengeEvents(challengeId as string),
    enabled: challengeId !== null,
  })

  return { events, isLoading }
}
