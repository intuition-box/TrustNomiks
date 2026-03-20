'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { CoinGeckoSearchResult } from '@/types/coingecko'

export function useCoinGeckoSearch(query: string, debounceMs = 300) {
  const [results, setResults] = useState<CoinGeckoSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef(new Map<string, CoinGeckoSearchResult[]>())
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (q: string) => {
    const key = q.toLowerCase()

    const cached = cacheRef.current.get(key)
    if (cached) {
      setResults(cached)
      setIsLoading(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/coingecko/search?query=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(res.status === 429 ? 'Rate limit exceeded, please wait' : 'Search failed')
      }

      const data = await res.json()
      const coins: CoinGeckoSearchResult[] = data.coins ?? []

      cacheRef.current.set(key, coins)
      setResults(coins)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      setIsLoading(false)
      setError(null)
      return
    }

    const timer = setTimeout(() => search(query), debounceMs)
    return () => clearTimeout(timer)
  }, [query, debounceMs, search])

  return { results, isLoading, error }
}
