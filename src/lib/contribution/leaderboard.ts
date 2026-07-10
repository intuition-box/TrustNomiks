/** Minimal token shape the leaderboard needs to aggregate contributors. */
export interface LeaderboardToken {
  created_by: string
  completeness: number
}

export interface LeaderboardEntry {
  userId: string
  count: number
  avgCompleteness: number
  isCurrentUser: boolean
}

/**
 * Ranks contributors by structured-token count, then average completeness.
 * Pure aggregation, no I/O: the caller supplies the already-fetched tokens
 * and the current user id (for the `isCurrentUser` highlight).
 */
export function buildLeaderboard(
  tokens: LeaderboardToken[],
  currentUserId?: string | null,
): LeaderboardEntry[] {
  const map = new Map<string, { count: number; totalCompleteness: number }>()
  for (const t of tokens) {
    if (!t.created_by) continue
    const entry = map.get(t.created_by) ?? { count: 0, totalCompleteness: 0 }
    entry.count++
    entry.totalCompleteness += t.completeness || 0
    map.set(t.created_by, entry)
  }
  return Array.from(map.entries())
    .map(([userId, data]) => ({
      userId,
      count: data.count,
      avgCompleteness: Math.round(data.totalCompleteness / data.count),
      isCurrentUser: userId === currentUserId,
    }))
    .sort((a, b) => b.count - a.count || b.avgCompleteness - a.avgCompleteness)
}
