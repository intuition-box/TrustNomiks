import { describe, it, expect } from 'vitest'
import {
  buildDefaultAttributions,
  getBulkPillState,
  toggleBulkAttribution,
} from './completeness'
import type { AllocationWithId } from './form-helpers'
import type { ClaimAttribution } from '@/types/form'

const alloc = (id: string, label: string): AllocationWithId => ({
  id,
  segment_type: 'team-founders',
  label,
  percentage: '10',
  token_amount: '1000',
  wallet_address: '',
})

describe('buildDefaultAttributions (reconcile)', () => {
  it('growing the allocation id set from 1 to 7 preserves row 1 selections and adds fresh rows', () => {
    const first = [alloc('a1', 'Team')]
    const initial = buildDefaultAttributions(first)

    // Simulate the user having attributed the first allocation's segment and
    // vesting rows to source index "0" before more allocations existed.
    const withSelection = initial.map((row) =>
      row.claim_id === 'a1' ? { ...row, data_source_ids: ['0'] } : row,
    )

    const grown = [
      alloc('a1', 'Team'),
      alloc('a2', 'Treasury'),
      alloc('a3', 'Marketing'),
      alloc('a4', 'Airdrop'),
      alloc('a5', 'Rewards'),
      alloc('a6', 'Liquidity'),
      alloc('a7', 'Public'),
    ]

    const reconciled = buildDefaultAttributions(grown, withSelection)

    // Fixed claims (identity/supply/emission) + 7 allocation rows + 7 vesting rows.
    expect(reconciled).toHaveLength(2 + 7 + 7 + 1)

    const a1Segment = reconciled.find(
      (r) => r.claim_type === 'allocation_segment' && r.claim_id === 'a1',
    )
    const a1Vesting = reconciled.find(
      (r) => r.claim_type === 'vesting_schedule' && r.claim_id === 'a1',
    )
    expect(a1Segment?.data_source_ids).toEqual(['0'])
    expect(a1Vesting?.data_source_ids).toEqual(['0'])

    // Freshly-added allocations start with no selections.
    for (const id of ['a2', 'a3', 'a4', 'a5', 'a6', 'a7']) {
      const segRow = reconciled.find(
        (r) => r.claim_type === 'allocation_segment' && r.claim_id === id,
      )
      const vestRow = reconciled.find(
        (r) => r.claim_type === 'vesting_schedule' && r.claim_id === id,
      )
      expect(segRow?.data_source_ids).toEqual([])
      expect(vestRow?.data_source_ids).toEqual([])
    }
  })

  it('drops rows for allocation ids that were removed', () => {
    const before = [alloc('a1', 'Team'), alloc('a2', 'Treasury')]
    const initial = buildDefaultAttributions(before).map((row) =>
      row.claim_id === 'a2' ? { ...row, data_source_ids: ['0'] } : row,
    )

    const after = [alloc('a1', 'Team')]
    const reconciled = buildDefaultAttributions(after, initial)

    expect(reconciled.some((r) => r.claim_id === 'a2')).toBe(false)
    expect(reconciled).toHaveLength(2 + 1 + 1 + 1)
  })

  it('is idempotent for an unchanged allocation set', () => {
    const allocations = [alloc('a1', 'Team'), alloc('a2', 'Treasury')]
    const initial = buildDefaultAttributions(allocations).map((row) =>
      row.claim_id === 'a1' ? { ...row, data_source_ids: ['0', '1'] } : row,
    )

    const reconciled = buildDefaultAttributions(allocations, initial)

    expect(reconciled).toEqual(initial)
  })
})

describe('getBulkPillState / toggleBulkAttribution', () => {
  const rows: ClaimAttribution[] = [
    {
      claim_type: 'allocation_segment',
      claim_id: 'a1',
      label: 'Team',
      data_source_ids: ['0'],
    },
    {
      claim_type: 'allocation_segment',
      claim_id: 'a2',
      label: 'Treasury',
      data_source_ids: ['0'],
    },
    {
      claim_type: 'allocation_segment',
      claim_id: 'a3',
      label: 'Marketing',
      data_source_ids: [],
    },
  ]
  const rowIdxs = [0, 1, 2]

  it('reports "all" when every mapped row already has the source', () => {
    const allSelected = rows.map((r) => ({ ...r, data_source_ids: ['0'] }))
    expect(getBulkPillState(allSelected, rowIdxs, '0')).toBe('all')
  })

  it('reports "some" when only part of the mapped rows have the source', () => {
    expect(getBulkPillState(rows, rowIdxs, '0')).toBe('some')
  })

  it('reports "none" when no mapped row has the source', () => {
    expect(getBulkPillState(rows, rowIdxs, '1')).toBe('none')
  })

  it('adds the source to every row missing it when not all rows have it', () => {
    const updated = toggleBulkAttribution(rows, rowIdxs, '0')
    expect(updated.every((r) => r.data_source_ids.includes('0'))).toBe(true)
    // Rows that already had it keep their array untouched (no dupes).
    expect(updated[0].data_source_ids).toEqual(['0'])
  })

  it('removes the source from every row when all rows already have it', () => {
    const allSelected = rows.map((r) => ({ ...r, data_source_ids: ['0'] }))
    const updated = toggleBulkAttribution(allSelected, rowIdxs, '0')
    expect(updated.every((r) => !r.data_source_ids.includes('0'))).toBe(true)
  })

  it('leaves rows outside rowIdxs untouched', () => {
    const withExtra: ClaimAttribution[] = [
      ...rows,
      {
        claim_type: 'vesting_schedule',
        claim_id: 'a1',
        label: 'Vesting: Team',
        data_source_ids: [],
      },
    ]
    const updated = toggleBulkAttribution(withExtra, [0, 1, 2], '0')
    expect(updated[3].data_source_ids).toEqual([])
  })
})
