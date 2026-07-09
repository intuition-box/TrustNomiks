import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/coingecko/rate-limiter'
import type { CoinGeckoProfile } from '@/types/coingecko'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 10 * 60 * 1000 // profile data moves slowly

const cache = new Map<string, { data: CoinGeckoProfile; timestamp: number }>()

interface CoinGeckoCoinResponse {
  id: string
  name: string
  symbol: string
  image?: { thumb?: string; small?: string; large?: string }
  platforms?: Record<string, string>
  market_data?: {
    max_supply?: number | null
    total_supply?: number | null
    circulating_supply?: number | null
  }
}

/**
 * GET /api/coingecko/profile?id=<coingecko-id>
 * Subset of /coins/{id} used by the studio's autofill: identity, contract
 * addresses per platform, and supply figures.
 */
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
      localization: 'false',
      tickers: 'false',
      market_data: 'true',
      community_data: 'false',
      developer_data: 'false',
      sparkline: 'false',
    })

    const res = await fetch(
      `${COINGECKO_BASE}/coins/${encodeURIComponent(id)}?${params}`,
      {
        headers: { Accept: 'application/json' },
      },
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: 'CoinGecko API error' },
        { status: res.status },
      )
    }

    const raw: CoinGeckoCoinResponse = await res.json()

    const data: CoinGeckoProfile = {
      id: raw.id,
      name: raw.name,
      symbol: raw.symbol,
      thumb: raw.image?.thumb ?? null,
      platforms: raw.platforms ?? {},
      max_supply: raw.market_data?.max_supply ?? null,
      total_supply: raw.market_data?.total_supply ?? null,
      circulating_supply: raw.market_data?.circulating_supply ?? null,
    }

    cache.set(cacheKey, { data, timestamp: Date.now() })

    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'Failed to reach CoinGecko' },
      { status: 502 },
    )
  }
}
