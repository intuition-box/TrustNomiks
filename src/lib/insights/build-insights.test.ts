import { describe, expect, it } from 'vitest'
import { buildRegistryPulse, type RegistryPulseToken } from './build-insights'
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
