import { describe, expect, it } from 'vitest'

import {
  formatFormNumber,
  normalizeExtraction,
  normalizeSegment,
  normalizeVesting,
} from './normalize'
import type { ExtractedVesting } from './schemas'

const emptyVesting: ExtractedVesting = {
  tge_percentage: null,
  cliff_months: null,
  cliff_unlock_percentage: null,
  duration_months: null,
  frequency: null,
  rate_percent_per_period: null,
  rate_period: null,
  start_offset_months: null,
  notes: null,
}

describe('formatFormNumber', () => {
  it('keeps large integers out of scientific notation', () => {
    expect(formatFormNumber(4_000_000_000)).toBe('4000000000')
  })
  it('trims trailing zeros on decimals', () => {
    expect(formatFormNumber(24.5)).toBe('24.5')
    expect(formatFormNumber(26.79)).toBe('26.79')
    expect(formatFormNumber(10.0)).toBe('10')
  })
})

describe('normalizeVesting', () => {
  it('derives duration from a monthly rate (Jito core contributors)', () => {
    // 1y cliff, 33.3% at cliff, then 2.78%/month: (100-33.3)/2.78 = 24 months
    // of linear vesting after the cliff -> 36 months total from TGE.
    const { vesting, warnings } = normalizeVesting(
      {
        ...emptyVesting,
        tge_percentage: 0,
        cliff_months: 12,
        cliff_unlock_percentage: 33.3,
        rate_percent_per_period: 2.78,
        rate_period: 'month',
      },
      'Core Contributors',
    )
    expect(vesting.duration_months).toBe('36')
    expect(vesting.frequency).toBe('monthly')
    expect(vesting.cliff_unlock_percentage).toBe('33.3')
    expect(warnings).toHaveLength(0)
  })

  it('derives duration from a daily rate (Worldcoin community launch)', () => {
    // 12.5% TGE, then 0.08%/day: 87.5/0.08 = 1093.75 days ~= 36 months.
    const { vesting } = normalizeVesting(
      {
        ...emptyVesting,
        tge_percentage: 12.5,
        cliff_months: 0,
        rate_percent_per_period: 0.08,
        rate_period: 'day',
      },
      'Community Launch',
    )
    expect(vesting.frequency).toBe('daily')
    expect(Number(vesting.duration_months)).toBeGreaterThanOrEqual(35)
    expect(Number(vesting.duration_months)).toBeLessThanOrEqual(37)
  })

  it('folds a start offset into the cliff (Worldcoin TFH Reserve)', () => {
    // Starts 12 months after TGE, 1 year cliff of its own would be modeled
    // by the source as cliff 12 + offset 12.
    const { vesting } = normalizeVesting(
      {
        ...emptyVesting,
        cliff_months: 12,
        duration_months: 36,
        start_offset_months: 12,
        frequency: 'daily',
      },
      'TFH Reserve',
    )
    expect(vesting.cliff_months).toBe('24')
    expect(vesting.duration_months).toBe('48')
    expect(vesting.notes).toContain('after TGE')
  })

  it('warns when a stated duration disagrees with the rate', () => {
    const { warnings } = normalizeVesting(
      {
        ...emptyVesting,
        tge_percentage: 0,
        cliff_months: 0,
        duration_months: 10,
        rate_percent_per_period: 2.78,
        rate_period: 'month',
      },
      'Investors',
    )
    expect(warnings.some((w) => w.includes('disagrees'))).toBe(true)
  })

  it('warns when cliff exceeds duration and when unlocks exceed 100%', () => {
    const { warnings } = normalizeVesting(
      {
        ...emptyVesting,
        tge_percentage: 60,
        cliff_unlock_percentage: 50,
        cliff_months: 24,
        duration_months: 12,
      },
      'Broken',
    )
    expect(warnings.some((w) => w.includes('exceeds total duration'))).toBe(
      true,
    )
    expect(warnings.some((w) => w.includes('exceeds 100%'))).toBe(true)
  })
})

