import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/coingecko/rate-limiter'
import type { CoinGeckoPriceResponse } from '@/types/coingecko'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 60 * 1000 // 60 seconds

const cache = new Map<string, { data: CoinGeckoPriceResponse[string]; timestamp: number }>()

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim()

  if (!id) {
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 })
  }

  const cacheKey = id.toLowerCase()
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data)
  }

  const { allowed, retryAfterMs } = checkRateLimit()
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((retryAfterMs ?? 1000) / 1000)) } }
    )
  }

  try {
    const params = new URLSearchParams({
      ids: id,
      vs_currencies: 'usd',
      include_24hr_change: 'true',
      include_market_cap: 'true',
      include_24hr_vol: 'true',
    })

    const res = await fetch(`${COINGECKO_BASE}/simple/price?${params}`, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'CoinGecko API error' }, { status: res.status })
    }

    const data: CoinGeckoPriceResponse = await res.json()
    const priceData = data[id]

    if (!priceData) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    cache.set(cacheKey, { data: priceData, timestamp: Date.now() })

    return NextResponse.json(priceData)
  } catch {
    return NextResponse.json({ error: 'Failed to reach CoinGecko' }, { status: 502 })
  }
}
