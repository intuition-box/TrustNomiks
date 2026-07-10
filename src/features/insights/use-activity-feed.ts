'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  FEED_EVENT_TYPES,
  type ActivityEvent,
} from '@/lib/insights/build-insights'

export const ACTIVITY_FEED_QUERY_KEY = ['activity-feed'] as const

async function fetchActivityEvents(): Promise<ActivityEvent[]> {
  const { data, error } = await createClient()
    .from('challenge_events')
    .select('id, event_type, token_id, created_at')
    .in('event_type', FEED_EVENT_TYPES)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data ?? []
}

/**
 * The graph's lifecycle ledger (whitelisted challenge events, newest first).
 * Token names are joined in memory by the consumer from useRegistryTokens,
 * so this stays a single narrow read.
 */
export function useActivityFeed() {
  return useQuery({
    queryKey: ACTIVITY_FEED_QUERY_KEY,
    queryFn: fetchActivityEvents,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}
