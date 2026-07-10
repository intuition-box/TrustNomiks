'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Token } from '@/types/token'

export const REGISTRY_TOKENS_QUERY_KEY = ['registry-tokens'] as const

async function fetchRegistryTokens(): Promise<Token[]> {
  const { data, error } = await createClient()
    .from('tokens')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * The ONE registry read every Pulse surface shares (dashboard KPIs, insight
 * rail, activity feed's name join). TanStack cache means N consumers on a
 * screen cost a single fetch; freshness comes from staleTime + focus refetch,
 * no polling.
 */
export function useRegistryTokens() {
  return useQuery({
    queryKey: REGISTRY_TOKENS_QUERY_KEY,
    queryFn: fetchRegistryTokens,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })
}
