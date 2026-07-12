'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { FactoryProject } from '@/types/factory'

export const FACTORY_PROJECTS_QUERY_KEY = ['factory-projects'] as const

async function fetchFactoryProjects(): Promise<FactoryProject[]> {
  const { data, error } = await createClient()
    .from('factory_projects')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * The hub's list of designs. RLS scopes rows to the signed-in creator
 * (owner-only SELECT policy), so no client-side filter is needed.
 */
export function useFactoryProjects() {
  return useQuery({
    queryKey: FACTORY_PROJECTS_QUERY_KEY,
    queryFn: fetchFactoryProjects,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}
