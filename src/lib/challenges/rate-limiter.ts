/**
 * Keyed in-memory sliding-window rate limiter for challenge API routes
 * (e.g. GET /api/challenges/[id]/consensus), throttled per `(user, challenge)`
 * key rather than globally (contrast src/lib/coingecko/rate-limiter.ts, which
 * has a single global window).
 *
 * Caveat: this Map lives in the current serverless instance's memory only.
 * It is not shared across concurrent instances/regions and resets on cold
 * start, so the effective limit is "per instance," not truly global.
 * Accepted for MVP — a durable multi-instance limiter would need a shared
 * store (e.g. a Supabase table or Redis).
 */

const DEFAULT_MAX_REQUESTS = 20
const DEFAULT_WINDOW_MS = 60_000

const buckets = new Map<string, number[]>()

export function checkChallengeRateLimit(
  key: string,
  opts?: { max?: number; windowMs?: number },
): { allowed: boolean; retryAfterMs?: number } {
  const max = opts?.max ?? DEFAULT_MAX_REQUESTS
  const windowMs = opts?.windowMs ?? DEFAULT_WINDOW_MS

  const now = Date.now()
  const windowStart = now - windowMs

  const timestamps = buckets.get(key) ?? []

  // Prune expired timestamps
  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift()
  }

  if (timestamps.length >= max) {
    const retryAfterMs = timestamps[0] + windowMs - now
    buckets.set(key, timestamps)
    return { allowed: false, retryAfterMs }
  }

  timestamps.push(now)
  buckets.set(key, timestamps)
  return { allowed: true }
}
