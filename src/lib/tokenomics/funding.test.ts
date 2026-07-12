import { describe, it, expect } from 'vitest'
import {
  calculateRoundAmount,
  formatFundingRoundTypeLabel,
  fundingRoundsSchema,
  summarizeFundingRounds,
} from './funding'

describe('fundingRoundsSchema', () => {
  it('accepts an empty rounds list (funding is optional)', () => {
    expect(fundingRoundsSchema.safeParse({ rounds: [] }).success).toBe(true)
  })

  it('requires a round type on each row', () => {
    const result = fundingRoundsSchema.safeParse({
      rounds: [{ round_type: '', label: 'Seed round' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts a fully described round', () => {
    const result = fundingRoundsSchema.safeParse({
      rounds: [
        {
          id: 'r1',
          round_type: 'seed',
          label: 'Seed',
          round_date: '2026-01-15',
          token_price_usd: '0.02',
          tokens_sold: '50,000,000',
          amount_usd: '1000000',
          notes: 'lead investor X',
        },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('calculateRoundAmount', () => {
  it('multiplies price by tokens with comma-formatted token counts', () => {
    expect(calculateRoundAmount('0.02', '50,000,000')).toBe('1000000')
  })

  it('parses French-locale comma decimals in the price', () => {
    expect(calculateRoundAmount('0,05', '1,000,000')).toBe('50000')
  })

  it('rounds to cents', () => {
    expect(calculateRoundAmount('0.0000015', '1,234,567')).toBe('1.85')
  })

  it('returns empty when either side is missing or unparsable', () => {
    expect(calculateRoundAmount('', '1000')).toBe('')
    expect(calculateRoundAmount('0.5', '')).toBe('')
    expect(calculateRoundAmount('abc', '1000')).toBe('')
  })
})

describe('summarizeFundingRounds', () => {
  const rounds = [
    {
      round_type: 'seed',
      round_date: '2025-06-01',
      token_price_usd: '0.02',
      tokens_sold: '50,000,000',
      amount_usd: '1000000',
    },
    {
      round_type: 'private',
      round_date: '2026-01-01',
      token_price_usd: '0.05',
      tokens_sold: '20,000,000',
      amount_usd: '1000000',
    },
  ]

  it('totals raised USD and tokens sold across rounds', () => {
    const s = summarizeFundingRounds(rounds, '1,000,000,000')
    expect(s.roundCount).toBe(2)
    expect(s.totalRaisedUsd).toBe(2_000_000)
    expect(s.totalTokensSold).toBe(70_000_000)
  })

  it('derives supply share and implied FDV from the latest round price', () => {
    const s = summarizeFundingRounds(rounds, '1,000,000,000')
    expect(s.pctOfMaxSupply).toBe(7)
    expect(s.latestPriceUsd).toBe(0.05) // the 2026 round beats the 2025 one
    expect(s.impliedFdvUsd).toBe(50_000_000)
  })

  it('degrades cleanly without a max supply', () => {
    const s = summarizeFundingRounds(rounds, '')
    expect(s.pctOfMaxSupply).toBeNull()
    expect(s.impliedFdvUsd).toBeNull()
    expect(s.latestPriceUsd).toBe(0.05)
  })

  it('handles the empty list', () => {
    const s = summarizeFundingRounds([], '1,000')
    expect(s).toEqual({
      roundCount: 0,
      totalRaisedUsd: 0,
      totalTokensSold: 0,
      pctOfMaxSupply: 0,
      latestPriceUsd: null,
      impliedFdvUsd: null,
    })
  })
})

describe('formatFundingRoundTypeLabel', () => {
  it('maps known types and falls back to the raw value', () => {
    expect(formatFundingRoundTypeLabel('pre-seed')).toBe('Pre-seed')
    expect(formatFundingRoundTypeLabel('mystery')).toBe('mystery')
  })
})
