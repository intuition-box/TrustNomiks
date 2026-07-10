'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRegistryTokens } from '@/features/insights/use-registry-tokens'

export interface PriceMover {
  tokenId: string
  name: string
  ticker: string
  change24h: number
}

type MarketsResponse = Record<string, { usd?: number; usd_24h_change?: number }>

/**
 * The registry's biggest 24h market move: external liveliness that works at
 * any internal volume. One batched, server-cached (5 min) CoinGecko call for
 * every token that has a coingecko_id.
 */
export function usePriceMovers() {
  const { data: tokens } = useRegistryTokens()

  const ids = useMemo(
    () =>
      [
        ...new Set(
          (tokens ?? [])
            .map((t) => t.coingecko_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ].sort(),
    [tokens],
  )

  const query = useQuery({
    queryKey: ['price-movers', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MarketsResponse> => {
      const res = await fetch(`/api/coingecko/markets?ids=${ids.join(',')}`)
      if (!res.ok) throw new Error('Market data fetch failed')
      return res.json()
    },
  })

  const topMover: PriceMover | null = useMemo(() => {
    if (!query.data || !tokens) return null
    let best: PriceMover | null = null
    for (const t of tokens) {
      if (!t.coingecko_id) continue
      const change = query.data[t.coingecko_id.toLowerCase()]?.usd_24h_change
      if (typeof change !== 'number' || !isFinite(change)) continue
      if (!best || Math.abs(change) > Math.abs(best.change24h)) {
        best = {
          tokenId: t.id,
          name: t.name,
          ticker: t.ticker,
          change24h: change,
        }
      }
    }
    return best
  }, [query.data, tokens])

  return { ...query, topMover }
}
