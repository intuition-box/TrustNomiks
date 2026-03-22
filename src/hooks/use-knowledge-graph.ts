'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import type { KnowledgeGraphParams, KnowledgeGraphResponse } from '@/types/knowledge-graph'

export function useKnowledgeGraph(params: KnowledgeGraphParams, enabled = true) {
  const [data, setData] = useState<KnowledgeGraphResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Stable serialization of params to avoid re-fetch on identity changes
  const paramsKey = useMemo(
    () => JSON.stringify({
      scope: params.scope,
      tokenIds: params.tokenIds,
      includeSources: params.includeSources,
      includeLiterals: params.includeLiterals,
    }),
    [params.scope, params.tokenIds, params.includeSources, params.includeLiterals],
  )

  const fetchGraph = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    try {
      const sp = new URLSearchParams()
      sp.set('scope', params.scope)
      if (params.tokenIds?.length) sp.set('tokenIds', params.tokenIds.join(','))
      if (params.includeSources === false) sp.set('includeSources', 'false')
      if (params.includeLiterals) sp.set('includeLiterals', 'true')

      const res = await fetch(`/api/knowledge-graph?${sp.toString()}`, {
        signal: controller.signal,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const json: KnowledgeGraphResponse = await res.json()
      setData(json)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [paramsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (enabled) fetchGraph()
    return () => abortRef.current?.abort()
  }, [fetchGraph, enabled])

  return { data, loading, error, refetch: fetchGraph }
}
