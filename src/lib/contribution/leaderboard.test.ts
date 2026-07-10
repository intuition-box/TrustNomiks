import { describe, it, expect } from 'vitest'
import { buildLeaderboard } from './leaderboard'

describe('buildLeaderboard', () => {
  it('aggregates count and average completeness per contributor', () => {
    const entries = buildLeaderboard([
      { created_by: 'a', completeness: 80 },
      { created_by: 'a', completeness: 60 },
      { created_by: 'b', completeness: 100 },
    ])
    const a = entries.find((e) => e.userId === 'a')
    const b = entries.find((e) => e.userId === 'b')
    expect(a).toEqual({
      userId: 'a',
      count: 2,
      avgCompleteness: 70,
      isCurrentUser: false,
    })
    expect(b).toEqual({
      userId: 'b',
      count: 1,
      avgCompleteness: 100,
      isCurrentUser: false,
    })
  })

  it('sorts by count descending, then by average completeness descending', () => {
    const entries = buildLeaderboard([
      { created_by: 'low-count-high-avg', completeness: 100 },
      { created_by: 'high-count', completeness: 10 },
      { created_by: 'high-count', completeness: 10 },
      { created_by: 'high-count', completeness: 10 },
      { created_by: 'same-count-lower-avg', completeness: 50 },
      { created_by: 'same-count-lower-avg', completeness: 50 },
    ])
    expect(entries.map((e) => e.userId)).toEqual([
      'high-count',
      'same-count-lower-avg',
      'low-count-high-avg',
    ])
  })

  it('flags isCurrentUser for the matching userId only', () => {
    const entries = buildLeaderboard(
      [
        { created_by: 'me', completeness: 50 },
        { created_by: 'other', completeness: 50 },
      ],
      'me',
    )
    expect(entries.find((e) => e.userId === 'me')?.isCurrentUser).toBe(true)
    expect(entries.find((e) => e.userId === 'other')?.isCurrentUser).toBe(false)
  })

  it('skips tokens without a created_by (orphaned rows)', () => {
    const entries = buildLeaderboard([
      { created_by: '', completeness: 50 },
      { created_by: 'a', completeness: 50 },
    ])
    expect(entries).toHaveLength(1)
    expect(entries[0].userId).toBe('a')
  })

  it('returns an empty array for no tokens', () => {
    expect(buildLeaderboard([])).toEqual([])
  })
})
