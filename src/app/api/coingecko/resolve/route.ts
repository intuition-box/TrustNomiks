import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/coingecko/rate-limiter'
import { toCoinGeckoPlatform } from '@/lib/coingecko/chain-map'
import type { CoinGeckoResolveResult } from '@/types/coingecko'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes (contract mapping is stable)

const cache = new Map<string, { data: ResolvedCoin; timestamp: number }>()

interface ResolvedCoin {
  id: string
  name: string
  symbol: string
  thumb: string
  market_cap_rank: number | null
}

export async function GET(request: NextRequest) {
  const chain = request.nextUrl.searchParams.get('chain')
  const contractAddress = request.nextUrl.searchParams.get('contract_address')

  const platform = toCoinGeckoPlatform(chain)
  if (!platform || !contractAddress) {
    return NextResponse.json(
      { error: 'Unsupported chain or missing contract_address' },
      { status: 404 }
    )
  }

  const cacheKey = `${platform}:${contractAddress.toLowerCase()}`
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
    const res = await fetch(
      `${COINGECKO_BASE}/coins/${platform}/contract/${contractAddress.toLowerCase()}`,
      { headers: { Accept: 'application/json' } }
    )

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'Token not found on CoinGecko' }, { status: 404 })
      }
      return NextResponse.json({ error: 'CoinGecko API error' }, { status: res.status })
    }

    const data: CoinGeckoResolveResult = await res.json()
    const resolved: ResolvedCoin = {
      id: data.id,
      name: data.name,
      symbol: data.symbol,
      thumb: data.image?.thumb ?? '',
      market_cap_rank: data.market_cap_rank,
    }

    cache.set(cacheKey, { data: resolved, timestamp: Date.now() })

    return NextResponse.json(resolved)
  } catch {
    return NextResponse.json({ error: 'Failed to reach CoinGecko' }, { status: 502 })
  }
}
