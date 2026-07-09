import { describe, it, expect } from 'vitest'
import { deriveChipState } from './challenge-target'
import type { Challenge } from '@/types/challenges'

// Minimal fake Challenge builder — only the fields deriveChipState reads
// matter; everything else is cast away via `as Challenge`.
function fakeChallenge(partial: Partial<Challenge>): Challenge {
  return {
    status: 'open',
    challenge_type: 'update',
    resolved_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as Challenge
}

describe('deriveChipState', () => {
  it('returns dormant when there are no challenges', () => {
    expect(deriveChipState([], '2026-01-01T00:00:00.000Z')).toBe('dormant')
  })

  it('returns dormant when all challenges were withdrawn', () => {
    const challenges = [
      fakeChallenge({
        status: 'withdrawn',
        updated_at: '2026-01-02T00:00:00.000Z',
      }),
    ]
    expect(deriveChipState(challenges, '2026-01-01T00:00:00.000Z')).toBe(
      'dormant',
    )
  })

  it('returns active when any challenge is open, regardless of older resolved ones', () => {
    const challenges = [
      fakeChallenge({
        status: 'rejected',
        resolved_at: '2026-01-05T00:00:00.000Z',
      }),
      fakeChallenge({ status: 'open' }),
    ]
    expect(deriveChipState(challenges, '2026-01-01T00:00:00.000Z')).toBe(
      'active',
    )
  })

  it('picks the most-recently-resolved challenge among several terminal ones', () => {
    const challenges = [
      fakeChallenge({
        status: 'rejected',
        resolved_at: '2026-01-01T00:00:00.000Z',
      }),
      fakeChallenge({
        status: 'stale',
        resolved_at: '2026-01-10T00:00:00.000Z',
      }),
      fakeChallenge({
        status: 'expired',
        resolved_at: '2026-01-05T00:00:00.000Z',
      }),
    ]
    // 'stale' has the latest resolved_at, so it wins over the others.
    expect(deriveChipState(challenges, '2026-01-01T00:00:00.000Z')).toBe(
      'stale',
    )
  })

  it('falls back to updated_at when resolved_at is null (e.g. a withdrawn row mixed with a terminal one)', () => {
    const challenges = [
      fakeChallenge({
        status: 'withdrawn',
        resolved_at: null,
        updated_at: '2026-01-20T00:00:00.000Z',
      }),
      fakeChallenge({
        status: 'accepted',
        challenge_type: 'update',
        resolved_at: '2026-01-05T00:00:00.000Z',
      }),
    ]
    // The withdrawn row is excluded from consideration entirely, so the
    // accepted 'update' challenge decides the chip despite the withdrawn
    // row's later updated_at.
    expect(deriveChipState(challenges, '2026-01-01T00:00:00.000Z')).toBe(
      'accepted',
    )
  })

  it('returns dispute_accepted when a dispute was accepted but the token has not yet been corrected', () => {
    const challenges = [
      fakeChallenge({
        status: 'accepted',
        challenge_type: 'dispute',
        resolved_at: '2026-01-10T00:00:00.000Z',
      }),
    ]
    // tokenUpdatedAt predates resolved_at -> the correction has not landed yet.
    expect(deriveChipState(challenges, '2026-01-05T00:00:00.000Z')).toBe(
      'dispute_accepted',
    )
  })

  it('returns accepted (not dispute_accepted) once the token has been corrected after resolution', () => {
    const challenges = [
      fakeChallenge({
        status: 'accepted',
        challenge_type: 'dispute',
        resolved_at: '2026-01-10T00:00:00.000Z',
      }),
    ]
    // tokenUpdatedAt is after resolved_at -> the owner/moderator already
    // applied the correction through the studio.
    expect(deriveChipState(challenges, '2026-01-15T00:00:00.000Z')).toBe(
      'accepted',
    )
  })

  it('returns accepted for an accepted "update" challenge regardless of tokenUpdatedAt', () => {
    const challenges = [
      fakeChallenge({
        status: 'accepted',
        challenge_type: 'update',
        resolved_at: '2026-01-10T00:00:00.000Z',
      }),
    ]
    expect(deriveChipState(challenges, '2026-01-01T00:00:00.000Z')).toBe(
      'accepted',
    )
  })

  it('returns auto_adopted for an auto-adopted challenge', () => {
    const challenges = [
      fakeChallenge({
        status: 'auto_adopted',
        resolved_at: '2026-01-10T00:00:00.000Z',
      }),
    ]
    expect(deriveChipState(challenges, '2026-01-01T00:00:00.000Z')).toBe(
      'auto_adopted',
    )
  })

  it('returns rejected for a rejected challenge', () => {
    const challenges = [
      fakeChallenge({
        status: 'rejected',
        resolved_at: '2026-01-10T00:00:00.000Z',
      }),
    ]
    expect(deriveChipState(challenges, '2026-01-01T00:00:00.000Z')).toBe(
      'rejected',
    )
  })

  it('returns stale for a stale challenge', () => {
    const challenges = [
      fakeChallenge({
        status: 'stale',
        resolved_at: '2026-01-10T00:00:00.000Z',
      }),
    ]
    expect(deriveChipState(challenges, '2026-01-01T00:00:00.000Z')).toBe(
      'stale',
    )
  })

  it('returns expired for an expired challenge', () => {
    const challenges = [
      fakeChallenge({
        status: 'expired',
        resolved_at: '2026-01-10T00:00:00.000Z',
      }),
    ]
    expect(deriveChipState(challenges, '2026-01-01T00:00:00.000Z')).toBe(
      'expired',
    )
  })
})
