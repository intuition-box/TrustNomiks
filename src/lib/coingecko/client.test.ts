import { describe, it, expect } from 'vitest'
import {
  resolveCoinGeckoConfig,
  coingeckoFetch,
  DEFAULT_REQUESTS_PER_MINUTE,
} from './client'

describe('resolveCoinGeckoConfig', () => {
  it('falls back to the keyless public tier when no key is set', () => {
    const config = resolveCoinGeckoConfig({})

    expect(config.tier).toBe('public')
    expect(config.apiKey).toBeNull()
    expect(config.headerName).toBeNull()
    expect(config.baseUrl).toBe('https://api.coingecko.com/api/v3')
    expect(config.requestsPerMinute).toBe(DEFAULT_REQUESTS_PER_MINUTE.public)
  })

  it('uses the demo header and base URL when a key is set', () => {
    const config = resolveCoinGeckoConfig({ COINGECKO_API_KEY: 'cg-demo-key' })

    expect(config.tier).toBe('demo')
    expect(config.headerName).toBe('x-cg-demo-api-key')
    expect(config.baseUrl).toBe('https://api.coingecko.com/api/v3')
    expect(config.requestsPerMinute).toBe(DEFAULT_REQUESTS_PER_MINUTE.demo)
  })

  it('switches to the pro host and header on the pro tier', () => {
    const config = resolveCoinGeckoConfig({
      COINGECKO_API_KEY: 'cg-pro-key',
      COINGECKO_API_TIER: 'PRO',
    })

    expect(config.tier).toBe('pro')
    expect(config.headerName).toBe('x-cg-pro-api-key')
    expect(config.baseUrl).toBe('https://pro-api.coingecko.com/api/v3')
  })

  it('ignores a pro tier claimed without a key: a pro host with no key is a 401, not a degraded call', () => {
    const config = resolveCoinGeckoConfig({ COINGECKO_API_TIER: 'pro' })

    expect(config.tier).toBe('public')
    expect(config.baseUrl).toBe('https://api.coingecko.com/api/v3')
  })

  it('treats a blank key as no key', () => {
    const config = resolveCoinGeckoConfig({ COINGECKO_API_KEY: '   ' })

    expect(config.tier).toBe('public')
    expect(config.apiKey).toBeNull()
  })

  it('honours a positive rate-limit override and ignores a junk one', () => {
    expect(
      resolveCoinGeckoConfig({ COINGECKO_RATE_LIMIT_PER_MIN: '42' })
        .requestsPerMinute,
    ).toBe(42)

    expect(
      resolveCoinGeckoConfig({ COINGECKO_RATE_LIMIT_PER_MIN: 'nonsense' })
        .requestsPerMinute,
    ).toBe(DEFAULT_REQUESTS_PER_MINUTE.public)

    expect(
      resolveCoinGeckoConfig({ COINGECKO_RATE_LIMIT_PER_MIN: '0' })
        .requestsPerMinute,
    ).toBe(DEFAULT_REQUESTS_PER_MINUTE.public)
  })
})

describe('coingeckoFetch', () => {
  /** Captures the request the client would send, without hitting the network. */
  async function capture(
    path: string,
    params: URLSearchParams | undefined,
    env: Record<string, string | undefined>,
  ) {
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: (init?.headers ?? {}) as Record<string, string>,
      })
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    try {
      await coingeckoFetch(path, params, resolveCoinGeckoConfig(env))
    } finally {
      globalThis.fetch = originalFetch
    }

    return calls[0]
  }

  it('sends the demo key header on the demo tier', async () => {
    const call = await capture('/coins/bitcoin', undefined, {
      COINGECKO_API_KEY: 'cg-demo-key',
    })

    expect(call.url).toBe('https://api.coingecko.com/api/v3/coins/bitcoin')
    expect(call.headers['x-cg-demo-api-key']).toBe('cg-demo-key')
    expect(call.headers['x-cg-pro-api-key']).toBeUndefined()
  })

  it('sends the pro key header against the pro host', async () => {
    const call = await capture('/coins/bitcoin', undefined, {
      COINGECKO_API_KEY: 'cg-pro-key',
      COINGECKO_API_TIER: 'pro',
    })

    expect(call.url).toBe('https://pro-api.coingecko.com/api/v3/coins/bitcoin')
    expect(call.headers['x-cg-pro-api-key']).toBe('cg-pro-key')
  })

  it('sends no key header at all when none is configured', async () => {
    const call = await capture(
      '/search',
      new URLSearchParams({ query: 'uni' }),
      {},
    )

    expect(call.url).toBe('https://api.coingecko.com/api/v3/search?query=uni')
    expect(call.headers['x-cg-demo-api-key']).toBeUndefined()
    expect(call.headers['x-cg-pro-api-key']).toBeUndefined()
    expect(call.headers.Accept).toBe('application/json')
  })

  it('appends params as a query string and omits the "?" when there are none', async () => {
    const withParams = await capture(
      '/simple/price',
      new URLSearchParams({ ids: 'uniswap', vs_currencies: 'usd' }),
      {},
    )
    expect(withParams.url).toBe(
      'https://api.coingecko.com/api/v3/simple/price?ids=uniswap&vs_currencies=usd',
    )

    const withoutParams = await capture('/coins/list', undefined, {})
    expect(withoutParams.url).toBe(
      'https://api.coingecko.com/api/v3/coins/list',
    )
  })
})
