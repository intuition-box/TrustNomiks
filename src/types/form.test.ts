import { describe, it, expect } from 'vitest'
import {
  supplyMetricsSchema,
  allocationsSchema,
  vestingSchedulesSchema,
  tokenIdentitySchema,
  normalizeCategory,
  normalizeSector,
  normalizeSegmentType,
  normalizeVestingFrequency,
} from '@/types/form'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand to find an issue on a specific path in a failed safeParse result. */
function findIssue(
  error: { issues: Array<{ path: (string | number)[]; message: string }> },
  path: (string | number)[]
) {
  return error.issues.find(
    (issue) =>
      issue.path.length === path.length &&
      issue.path.every((segment, i) => segment === path[i])
  )
}

// ===========================================================================
// 1. Supply Metrics Schema
// ===========================================================================

describe('supplyMetricsSchema', () => {
  it('accepts all empty strings (no validation triggered)', () => {
    const result = supplyMetricsSchema.safeParse({
      max_supply: '',
      initial_supply: '',
      tge_supply: '',
      circulating_supply: '',
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid supply values where constraints hold', () => {
    const result = supplyMetricsSchema.safeParse({
      max_supply: '1000000',
      initial_supply: '500000',
      tge_supply: '100000',
      circulating_supply: '900000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects initial_supply > max_supply with error on initial_supply', () => {
    const result = supplyMetricsSchema.safeParse({
      max_supply: '500000',
      initial_supply: '1000000',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['initial_supply'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/initial supply/i)
    }
  })

  it('rejects tge_supply > initial_supply with error on tge_supply', () => {
    const result = supplyMetricsSchema.safeParse({
      initial_supply: '100000',
      tge_supply: '200000',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['tge_supply'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/tge supply/i)
    }
  })

  it('rejects circulating_supply > max_supply with error on circulating_supply', () => {
    const result = supplyMetricsSchema.safeParse({
      max_supply: '1000000',
      circulating_supply: '2000000',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['circulating_supply'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/circulating supply/i)
    }
  })

  it('parses comma-formatted strings correctly (e.g. "1,000,000")', () => {
    const result = supplyMetricsSchema.safeParse({
      max_supply: '1,000,000',
      initial_supply: '500,000',
      tge_supply: '100,000',
      circulating_supply: '900,000',
    })
    expect(result.success).toBe(true)
  })

  it('rejects comma-formatted values when constraint is violated', () => {
    const result = supplyMetricsSchema.safeParse({
      max_supply: '1,000',
      initial_supply: '2,000',
    })
    expect(result.success).toBe(false)
  })

  it('accepts partial data when provided fields are consistent', () => {
    const result = supplyMetricsSchema.safeParse({
      max_supply: '1000000',
      circulating_supply: '500000',
    })
    expect(result.success).toBe(true)
  })

  it('accepts when only max_supply is provided', () => {
    const result = supplyMetricsSchema.safeParse({
      max_supply: '1000000',
    })
    expect(result.success).toBe(true)
  })
})

// ===========================================================================
// 2. Allocations Schema
// ===========================================================================

describe('allocationsSchema', () => {
  const makeSegment = (percentage: string, label = 'Segment', segmentType = 'treasury') => ({
    segment_type: segmentType,
    label,
    percentage,
  })

  it('accepts segments that sum to exactly 100%', () => {
    const result = allocationsSchema.safeParse({
      segments: [
        makeSegment('60', 'Team'),
        makeSegment('40', 'Treasury'),
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects segments summing to 99% (below tolerance)', () => {
    const result = allocationsSchema.safeParse({
      segments: [
        makeSegment('59', 'Team'),
        makeSegment('40', 'Treasury'),
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['segments'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/100%/)
    }
  })

  it('rejects segments summing to 101%', () => {
    const result = allocationsSchema.safeParse({
      segments: [
        makeSegment('61', 'Team'),
        makeSegment('40', 'Treasury'),
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['segments'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/100%/)
    }
  })

  it('accepts segments summing to 99.995% (within 0.01 tolerance)', () => {
    const result = allocationsSchema.safeParse({
      segments: [
        makeSegment('33.335', 'A'),
        makeSegment('33.33', 'B'),
        makeSegment('33.33', 'C'),
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty segments array', () => {
    const result = allocationsSchema.safeParse({
      segments: [],
    })
    expect(result.success).toBe(false)
  })

  it('accepts a single segment at 100%', () => {
    const result = allocationsSchema.safeParse({
      segments: [makeSegment('100', 'Everything')],
    })
    expect(result.success).toBe(true)
  })
})

// ===========================================================================
// 3. Vesting Schedules Schema
// ===========================================================================

describe('vestingSchedulesSchema', () => {
  it('accepts valid cliff_months < duration_months', () => {
    const result = vestingSchedulesSchema.safeParse({
      schedules: {
        alloc1: {
          cliff_months: '3',
          duration_months: '12',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects cliff_months > duration_months with error on cliff_months', () => {
    const result = vestingSchedulesSchema.safeParse({
      schedules: {
        alloc1: {
          cliff_months: '15',
          duration_months: '12',
        },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['schedules', 'alloc1', 'cliff_months'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/cliff/i)
    }
  })

  it('accepts tge_percentage + cliff_unlock_percentage <= 100', () => {
    const result = vestingSchedulesSchema.safeParse({
      schedules: {
        alloc1: {
          tge_percentage: '10',
          cliff_unlock_percentage: '20',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects tge_percentage + cliff_unlock_percentage > 100', () => {
    const result = vestingSchedulesSchema.safeParse({
      schedules: {
        alloc1: {
          tge_percentage: '60',
          cliff_unlock_percentage: '50',
        },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['schedules', 'alloc1', 'tge_percentage'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/100%/)
    }
  })

  it('accepts empty strings for both cliff and duration (not validated)', () => {
    const result = vestingSchedulesSchema.safeParse({
      schedules: {
        alloc1: {
          cliff_months: '',
          duration_months: '',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts when only tge_percentage is provided (cliff_unlock missing)', () => {
    const result = vestingSchedulesSchema.safeParse({
      schedules: {
        alloc1: {
          tge_percentage: '80',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts when only cliff_unlock_percentage is provided (tge missing)', () => {
    const result = vestingSchedulesSchema.safeParse({
      schedules: {
        alloc1: {
          cliff_unlock_percentage: '90',
        },
      },
    })
    expect(result.success).toBe(true)
  })
})

// ===========================================================================
// 4. Token Identity Schema
// ===========================================================================

describe('tokenIdentitySchema', () => {
  it('accepts name + ticker only (minimal required fields)', () => {
    const result = tokenIdentitySchema.safeParse({
      name: 'Ethereum',
      ticker: 'ETH',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing name', () => {
    const result = tokenIdentitySchema.safeParse({
      name: '',
      ticker: 'ETH',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['name'])
      expect(issue).toBeDefined()
    }
  })

  it('rejects missing ticker', () => {
    const result = tokenIdentitySchema.safeParse({
      name: 'Ethereum',
      ticker: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['ticker'])
      expect(issue).toBeDefined()
    }
  })

  it('accepts valid category + compatible sector', () => {
    const result = tokenIdentitySchema.safeParse({
      name: 'Uniswap',
      ticker: 'UNI',
      category: 'financial',
      sector: 'dex',
    })
    expect(result.success).toBe(true)
  })

  it('rejects category without sector', () => {
    const result = tokenIdentitySchema.safeParse({
      name: 'Uniswap',
      ticker: 'UNI',
      category: 'financial',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['sector'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/sector is required/i)
    }
  })

  it('rejects sector without category', () => {
    const result = tokenIdentitySchema.safeParse({
      name: 'Uniswap',
      ticker: 'UNI',
      sector: 'dex',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['category'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/category is required/i)
    }
  })

  it('rejects incompatible category/sector pair', () => {
    const result = tokenIdentitySchema.safeParse({
      name: 'SomeToken',
      ticker: 'STK',
      category: 'financial',
      sector: 'l1', // l1 belongs to infrastructure, not financial
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = findIssue(result.error, ['sector'])
      expect(issue).toBeDefined()
      expect(issue!.message).toMatch(/does not belong/i)
    }
  })

  it('transforms lowercase ticker to uppercase', () => {
    const result = tokenIdentitySchema.safeParse({
      name: 'Ethereum',
      ticker: 'eth',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ticker).toBe('ETH')
    }
  })
})

// ===========================================================================
// 5. Normalizer Functions
// ===========================================================================

describe('normalizeCategory', () => {
  it('returns a valid category as-is', () => {
    expect(normalizeCategory('financial')).toBe('financial')
    expect(normalizeCategory('infrastructure')).toBe('infrastructure')
    expect(normalizeCategory('open-digital-economy')).toBe('open-digital-economy')
    expect(normalizeCategory('payment')).toBe('payment')
    expect(normalizeCategory('two-sided-market')).toBe('two-sided-market')
  })

  it('maps legacy categories to their modern equivalents', () => {
    expect(normalizeCategory('defi')).toBe('financial')
    expect(normalizeCategory('gaming')).toBe('open-digital-economy')
    expect(normalizeCategory('social')).toBe('two-sided-market')
    expect(normalizeCategory('ai')).toBe('infrastructure')
  })

  it('returns null for null or undefined', () => {
    expect(normalizeCategory(null)).toBeNull()
    expect(normalizeCategory(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeCategory('')).toBeNull()
  })

  it('returns null for unrecognized value', () => {
    expect(normalizeCategory('nonexistent')).toBeNull()
  })

  it('handles case insensitivity and whitespace', () => {
    expect(normalizeCategory('  Financial  ')).toBe('financial')
    expect(normalizeCategory('PAYMENT')).toBe('payment')
  })
})

describe('normalizeSector', () => {
  it('returns a valid sector as-is', () => {
    expect(normalizeSector('dex')).toBe('dex')
    expect(normalizeSector('l1')).toBe('l1')
    expect(normalizeSector('bridge')).toBe('bridge')
  })

  it('normalizes underscores to hyphens (slug normalization)', () => {
    expect(normalizeSector('asset_management')).toBe('asset-management')
    expect(normalizeSector('oracle_data')).toBe('oracle-data')
    expect(normalizeSector('derivative_market')).toBe('derivative-market')
  })

  it('returns null for null or undefined', () => {
    expect(normalizeSector(null)).toBeNull()
    expect(normalizeSector(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeSector('')).toBeNull()
  })

  it('returns null for unrecognized value', () => {
    expect(normalizeSector('nonexistent')).toBeNull()
  })
})

describe('normalizeSegmentType', () => {
  it('returns a valid segment type as-is', () => {
    expect(normalizeSegmentType('funding-private')).toBe('funding-private')
    expect(normalizeSegmentType('team-founders')).toBe('team-founders')
    expect(normalizeSegmentType('treasury')).toBe('treasury')
  })

  it('maps legacy segment types to their modern equivalents', () => {
    expect(normalizeSegmentType('team')).toBe('team-founders')
    expect(normalizeSegmentType('advisors')).toBe('team-founders')
    expect(normalizeSegmentType('investors')).toBe('funding-private')
    expect(normalizeSegmentType('private_sale')).toBe('funding-private')
    expect(normalizeSegmentType('public_sale')).toBe('funding-public')
    expect(normalizeSegmentType('community')).toBe('airdrop')
    expect(normalizeSegmentType('ecosystem')).toBe('rewards')
  })

  it('returns null for null or undefined', () => {
    expect(normalizeSegmentType(null)).toBeNull()
    expect(normalizeSegmentType(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeSegmentType('')).toBeNull()
  })

  it('returns null for unrecognized value', () => {
    expect(normalizeSegmentType('nonexistent')).toBeNull()
  })
})

describe('normalizeVestingFrequency', () => {
  it('returns valid frequencies as-is', () => {
    expect(normalizeVestingFrequency('immediate')).toBe('immediate')
    expect(normalizeVestingFrequency('daily')).toBe('daily')
    expect(normalizeVestingFrequency('monthly')).toBe('monthly')
    expect(normalizeVestingFrequency('yearly')).toBe('yearly')
    expect(normalizeVestingFrequency('custom')).toBe('custom')
  })

  it('maps "quarterly" to "yearly"', () => {
    expect(normalizeVestingFrequency('quarterly')).toBe('yearly')
  })

  it('returns "monthly" for null', () => {
    expect(normalizeVestingFrequency(null)).toBe('monthly')
  })

  it('returns "monthly" for undefined', () => {
    expect(normalizeVestingFrequency(undefined)).toBe('monthly')
  })

  it('returns "monthly" for unrecognized value', () => {
    expect(normalizeVestingFrequency('biweekly')).toBe('monthly')
  })
})