describe('normalizeSegment', () => {
  it('keeps undocumented buckets honest (Jito untracked)', () => {
    const segment = normalizeSegment({
      label: 'Untracked',
      percentage: 49.3,
      token_amount: 492_850_000,
      data_unavailable: true,
      confidence: 'high',
      matched_label: null,
      vesting: {
        ...emptyVesting,
        // Even if the model hallucinated a schedule, data_unavailable wins.
        duration_months: 12,
      },
      notes: null,
    })
    expect(segment.vesting).toBeNull()
    expect(segment.warnings.some((w) => w.includes('undocumented'))).toBe(true)
    expect(segment.token_amount).toBe('492850000')
  })

  it('flags low-confidence labels for review', () => {
    const segment = normalizeSegment({
      label: 'Community (Launch)',
      percentage: 40,
      token_amount: null,
      data_unavailable: false,
      confidence: 'low',
      matched_label: null,
      vesting: null,
      notes: null,
    })
    expect(
      segment.warnings.some((w) => w.includes('low extraction confidence')),
    ).toBe(true)
  })
})

describe('normalizeExtraction', () => {
  it('flags partial allocations but never blocks them', () => {
    const suggestions = normalizeExtraction({
      token_name: 'Big Time',
      token_ticker: 'BIGTIME',
      supply_basis: 'max',
      base_supply: 5_000_000_000,
      segments: [
        {
          label: 'Player Rewards',
          percentage: 60,
          token_amount: null,
          data_unavailable: false,
          confidence: 'high',
          matched_label: null,
          vesting: null,
          notes: null,
        },
      ],
      warnings: [],
    })
    expect(suggestions.warnings.some((w) => w.includes('sum to 60%'))).toBe(
      true,
    )
    expect(suggestions.segments).toHaveLength(1)
  })

  it('surfaces the genesis-supply basis (Celestia)', () => {
    const suggestions = normalizeExtraction({
      token_name: 'Celestia',
      token_ticker: 'TIA',
      supply_basis: 'genesis',
      base_supply: 1_000_000_000,
      segments: [],
      warnings: [],
    })
    expect(
      suggestions.warnings.some((w) => w.includes('genesis/initial supply')),
    ).toBe(true)
    expect(suggestions.baseSupply).toBe('1000000000')
  })
})

describe('enrichment matching (S1.1)', () => {
  const baseSeg = {
    percentage: null,
    token_amount: null,
    data_unavailable: false,
    confidence: 'high' as const,
    vesting: null,
    notes: null,
  }
  const existing = [
    { label: 'Team & Advisors', percentage: 20 },
    { label: 'Early Backers: Seed', percentage: 15.9 },
  ]

  it('accepts a model match against the closed list and keeps the form %', () => {
    const seg = normalizeSegment(
      {
        ...baseSeg,
        label: 'Core Contributors',
        percentage: 19.67,
        matched_label: 'Team & Advisors',
      },
      existing,
    )
    expect(seg.matchedLabel).toBe('Team & Advisors')
    expect(seg.warnings.some((w) => w.includes('is kept'))).toBe(false)
  })

  it('surfaces a rounding gap above tolerance without reconciling it', () => {
    const seg = normalizeSegment(
      {
        ...baseSeg,
        label: 'Core Contributors',
        percentage: 17.6,
        matched_label: 'Team & Advisors',
      },
      existing,
    )
    expect(seg.matchedLabel).toBe('Team & Advisors')
    expect(
      seg.warnings.some((w) => w.includes('your allocation figure is kept')),
    ).toBe(true)
  })

  it('downgrades a match pointing outside the closed list to a new segment', () => {
    const seg = normalizeSegment(
      {
        ...baseSeg,
        label: 'Marketing',
        percentage: 5,
        matched_label: 'Ghost Segment',
      },
      existing,
    )
    expect(seg.matchedLabel).toBeNull()
    expect(seg.warnings.some((w) => w.includes('not in the form'))).toBe(true)
  })

  it('sums only NEW segments when enrichment rows are present', () => {
    const suggestions = normalizeExtraction(
      {
        token_name: null,
        token_ticker: null,
        supply_basis: 'max',
        base_supply: null,
        segments: [
          {
            ...baseSeg,
            label: 'Team',
            percentage: 19.7,
            matched_label: 'Team & Advisors',
          },
          {
            ...baseSeg,
            label: 'Liquidity',
            percentage: 5,
            matched_label: null,
          },
        ],
        warnings: [],
      },
      existing,
    )
    // 5% of new segments is partial and flagged; the 19.7 enrichment is not counted.
    expect(suggestions.warnings.some((w) => w.includes('sum to 5%'))).toBe(true)
  })
})
