import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { checkRateLimit, resetRateLimitWindow } from './rate-limiter'

describe('checkRateLimit', () => {
  beforeEach(() => {
    resetRateLimitWindow()
    // Pin the tier so the default-budget case does not depend on whether the
    // machine running the suite happens to have a CoinGecko key in .env.local.
    vi.stubEnv('COINGECKO_API_KEY', '')
    vi.stubEnv('COINGECKO_RATE_LIMIT_PER_MIN', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows calls up to the budget, then denies', () => {
    const now = 1_000_000

    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(3, now).allowed).toBe(true)
    }

    const denied = checkRateLimit(3, now)
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterMs).toBe(60_000)
  })

  it('slides the window: a call is allowed again once the oldest one expires', () => {
    const start = 1_000_000

    expect(checkRateLimit(1, start).allowed).toBe(true)
    expect(checkRateLimit(1, start + 59_999).allowed).toBe(false)

    // The first timestamp is now outside the 60s window.
    expect(checkRateLimit(1, start + 60_001).allowed).toBe(true)
  })

  it('reports a shrinking retryAfterMs as the window drains', () => {
    const start = 1_000_000

    checkRateLimit(1, start)

    expect(checkRateLimit(1, start + 15_000).retryAfterMs).toBe(45_000)
    expect(checkRateLimit(1, start + 45_000).retryAfterMs).toBe(15_000)
  })

  it('takes the budget from the resolved tier when none is passed', () => {
    // No CoinGecko key in the test env, so the public budget (10) applies and
    // the 11th call in the same window is refused.
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(undefined, 2_000_000).allowed).toBe(true)
    }

    expect(checkRateLimit(undefined, 2_000_000).allowed).toBe(false)
  })
})
