/**
 * Shared CoinGecko HTTP client. Every route must go through this.
 *
 * Calling the API with no key is not a soft failure: requests land on the
 * keyless public endpoint, whose throttle CoinGecko does not publish and which
 * bites well before any tier's documented ceiling. The route then surfaces
 * CoinGecko's own 429 to the client. Sending the key is what buys the published
 * limit, so the base URL, the header and the rate-limit budget are all decided
 * from the same config and can never drift apart.
 */

export type CoinGeckoTier = 'public' | 'demo' | 'pro'

const DEMO_BASE = 'https://api.coingecko.com/api/v3'
const PRO_BASE = 'https://pro-api.coingecko.com/api/v3'

/**
 * Requests/minute we allow ourselves per tier. Published ceilings
 * (coingecko.com/en/api/pricing, read 2026-07-13): Demo 100/min and 10k
 * credits/month, Basic 300/min, Analyst and Lite 500/min. Each default keeps
 * headroom under the real ceiling. `public` has no published ceiling at all, so
 * it stays deliberately low: the point is to fail on our side, predictably,
 * rather than get throttled by theirs.
 */
export const DEFAULT_REQUESTS_PER_MINUTE: Record<CoinGeckoTier, number> = {
  public: 10,
  demo: 90,
  pro: 250,
}

export interface CoinGeckoConfig {
  tier: CoinGeckoTier
  baseUrl: string
  /** Null on the `public` tier, where no key is sent. */
  apiKey: string | null
  /** Null on the `public` tier. */
  headerName: string | null
  requestsPerMinute: number
}

type Env = Record<string, string | undefined>

/**
 * Derives the CoinGecko config from the environment. The tier is driven by the
 * key: no key means `public`, whatever COINGECKO_API_TIER claims, because a Pro
 * base URL without a Pro key is a guaranteed 401 rather than a degraded call.
 *
 * Pure and env-injectable so the tier matrix can be unit-tested.
 */
export function resolveCoinGeckoConfig(
  env: Env = process.env,
): CoinGeckoConfig {
  const apiKey = env.COINGECKO_API_KEY?.trim() || null
  const requestedTier = env.COINGECKO_API_TIER?.trim().toLowerCase()

  const tier: CoinGeckoTier = !apiKey
    ? 'public'
    : requestedTier === 'pro'
      ? 'pro'
      : 'demo'

  const override = Number(env.COINGECKO_RATE_LIMIT_PER_MIN)
  const requestsPerMinute =
    Number.isFinite(override) && override > 0
      ? Math.floor(override)
      : DEFAULT_REQUESTS_PER_MINUTE[tier]

  return {
    tier,
    baseUrl: tier === 'pro' ? PRO_BASE : DEMO_BASE,
    apiKey: tier === 'public' ? null : apiKey,
    headerName:
      tier === 'pro'
        ? 'x-cg-pro-api-key'
        : tier === 'demo'
          ? 'x-cg-demo-api-key'
          : null,
    requestsPerMinute,
  }
}

/**
 * Fetches a CoinGecko path with the tier's base URL and auth header applied.
 * `path` is root-relative (e.g. `/coins/bitcoin`); callers own their params and
 * their response parsing, exactly as before.
 */
export function coingeckoFetch(
  path: string,
  params?: URLSearchParams,
  config: CoinGeckoConfig = resolveCoinGeckoConfig(),
): Promise<Response> {
  const query = params?.toString()
  const url = `${config.baseUrl}${path}${query ? `?${query}` : ''}`

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (config.headerName && config.apiKey) {
    headers[config.headerName] = config.apiKey
  }

  return fetch(url, { headers })
}
