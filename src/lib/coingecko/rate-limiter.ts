/**
 * Simple in-memory sliding-window rate limiter for CoinGecko API calls.
 *
 * The budget comes from the resolved tier (see `client.ts`), so it tracks the
 * key we actually send instead of a hardcoded guess: a keyless call gets a
 * deliberately small budget, a Demo key gets close to its published 100/min.
 * The window is per server instance, so on serverless it bounds a single
 * lambda, not the fleet.
 */

import { resolveCoinGeckoConfig } from './client'

const WINDOW_MS = 60_000

const timestamps: number[] = []

export function checkRateLimit(
  maxRequests: number = resolveCoinGeckoConfig().requestsPerMinute,
  now: number = Date.now(),
): { allowed: boolean; retryAfterMs?: number } {
  const windowStart = now - WINDOW_MS

  // Prune expired timestamps
  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift()
  }

  if (timestamps.length >= maxRequests) {
    const retryAfterMs = timestamps[0] + WINDOW_MS - now
    return { allowed: false, retryAfterMs }
  }

  timestamps.push(now)
  return { allowed: true }
}

/** Test seam: drops the window so suites do not leak state into each other. */
export function resetRateLimitWindow(): void {
  timestamps.length = 0
}
