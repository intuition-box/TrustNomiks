// CoinGecko /search response
export interface CoinGeckoSearchResult {
  id: string
  name: string
  symbol: string
  thumb: string
  market_cap_rank: number | null
}

export interface CoinGeckoSearchResponse {
  coins: CoinGeckoSearchResult[]
}

// CoinGecko /simple/price response
export interface CoinGeckoPriceData {
  usd: number
  usd_24h_change: number | null
  usd_market_cap: number | null
  usd_24h_vol: number | null
}

export type CoinGeckoPriceResponse = Record<string, CoinGeckoPriceData>

// CoinGecko /coins/{platform}/contract/{address} response (subset)
export interface CoinGeckoResolveResult {
  id: string
  name: string
  symbol: string
  image: { thumb: string; small: string; large: string }
  market_cap_rank: number | null
}
