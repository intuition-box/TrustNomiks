/**
 * Per-user sliding-window limiter for the extraction endpoint. In-memory on
 * purpose (same trade-off as the CoinGecko limiter): a warm serverless
 * instance keeps its window, a cold start forgets it, and that is acceptable
 * for a cost-capping guard (the hard auth gate is contributor status).
 */
const WINDOW_MS = 60 * 60 * 1000
const MAX_CALLS_PER_WINDOW = 20

const callLog = new Map<string, number[]>()

export function checkImportRateLimit(
  userId: string,
  now: number = Date.now(),
): { allowed: boolean; retryAfterSeconds: number } {
  const cutoff = now - WINDOW_MS
  const recent = (callLog.get(userId) ?? []).filter((t) => t > cutoff)

  if (recent.length >= MAX_CALLS_PER_WINDOW) {
    const oldest = Math.min(...recent)
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((oldest + WINDOW_MS - now) / 1000),
      ),
    }
  }

  recent.push(now)
  callLog.set(userId, recent)
  return { allowed: true, retryAfterSeconds: 0 }
}

/** Test hook. */
export function resetImportRateLimit(): void {
  callLog.clear()
}
