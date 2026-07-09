import { describe, expect, it } from 'vitest'
import { pickMappingRow, type ClaimMappingRow } from './claim-triple'

function row(
  originRowId: string | null,
  tripleTermId: string | null,
  createdAt: string,
): ClaimMappingRow {
  return {
    origin_row_id: originRowId,
    triple_term_id: tripleTermId,
    created_at: createdAt,
  }
}

describe('pickMappingRow', () => {
  it('returns null for an empty row list', () => {
    expect(pickMappingRow([], 'token_identity', null)).toBeNull()
    expect(pickMappingRow([], 'allocation_segment', 'alloc-1')).toBeNull()
  })

  it('1:1 claim types take the first (newest) row regardless of claimId', () => {
    const rows = [
      row('token-1', '0xaaa', '2026-01-02T00:00:00Z'),
      row('token-1', '0xbbb', '2026-01-01T00:00:00Z'),
    ]
    expect(pickMappingRow(rows, 'token_identity', null)).toBe(rows[0])
    expect(pickMappingRow(rows, 'supply_metrics', null)).toBe(rows[0])
    expect(pickMappingRow(rows, 'emission_model', null)).toBe(rows[0])
  })

  it('row-anchored claim types match by origin_row_id', () => {
    const rows = [
      row('alloc-2', '0xaaa', '2026-01-02T00:00:00Z'),
      row('alloc-1', '0xbbb', '2026-01-01T00:00:00Z'),
    ]
    expect(pickMappingRow(rows, 'allocation_segment', 'alloc-1')).toBe(rows[1])
    expect(pickMappingRow(rows, 'allocation_segment', 'alloc-2')).toBe(rows[0])
  })

  it('row-anchored claim types return null when no row matches the claimId', () => {
    const rows = [row('alloc-2', '0xaaa', '2026-01-02T00:00:00Z')]
    expect(
      pickMappingRow(rows, 'allocation_segment', 'alloc-does-not-exist'),
    ).toBeNull()
  })

  it('vesting_schedule matches by the resolved vesting row id, not the allocation id', () => {
    // origin_row_id here is a vesting_schedules.id (e.g. 'vest-1'), which the
    // caller (resolveChallengeTriple) resolves from the allocation id before
    // calling pickMappingRow — this test exercises that already-resolved id.
    const rows = [
      row('vest-1', '0xaaa', '2026-01-02T00:00:00Z'),
      row('vest-2', '0xbbb', '2026-01-01T00:00:00Z'),
    ]
    expect(pickMappingRow(rows, 'vesting_schedule', 'vest-1')).toBe(rows[0])
    // Matching against the raw (unresolved) allocation id finds nothing.
    expect(pickMappingRow(rows, 'vesting_schedule', 'alloc-1')).toBeNull()
  })

  it('row-anchored claim type with a null claimId falls back to the newest row', () => {
    const rows = [
      row('alloc-2', '0xaaa', '2026-01-02T00:00:00Z'),
      row('alloc-1', '0xbbb', '2026-01-01T00:00:00Z'),
    ]
    expect(pickMappingRow(rows, 'allocation_segment', null)).toBe(rows[0])
  })

  it('an unrecognized claimType falls back to the newest row defensively', () => {
    const rows = [
      row('x', '0xaaa', '2026-01-02T00:00:00Z'),
      row('y', '0xbbb', '2026-01-01T00:00:00Z'),
    ]
    expect(pickMappingRow(rows, 'not_a_real_claim_type', 'x')).toBe(rows[0])
  })
})
