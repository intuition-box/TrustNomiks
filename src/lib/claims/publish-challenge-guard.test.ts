import { describe, it, expect } from 'vitest'
import type { TriplePlanItem } from '@/lib/intuition/types'
import {
  buildChallengeMatchContext,
  isTripleChallenged,
  vestingAllocationIdsOf,
  REVERSE_FIELD_MAP,
  type OpenChallengeRow,
  type VestingRow,
} from './publish-challenge-guard'

// Minimal TriplePlanItem — only the fields the matcher reads matter; the rest
// are filled with inert placeholders.
function mkTriple(
  partial: Pick<
    TriplePlanItem,
    'claimGroup' | 'originRowId' | 'predicateAtomId'
  > & {
    tripleId?: string
  },
): TriplePlanItem {
  return {
    tripleId: partial.tripleId ?? `triple:${partial.predicateAtomId}`,
    claimGroup: partial.claimGroup,
    originRowId: partial.originRowId,
    subjectAtomId: 'atom:token:t1',
    predicateAtomId: partial.predicateAtomId,
    objectAtomId: 'atom:lit:x',
    subjectTermId: '0x00',
    predicateTermId: '0x00',
    objectTermId: '0x00',
    computedTripleTermId: '0x00',
    exists: false,
  }
}

const ctx = (challenges: OpenChallengeRow[], vesting: VestingRow[] = []) =>
  buildChallengeMatchContext(challenges, vesting)

describe('REVERSE_FIELD_MAP', () => {
  it('maps identity + supply predicates back to field keys', () => {
    expect(REVERSE_FIELD_MAP.token_identity.has_name).toBe('name')
    expect(REVERSE_FIELD_MAP.token_identity.has_contract_address).toBe(
      'contract_address',
    )
    expect(REVERSE_FIELD_MAP.supply_metrics.has_max_supply).toBe('max_supply')
  })

  it('is empty for the claim types whose fields have no registry predicate', () => {
    expect(REVERSE_FIELD_MAP.emission_model).toEqual({})
    expect(REVERSE_FIELD_MAP.allocation_segment).toEqual({})
    expect(REVERSE_FIELD_MAP.vesting_schedule).toEqual({})
  })
})

describe('isTripleChallenged — token_identity / supply_metrics (field-level)', () => {
  const nameChallenge: OpenChallengeRow = {
    claim_type: 'token_identity',
    claim_id: null,
    field_key: 'name',
  }

  it('excludes exactly the challenged field, not its siblings', () => {
    const c = ctx([nameChallenge])
    const nameTriple = mkTriple({
      claimGroup: 'token_identity',
      originRowId: 't1',
      predicateAtomId: 'atom:predicate:has_name',
    })
    const tickerTriple = mkTriple({
      claimGroup: 'token_identity',
      originRowId: 't1',
      predicateAtomId: 'atom:predicate:has_ticker',
    })
    expect(isTripleChallenged(nameTriple, c)).toBe(true)
    expect(isTripleChallenged(tickerTriple, c)).toBe(false)
  })

  it('never excludes a non-challengeable predicate (has_status) that has no field', () => {
    const c = ctx([nameChallenge])
    const statusTriple = mkTriple({
      claimGroup: 'token_identity',
      originRowId: 't1',
      predicateAtomId: 'atom:predicate:has_status',
    })
    expect(isTripleChallenged(statusTriple, c)).toBe(false)
  })

  it('matches supply_metrics fields independently of identity', () => {
    const c = ctx([
      { claim_type: 'supply_metrics', claim_id: null, field_key: 'max_supply' },
    ])
    const maxSupply = mkTriple({
      claimGroup: 'supply_metrics',
      originRowId: 't1',
      predicateAtomId: 'atom:predicate:has_max_supply',
    })
    const initSupply = mkTriple({
      claimGroup: 'supply_metrics',
      originRowId: 't1',
      predicateAtomId: 'atom:predicate:has_initial_supply',
    })
    expect(isTripleChallenged(maxSupply, c)).toBe(true)
    expect(isTripleChallenged(initSupply, c)).toBe(false)
  })
})

