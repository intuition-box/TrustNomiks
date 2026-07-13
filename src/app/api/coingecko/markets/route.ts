import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/coingecko/rate-limiter'
import { coingeckoFetch } from '@/lib/coingecko/client'
import type { CoinGeckoPriceResponse } from '@/types/coingecko'

// Market pulse, not a trading terminal: 5 minutes is fresh enough and keeps
// the whole registry to one upstream call per window.
const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_IDS = 50

const cache = new Map<
  string,
  { data: CoinGeckoPriceResponse; timestamp: number }
>()

export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get('ids')?.trim()
  if (!idsParam) {
    return NextResponse.json(
      { error: 'Missing ids parameter' },
      { status: 400 },
    )
  }

  const ids = [
    ...new Set(
      idsParam
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
    .sort()
    .slice(0, MAX_IDS)

  const cacheKey = ids.join(',')
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data)
  }

  const { allowed, retryAfterMs } = checkRateLimit()
  if (!allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((retryAfterMs ?? 1000) / 1000)),
        },
      },
    )
  }

  try {
    const params = new URLSearchParams({
      ids: ids.join(','),
      vs_currencies: 'usd',
      include_24hr_change: 'true',
    })
    const res = await coingeckoFetch('/simple/price', params)
    if (!res.ok) {
      return NextResponse.json(
        { error: 'CoinGecko API error' },
        { status: res.status },
      )
    }
    const data: CoinGeckoPriceResponse = await res.json()
    cache.set(cacheKey, { data, timestamp: Date.now() })
    return NextResponse.json(data)
  } catch (error) {
    console.error('coingecko markets error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch market data' },
      { status: 502 },
    )
  }
}
