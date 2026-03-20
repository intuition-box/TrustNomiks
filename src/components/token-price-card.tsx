'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, AlertCircle, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CoinGeckoPriceData } from '@/types/coingecko'

interface TokenPriceCardProps {
  coingeckoId: string | null
  tokenId: string
}

function formatCompactUSD(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`
  return `$${value.toFixed(2)}`
}

function formatPrice(value: number): string {
  if (value >= 1) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (value >= 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(6)}`
}

export function TokenPriceCard({ coingeckoId, tokenId }: TokenPriceCardProps) {
  const [price, setPrice] = useState<CoinGeckoPriceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPrice = useCallback(async () => {
    if (!coingeckoId) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/coingecko/price?id=${encodeURIComponent(coingeckoId)}`)
      if (!res.ok) {
        throw new Error(res.status === 429 ? 'Rate limit — please wait' : 'Failed to fetch price')
      }
      const data: CoinGeckoPriceData = await res.json()
      setPrice(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch price')
    } finally {
      setLoading(false)
    }
  }, [coingeckoId])

  useEffect(() => {
    fetchPrice()
  }, [fetchPrice])

  if (!coingeckoId) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between py-4">
          <div className="text-sm text-muted-foreground">
            No CoinGecko link — price data unavailable
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`/tokens/new?id=${tokenId}`}>Link to CoinGecko</a>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (loading && !price) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Market Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
          <Button variant="outline" size="sm" onClick={fetchPrice}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!price) return null

  const change = price.usd_24h_change
  const isPositive = change !== null && change >= 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">Market Data</CardTitle>
          <div className="flex items-center gap-2">
            <a
              href={`https://www.coingecko.com/en/coins/${coingeckoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              CoinGecko
              <ExternalLink className="h-3 w-3" />
            </a>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={fetchPrice}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Price */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Price</div>
            <div className="text-xl font-bold">{formatPrice(price.usd)}</div>
          </div>

          {/* 24h Change */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">24h Change</div>
            {change !== null ? (
              <div className={cn('text-lg font-semibold flex items-center gap-1', isPositive ? 'text-emerald-500' : 'text-red-500')}>
                {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {isPositive ? '+' : ''}{change.toFixed(2)}%
              </div>
            ) : (
              <div className="text-lg text-muted-foreground">—</div>
            )}
          </div>

          {/* Market Cap */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">Market Cap</div>
            <div className="text-lg font-semibold">
              {price.usd_market_cap ? formatCompactUSD(price.usd_market_cap) : '—'}
            </div>
          </div>

          {/* 24h Volume */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">24h Volume</div>
            <div className="text-lg font-semibold">
              {price.usd_24h_vol ? formatCompactUSD(price.usd_24h_vol) : '—'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