describe('isTripleChallenged — emission_model (coarse / claim-level)', () => {
  it('excludes any emission triple when an emission challenge is open', () => {
    const c = ctx([
      {
        claim_type: 'emission_model',
        claim_id: null,
        field_key: 'annual_inflation_rate',
      },
    ])
    const inflation = mkTriple({
      claimGroup: 'emission_model',
      originRowId: 'e1',
      predicateAtomId: 'atom:predicate:has_annual_inflation_rate',
    })
    expect(isTripleChallenged(inflation, c)).toBe(true)
  })

  it('does not touch emission triples when no emission challenge is open', () => {
    const c = ctx([
      { claim_type: 'token_identity', claim_id: null, field_key: 'name' },
    ])
    const inflation = mkTriple({
      claimGroup: 'emission_model',
      originRowId: 'e1',
      predicateAtomId: 'atom:predicate:has_annual_inflation_rate',
    })
    expect(isTripleChallenged(inflation, c)).toBe(false)
  })
})

describe('isTripleChallenged — allocation_segment (row-level via claim_id)', () => {
  it('excludes every value triple of the challenged segment, none of a sibling', () => {
    const c = ctx([
      {
        claim_type: 'allocation_segment',
        claim_id: 'seg-A',
        field_key: 'percentage',
      },
    ])
    const pctA = mkTriple({
      claimGroup: 'allocation_segment',
      originRowId: 'seg-A',
      predicateAtomId: 'atom:predicate:has_percentage',
    })
    const amountA = mkTriple({
      claimGroup: 'allocation_segment',
      originRowId: 'seg-A',
      predicateAtomId: 'atom:predicate:has_token_amount',
    })
    const pctB = mkTriple({
      claimGroup: 'allocation_segment',
      originRowId: 'seg-B',
      predicateAtomId: 'atom:predicate:has_percentage',
    })
    expect(isTripleChallenged(pctA, c)).toBe(true)
    expect(isTripleChallenged(amountA, c)).toBe(true)
    expect(isTripleChallenged(pctB, c)).toBe(false)
  })
})

describe('isTripleChallenged — vesting_schedule (row-level via allocation_id -> vesting id)', () => {
  const vestingChallenge: OpenChallengeRow = {
    claim_type: 'vesting_schedule',
    claim_id: 'alloc-1', // the challenge stores the ALLOCATION id
    field_key: 'cliff_months',
  }
  // vesting_schedules rows: id is what the plan triple is keyed by
  const vestingRows: VestingRow[] = [
    { id: 'vest-1', allocation_id: 'alloc-1' },
    { id: 'vest-2', allocation_id: 'alloc-2' },
  ]

  it('vestingAllocationIdsOf surfaces the allocation ids to resolve', () => {
    expect(vestingAllocationIdsOf([vestingChallenge])).toEqual(['alloc-1'])
  })

  it('excludes the vesting triple whose row resolves from the challenged allocation', () => {
    const c = ctx([vestingChallenge], vestingRows)
    const cliffV1 = mkTriple({
      claimGroup: 'vesting_schedule',
      originRowId: 'vest-1',
      predicateAtomId: 'atom:predicate:has_cliff_months',
    })
    const cliffV2 = mkTriple({
      claimGroup: 'vesting_schedule',
      originRowId: 'vest-2',
      predicateAtomId: 'atom:predicate:has_cliff_months',
    })
    expect(isTripleChallenged(cliffV1, c)).toBe(true)
    expect(isTripleChallenged(cliffV2, c)).toBe(false)
  })

  it('excludes nothing when the vesting rows are not resolved', () => {
    const c = ctx([vestingChallenge], [])
    const cliffV1 = mkTriple({
      claimGroup: 'vesting_schedule',
      originRowId: 'vest-1',
      predicateAtomId: 'atom:predicate:has_cliff_months',
    })
    expect(isTripleChallenged(cliffV1, c)).toBe(false)
  })
})

describe('isTripleChallenged — edge cases', () => {
  it('returns false for a triple with no claimGroup', () => {
    const c = ctx([
      { claim_type: 'token_identity', claim_id: null, field_key: 'name' },
    ])
    const orphan = mkTriple({
      claimGroup: null,
      originRowId: null,
      predicateAtomId: 'atom:predicate:has_name',
    })
    expect(isTripleChallenged(orphan, c)).toBe(false)
  })

  it('returns false for every triple when there are no open challenges', () => {
    const c = ctx([])
    const nameTriple = mkTriple({
      claimGroup: 'token_identity',
      originRowId: 't1',
      predicateAtomId: 'atom:predicate:has_name',
    })
    expect(isTripleChallenged(nameTriple, c)).toBe(false)
  })
})
