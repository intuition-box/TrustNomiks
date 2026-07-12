import { describe, it, expect } from 'vitest'
import { buildStep4Schedules, calculateCompleteness } from './schedules'

describe('buildStep4Schedules', () => {
  it('defaults a non-immediate segment without vesting data to empty monthly fields', () => {
    const schedules = buildStep4Schedules([
      { id: 'a1', segment_type: 'team-founders' },
    ])
    expect(schedules).toEqual({
      a1: {
        allocation_id: 'a1',
        frequency: 'monthly',
        cliff_months: '',
        duration_months: '',
        tge_percentage: '',
        cliff_unlock_percentage: '',
        notes: '',
      },
    })
  })

  it('defaults an immediate segment (liquidity) to a 100% TGE unlock', () => {
    const schedules = buildStep4Schedules([
      { id: 'a1', segment_type: 'liquidity' },
    ])
    expect(schedules.a1).toEqual({
      allocation_id: 'a1',
      frequency: 'immediate',
      cliff_months: '0',
      duration_months: '0',
      tge_percentage: '100',
      cliff_unlock_percentage: '',
      notes: '',
    })
  })

  it('maps an existing vesting row to string form values keyed by allocation id', () => {
    const schedules = buildStep4Schedules(
      [
        { id: 'a1', segment_type: 'team-founders' },
        { id: 'a2', segment_type: 'treasury' },
      ],
      [
        {
          allocation_id: 'a1',
          frequency: 'monthly',
          cliff_months: 6,
          duration_months: 24,
          tge_percentage: 10,
          cliff_unlock_percentage: 25,
          notes: 'lockup per SAFT',
        },
      ],
    )
    expect(schedules.a1).toEqual({
      allocation_id: 'a1',
      frequency: 'monthly',
      cliff_months: '6',
      duration_months: '24',
      tge_percentage: '10',
      cliff_unlock_percentage: '25',
      notes: 'lockup per SAFT',
    })
    // a2 has no vesting row: falls back to the non-immediate defaults
    expect(schedules.a2.frequency).toBe('monthly')
    expect(schedules.a2.cliff_months).toBe('')
  })

  it('fills the missing fields of a partial vesting row on an immediate segment', () => {
    const schedules = buildStep4Schedules(
      [{ id: 'a1', segment_type: 'airdrop' }],
      [{ allocation_id: 'a1', frequency: null, cliff_months: null }],
    )
    expect(schedules.a1).toEqual({
      allocation_id: 'a1',
      frequency: 'immediate',
      cliff_months: '0',
      duration_months: '0',
      tge_percentage: '100',
      cliff_unlock_percentage: '',
      notes: '',
    })
  })

  it('normalizes a legacy quarterly frequency to yearly', () => {
    const schedules = buildStep4Schedules(
      [{ id: 'a1', segment_type: 'team-founders' }],
      [{ allocation_id: 'a1', frequency: 'quarterly', duration_months: 36 }],
    )
    expect(schedules.a1.frequency).toBe('yearly')
    expect(schedules.a1.duration_months).toBe('36')
  })
})

describe('calculateCompleteness', () => {
  const emptyStep1 = { contract_address: '', tge_date: '' }
  const emptyStep2 = { max_supply: '', initial_supply: '', tge_supply: '' }

  it('returns the base score of 10 when nothing beyond step 1 is filled', () => {
    expect(
      calculateCompleteness(emptyStep1, emptyStep2, { segments: [] }),
    ).toBe(10)
  })

  it('scores 55 for a full steps 1-3 dataset (3 segments summing to 100)', () => {
    const score = calculateCompleteness(
      { contract_address: '0xabc', tge_date: '2025-01-01' },
      {
        max_supply: '1,000,000,000',
        initial_supply: '100,000,000',
        tge_supply: '',
      },
      {
        segments: [
          { segment_type: 'team-founders', label: 'Team', percentage: '50' },
          { segment_type: 'liquidity', label: 'Liquidity', percentage: '25' },
          { segment_type: 'treasury', label: 'Treasury', percentage: '25' },
        ],
      },
    )
    // 10 base + 5 contract + 5 tge + 10 max_supply + 5 initial + 10 (>= 3
    // segments) + 10 (sum === 100)
    expect(score).toBe(55)
  })

  it('parses French-locale comma percentages when checking the 100% bonus', () => {
    const score = calculateCompleteness(emptyStep1, emptyStep2, {
      segments: [
        { segment_type: 'team-founders', label: 'Team', percentage: '50,0' },
        { segment_type: 'liquidity', label: 'Liquidity', percentage: '25,0' },
        { segment_type: 'treasury', label: 'Treasury', percentage: '25,0' },
      ],
    })
    // 10 base + 10 (>= 3 segments) + 10 (sum === 100)
    expect(score).toBe(30)
  })

  it('withholds the sum bonus when segments do not total exactly 100', () => {
    const score = calculateCompleteness(emptyStep1, emptyStep2, {
      segments: [
        { segment_type: 'team-founders', label: 'Team', percentage: '60' },
        { segment_type: 'liquidity', label: 'Liquidity', percentage: '25' },
        { segment_type: 'treasury', label: 'Treasury', percentage: '25' },
      ],
    })
    // 10 base + 10 (>= 3 segments), no sum bonus at 110%
    expect(score).toBe(20)
  })
})
