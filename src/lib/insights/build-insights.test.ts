import { describe, expect, it } from 'vitest'
import {
  buildActivityItems,
  buildRegistryPulse,
  FEED_EVENT_TYPES,
  type ActivityEvent,
  type RegistryPulseToken,
} from './build-insights'
import { TARGET_TOKENS } from './constants'

const NOW = new Date('2026-07-10T12:00:00Z')

function token(over: Partial<RegistryPulseToken> = {}): RegistryPulseToken {
  return {
    name: 'ApeCoin',
    ticker: 'APE',
    status: 'validated',
    created_at: '2026-06-01T00:00:00Z',
    cluster_scores: { identity: 20, supply: 15, allocation: 20, vesting: 20 },
    ...over,
  }
}

describe('buildRegistryPulse', () => {
  it('returns an empty pulse for an empty registry', () => {
    const pulse = buildRegistryPulse([], NOW)
    expect(pulse.total).toBe(0)
    expect(pulse.target).toBe(TARGET_TOKENS)
    expect(pulse.goalPct).toBe(0)
    expect(pulse.additions7d).toBe(0)
    expect(pulse.lastAdded).toBeNull()
    expect(pulse.weakest).toBeNull()
  })

  it('counts totals, validated and the /300 goal percentage', () => {
    const pulse = buildRegistryPulse(
      [token(), token({ status: 'draft' }), token({ status: 'in_review' })],
      NOW,
    )
    expect(pulse.total).toBe(3)
    expect(pulse.validated).toBe(1)
    expect(pulse.goalPct).toBe(Math.round((3 / TARGET_TOKENS) * 100))
  })

  it('counts additions in the trailing 7 days and tracks the last added token', () => {
    const pulse = buildRegistryPulse(
      [
        token({ name: 'Old', created_at: '2026-06-01T00:00:00Z' }),
        token({
          name: 'Fresh',
          ticker: 'FRS',
          created_at: '2026-07-08T00:00:00Z',
        }),
        token({ name: 'Edge', created_at: '2026-07-03T12:00:00Z' }),
      ],
      NOW,
    )
    expect(pulse.additions7d).toBe(2) // Fresh + Edge (exactly 7d ago counts)
    expect(pulse.lastAdded).toEqual({
      name: 'Fresh',
      ticker: 'FRS',
      createdAt: '2026-07-08T00:00:00Z',
    })
  })

  it('picks the lowest completion-rate cluster as weakest, with missing count', () => {
    const pulse = buildRegistryPulse(
      [
        token(), // everything complete
        token({
          cluster_scores: {
            identity: 20,
            supply: 15,
            allocation: 20,
            vesting: 0,
          },
        }),
        token({
          cluster_scores: {
            identity: 20,
            supply: 10,
            allocation: 20,
            vesting: 0,
          },
        }),
      ],
      NOW,
    )
    expect(pulse.weakest).toEqual({
      key: 'vesting',
      label: 'Vesting',
      missing: 2,
    })
  })

  it('treats null cluster_scores as fully missing', () => {
    const pulse = buildRegistryPulse([token({ cluster_scores: null })], NOW)
    expect(pulse.weakest?.missing).toBe(1)
  })

  it('returns no weakest cluster when every cluster is complete', () => {
    const pulse = buildRegistryPulse([token(), token()], NOW)
    expect(pulse.weakest).toBeNull()
  })
})

describe('buildActivityItems', () => {
  const NAMES = new Map([['t1', { name: 'ApeCoin', ticker: 'APE' }]])

  function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
    return {
      id: over.id ?? 'e1',
      event_type: 'opened',
      token_id: 't1',
      created_at: '2026-07-09T10:00:00Z',
      ...over,
    }
  }

  const FULL_PULSE = buildRegistryPulse(
    Array.from({ length: 6 }, (_, i) => ({
      name: `T${i}`,
      ticker: `T${i}`,
      status: 'validated' as const,
      created_at: '2026-07-01T00:00:00Z',
      cluster_scores: null,
    })),
    NOW,
  )

  it('maps whitelisted events to anonymized copy with the token name', () => {
    const items = buildActivityItems(
      [event({ id: 'a', event_type: 'owner_accepted' })],
      NAMES,
      FULL_PULSE,
    )
    expect(items[0].message).toBe('The owner accepted an update on ApeCoin')
    expect(items[0].kind).toBe('resolution')
  })

  it('drops event types outside the whitelist', () => {
    const items = buildActivityItems(
      [event({ id: 'a', event_type: 'stake_recorded' })],
      NAMES,
      FULL_PULSE,
    )
    expect(items.find((i) => i.id === 'a')).toBeUndefined()
    expect(FEED_EVENT_TYPES).not.toContain('stake_recorded')
  })

  it('falls back to "a token" when the token name is unknown', () => {
    const items = buildActivityItems(
      [event({ id: 'a', token_id: 'unknown' })],
      NAMES,
      FULL_PULSE,
    )
    expect(items[0].message).toBe('A challenge was opened on a token')
  })

  it('fuses registry milestones in when fewer than 5 real events', () => {
    const items = buildActivityItems([event({ id: 'a' })], NAMES, FULL_PULSE)
    expect(items.some((i) => i.kind === 'registry')).toBe(true)
    // The undated milestone carries no fake timestamp and sorts last
    const milestone = items.find((i) => i.id === 'registry-milestone')
    expect(milestone?.at).toBeNull()
    expect(items[items.length - 1].id).toBe('registry-milestone')
  })

  it('keeps newest first and respects the limit', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      event({ id: `e${i}`, created_at: `2026-07-0${(i % 9) + 1}T10:00:00Z` }),
    )
    const items = buildActivityItems(events, NAMES, FULL_PULSE, 4)
    expect(items).toHaveLength(4)
    expect(items[0].at! >= items[1].at!).toBe(true)
  })
})
