'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  computeCompletenessDelta,
  type StatSnapshot,
} from '@/lib/insights/build-insights'

/**
 * 7-day completeness movement for one token, from the append-only
 * token_stat_history ledger (written by the tokens trigger, never clients).
 */
export function useTokenCompletenessDelta(tokenId: string | null) {
  return useQuery({
    queryKey: ['token-delta', tokenId],
    enabled: Boolean(tokenId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await createClient()
        .from('token_stat_history')
        .select('completeness, recorded_at')
        .eq('token_id', tokenId!)
        .order('recorded_at', { ascending: true })
        .limit(200)
      if (error) throw error
      const snapshots = (data ?? []) as StatSnapshot[]
      return computeCompletenessDelta(
        snapshots,
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      )
    },
  })
}
