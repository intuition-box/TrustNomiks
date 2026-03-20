/**
 * Simple in-memory sliding-window rate limiter for CoinGecko API calls.
 * CoinGecko free tier: 30 req/min. We cap at 25 for safety margin.
 */

const MAX_REQUESTS = 25
const WINDOW_MS = 60_000

const timestamps: number[] = []

export function checkRateLimit(): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  // Prune expired timestamps
  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift()
  }

  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfterMs = timestamps[0] + WINDOW_MS - now
    return { allowed: false, retryAfterMs }
  }

  timestamps.push(now)
  return { allowed: true }
}
