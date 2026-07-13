'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FactorySimulationSnapshot } from '@/types/factory'
import { useFactoryForm } from './factory-form-context'

/**
 * The design's scenario library. Reads, renames and deletes go straight
 * through the owner-only RLS policies (the benchmark-panel precedent):
 * they are pure owner CRUD with no server computation. Inserts are the
 * simulate route's job, surfaced here via addLocal with the returned row.
 */
export function useSimulationSnapshots(projectId: string | null) {
  const { supabase } = useFactoryForm()
  const [snapshots, setSnapshots] = useState<FactorySimulationSnapshot[]>([])
  // Loading is derived (no synchronous setState in the effect): the
  // library is loading until the fetch for THIS project has landed.
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const loading = projectId !== null && loadedFor !== projectId

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    supabase
      .from('factory_simulation_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .then(({ data, error }: { data: unknown; error: unknown }) => {
        if (cancelled) return
        if (error) {
          console.error('Failed to load the scenario library:', error)
        } else {
          setSnapshots((data ?? []) as FactorySimulationSnapshot[])
        }
        setLoadedFor(projectId)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, supabase])

  /** Prepend a route-persisted snapshot (no refetch needed). */
  const addLocal = useCallback((snapshot: FactorySimulationSnapshot) => {
    setSnapshots((prev) => [snapshot, ...prev])
  }, [])

  /** Rename under RLS; resolves to an error message or null. */
  const rename = useCallback(
    async (id: string, name: string): Promise<string | null> => {
      const trimmed = name.trim()
      if (trimmed.length === 0 || trimmed.length > 80) {
        return 'Names run 1 to 80 characters'
      }
      const { error } = await supabase
        .from('factory_simulation_snapshots')
        .update({ name: trimmed })
        .eq('id', id)
      if (error) {
        return error.code === '23505'
          ? 'A scenario with that name already exists'
          : error.message
      }
      setSnapshots((prev) =>
        prev.map((snapshot) =>
          snapshot.id === id ? { ...snapshot, name: trimmed } : snapshot,
        ),
      )
      return null
    },
    [supabase],
  )

  /** Delete under RLS; resolves to an error message or null. */
  const remove = useCallback(
    async (id: string): Promise<string | null> => {
      const { error } = await supabase
        .from('factory_simulation_snapshots')
        .delete()
        .eq('id', id)
      if (error) return error.message
      setSnapshots((prev) => prev.filter((snapshot) => snapshot.id !== id))
      return null
    },
    [supabase],
  )

  return { snapshots, loading, addLocal, rename, remove }
}
