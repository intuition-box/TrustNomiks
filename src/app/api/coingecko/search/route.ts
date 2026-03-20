import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/coingecko/rate-limiter'
import type { CoinGeckoSearchResponse } from '@/types/coingecko'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

const cache = new Map<string, { data: CoinGeckoSearchResponse['coins']; timestamp: number }>()

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')?.trim()

  if (!query || query.length < 2) {
    return NextResponse.json({ coins: [] })
  }

  const cacheKey = query.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({ coins: cached.data })
  }

  const { allowed, retryAfterMs } = checkRateLimit()
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((retryAfterMs ?? 1000) / 1000)) } }
    )
  }

  try {
    const res = await fetch(
      `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } }
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'CoinGecko API error' }, { status: res.status })
    }

    const data: CoinGeckoSearchResponse = await res.json()
    const coins = data.coins.slice(0, 8).map(({ id, name, symbol, thumb, market_cap_rank }) => ({
      id,
      name,
      symbol,
      thumb,
      market_cap_rank,
    }))

    cache.set(cacheKey, { data: coins, timestamp: Date.now() })

    return NextResponse.json({ coins })
  } catch {
    return NextResponse.json({ error: 'Failed to reach CoinGecko' }, { status: 502 })
  }
}
