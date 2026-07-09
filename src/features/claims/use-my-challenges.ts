'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Challenge } from '@/types/challenges'

export interface ChallengeTokenInfo {
  id: string
  name: string
  ticker: string
}

export interface ChallengeWithToken extends Challenge {
  token: ChallengeTokenInfo | null
}

async function fetchTokensByIds(
  ids: string[],
): Promise<Map<string, ChallengeTokenInfo>> {
  if (ids.length === 0) return new Map()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('tokens')
    .select('id, name, ticker')
    .in('id', ids)
  if (error) throw error
  return new Map((data ?? []).map((t) => [t.id, t as ChallengeTokenInfo]))
}

function withTokens(
  challenges: Challenge[],
  tokenMap: Map<string, ChallengeTokenInfo>,
): ChallengeWithToken[] {
  return challenges.map((c) => ({
    ...c,
    token: tokenMap.get(c.token_id) ?? null,
  }))
}

/**
 * Challenges opened against any token the current user owns (any status),
 * newest first, joined in-memory with the owning token's name/ticker since
 * `challenges` and `tokens` are fetched as two plain queries (no PostgREST
 * embedding relied on here).
 */
async function fetchChallengesOnMyTokens(): Promise<ChallengeWithToken[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data: myTokens, error: tokensError } = await supabase
    .from('tokens')
    .select('id, name, ticker')
    .eq('created_by', user.id)
  if (tokensError) throw tokensError

  const tokenIds = (myTokens ?? []).map((t) => t.id)
  if (tokenIds.length === 0) return []

  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .in('token_id', tokenIds)
    .order('created_at', { ascending: false })
  if (error) throw error

  const tokenMap = new Map(
    (myTokens ?? []).map((t) => [t.id, t as ChallengeTokenInfo]),
  )
  return withTokens((data ?? []) as Challenge[], tokenMap)
}

export function useChallengesOnMyTokens() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['challenges', 'on-my-tokens'],
    queryFn: fetchChallengesOnMyTokens,
  })

  const openCount = data.filter((c) => c.status === 'open').length

  return { data, isLoading, openCount }
}

/** Challenges the current user opened themselves (on any token), newest first. */
async function fetchMyChallenges(): Promise<ChallengeWithToken[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error

  const challenges = (data ?? []) as Challenge[]
  const tokenIds = Array.from(new Set(challenges.map((c) => c.token_id)))
  const tokenMap = await fetchTokensByIds(tokenIds)
  return withTokens(challenges, tokenMap)
}

export function useMyChallenges() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['challenges', 'mine'],
    queryFn: fetchMyChallenges,
  })

  return { data, isLoading }
}

/** Count of OPEN challenges per token, for the /tokens registry column. */
async function fetchOpenChallengeCountByToken(): Promise<Map<string, number>> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('challenges')
    .select('token_id')
    .eq('status', 'open')
  if (error) throw error

  const map = new Map<string, number>()
  for (const row of data ?? []) {
    map.set(row.token_id, (map.get(row.token_id) ?? 0) + 1)
  }
  return map
}

export function useOpenChallengeCountByToken() {
  const { data, isLoading } = useQuery({
    queryKey: ['challenges', 'open-count-by-token'],
    queryFn: fetchOpenChallengeCountByToken,
  })

  return { data: data ?? new Map<string, number>(), isLoading }
}
