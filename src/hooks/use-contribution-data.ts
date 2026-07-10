'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export interface ContributionToken {
  id: string
  name: string
  ticker: string
  coingecko_image: string | null
  status: string
  completeness: number
  created_by: string
  created_at: string
}

export interface ContributionProfile {
  user_id: string
  display_name: string | null
  role: string | null
  organization: string | null
}

export interface UseContributionDataResult {
  tokens: ContributionToken[]
  currentUser: User | null
  profiles: Map<string, ContributionProfile>
  loading: boolean
  fetchFailed: boolean
  /** re-runs the fetch; wire to ErrorState's onRetry */
  refetch: () => Promise<void>
}

/**
 * The read shared by every contribution/gamification surface (Profile's
 * identity card + constellation, /progress's stats, tier ladder and
 * leaderboard): all tokens, the signed-in user, and all profiles (needed for
 * leaderboard display names). RLS may narrow the profiles read to the
 * caller's own row; callers degrade gracefully rather than failing.
 */
export function useContributionData(): UseContributionDataResult {
  const [tokens, setTokens] = useState<ContributionToken[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [profiles, setProfiles] = useState<Map<string, ContributionProfile>>(
    new Map(),
  )
  const [loading, setLoading] = useState(true)
  const [fetchFailed, setFetchFailed] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchFailed(false)
    try {
      const supabase = createClient()
      const [tokensResult, userResult, profilesResult] = await Promise.all([
        supabase
          .from('tokens')
          .select(
            'id, name, ticker, coingecko_image, status, completeness, created_by, created_at',
          )
          .order('created_at', { ascending: false }),
        supabase.auth.getUser(),
        // Leaderboard names; RLS may narrow this to the own row, we degrade gracefully.
        supabase
          .from('profiles')
          .select('user_id, display_name, role, organization'),
      ])
      if (tokensResult.error) throw tokensResult.error
      setTokens(tokensResult.data || [])
      setCurrentUser(userResult.data.user)

      const map = new Map<string, ContributionProfile>()
      for (const row of profilesResult.data ?? []) map.set(row.user_id, row)
      setProfiles(map)
    } catch (error) {
      console.error('Error fetching contribution data:', error)
      setFetchFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    tokens,
    currentUser,
    profiles,
    loading,
    fetchFailed,
    refetch: fetchData,
  }
}
