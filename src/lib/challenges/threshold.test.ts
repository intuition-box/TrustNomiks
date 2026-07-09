import { describe, it, expect } from 'vitest'
import {
  evaluateAutoThreshold,
  THRESHOLD_POLICY,
  type StakeAccount,
} from './threshold'

/** Builds a qualifying-by-default account so each test only overrides what it's testing. */
function makeAccount(
  overrides: Partial<StakeAccount> & { userId: string },
): StakeAccount {
  return {
    stakeWei: BigInt(0),
    accountAgeHours: THRESHOLD_POLICY.minAccountAgeHours,
    isExcluded: false,
    ...overrides,
  }
}

describe('evaluateAutoThreshold', () => {
  const tripleCostWei = BigInt(1000)
  const perAccountFloor =
    tripleCostWei *
    BigInt(THRESHOLD_POLICY.minStakePerAccountTripleCostMultiple) // 50,000
  const totalFloor =
    tripleCostWei *
    BigInt(THRESHOLD_POLICY.minTotalStakeFloorTripleCostMultiple) // 25,000

  it('is not met for an empty account list, with zero distinct accounts and zero stake', () => {
    const result = evaluateAutoThreshold([], tripleCostWei)
    expect(result.met).toBe(false)
    expect(result.distinctAccounts).toBe(0)
    expect(result.qualifyingAccounts).toBe(0)
    expect(result.totalStakeWei).toBe(BigInt(0))
  })

  it('is met when exactly 3 distinct accounts each clear the per-account floor', () => {
    const accounts: StakeAccount[] = [
      makeAccount({ userId: 'user-1', stakeWei: perAccountFloor }),
      makeAccount({ userId: 'user-2', stakeWei: perAccountFloor }),
      makeAccount({ userId: 'user-3', stakeWei: perAccountFloor }),
    ]

    const result = evaluateAutoThreshold(accounts, tripleCostWei)

    expect(result.met).toBe(true)
    expect(result.distinctAccounts).toBe(3)
    expect(result.qualifyingAccounts).toBe(3)
    expect(result.totalStakeWei).toBe(perAccountFloor * BigInt(3))
    expect(result.totalStakeWei >= totalFloor).toBe(true)
    // A success reason is reported, not just silence.
    expect(result.reasons.some((r) => r.toLowerCase().includes('met'))).toBe(
      true,
    )
  })

  it('excludes the owner/publisher account, leaving only 2 qualifying accounts and failing the count gate', () => {
    // 3 accounts individually clear every other gate, but one is the owner
    // (isExcluded), so only 2 count toward the distinct-accounts minimum of 3.
    const accounts: StakeAccount[] = [
      makeAccount({ userId: 'user-1', stakeWei: perAccountFloor }),
      makeAccount({ userId: 'user-2', stakeWei: perAccountFloor }),
      makeAccount({
        userId: 'owner',
        stakeWei: perAccountFloor,
        isExcluded: true,
      }),
    ]

    const result = evaluateAutoThreshold(accounts, tripleCostWei)

    expect(result.met).toBe(false)
    expect(result.distinctAccounts).toBe(2)
    expect(result.totalStakeWei).toBe(perAccountFloor * BigInt(2))
    expect(result.reasons.some((r) => r.includes('2/3'))).toBe(true)
  })

  it('drops an account whose stake sits below the per-account floor', () => {
    const accounts: StakeAccount[] = [
      makeAccount({ userId: 'user-1', stakeWei: perAccountFloor }),
      makeAccount({ userId: 'user-2', stakeWei: perAccountFloor }),
      // One wei short of the floor — must not count.
      makeAccount({ userId: 'user-3', stakeWei: perAccountFloor - BigInt(1) }),
    ]

    const result = evaluateAutoThreshold(accounts, tripleCostWei)

    expect(result.met).toBe(false)
    expect(result.distinctAccounts).toBe(2)
    expect(result.totalStakeWei).toBe(perAccountFloor * BigInt(2))
  })

  it('drops an account younger than the minimum account age', () => {
    const accounts: StakeAccount[] = [
      makeAccount({ userId: 'user-1', stakeWei: perAccountFloor }),
      makeAccount({ userId: 'user-2', stakeWei: perAccountFloor }),
      makeAccount({
        userId: 'user-3',
        stakeWei: perAccountFloor,
        accountAgeHours: THRESHOLD_POLICY.minAccountAgeHours - 1,
      }),
    ]

    const result = evaluateAutoThreshold(accounts, tripleCostWei)

    expect(result.met).toBe(false)
    expect(result.distinctAccounts).toBe(2)
  })

  it('accepts an account exactly at the minimum age boundary (>=, not >)', () => {
    const accounts: StakeAccount[] = [
      makeAccount({ userId: 'user-1', stakeWei: perAccountFloor }),
      makeAccount({ userId: 'user-2', stakeWei: perAccountFloor }),
      makeAccount({
        userId: 'user-3',
        stakeWei: perAccountFloor,
        accountAgeHours: THRESHOLD_POLICY.minAccountAgeHours, // exactly 24, not 25
      }),
    ]

    const result = evaluateAutoThreshold(accounts, tripleCostWei)

    expect(result.met).toBe(true)
    expect(result.distinctAccounts).toBe(3)
  })

  it('dedupes duplicate entries for the same userId by summing their stake', () => {
    // Neither entry alone clears the per-account floor, but the caller
    // (defensively) sent two rows for the same user — combined they qualify.
    const half = perAccountFloor / BigInt(2)
    const accounts: StakeAccount[] = [
      makeAccount({ userId: 'user-1', stakeWei: half }),
      makeAccount({ userId: 'user-1', stakeWei: half }),
      makeAccount({ userId: 'user-2', stakeWei: perAccountFloor }),
      makeAccount({ userId: 'user-3', stakeWei: perAccountFloor }),
    ]

    const result = evaluateAutoThreshold(accounts, tripleCostWei)

    expect(result.distinctAccounts).toBe(3)
    expect(result.met).toBe(true)
    expect(result.totalStakeWei).toBe(
      half * BigInt(2) + perAccountFloor * BigInt(2),
    )
  })

  it('dedupes duplicate entries for the same userId by taking the minimum (most conservative) age', () => {
    // One row looks old enough, the other doesn't — the conservative (younger)
    // age wins, so this user must be dropped for age even though one row
    // individually looked fine.
    const accounts: StakeAccount[] = [
      makeAccount({
        userId: 'user-1',
        stakeWei: perAccountFloor,
        accountAgeHours: 100,
      }),
      makeAccount({
        userId: 'user-1',
        stakeWei: perAccountFloor,
        accountAgeHours: THRESHOLD_POLICY.minAccountAgeHours - 1,
      }),
      makeAccount({ userId: 'user-2', stakeWei: perAccountFloor }),
      makeAccount({ userId: 'user-3', stakeWei: perAccountFloor }),
    ]

    const result = evaluateAutoThreshold(accounts, tripleCostWei)

    expect(result.distinctAccounts).toBe(2)
    expect(result.met).toBe(false)
  })

  it('dedupes duplicate entries for the same userId by excluding the user if any entry is excluded', () => {
    // A user's non-excluded row would clear every gate on its own, but a
    // second row for the same user is flagged as owner/publisher — the user
    // as a whole must be excluded.
    const accounts: StakeAccount[] = [
      makeAccount({
        userId: 'user-1',
        stakeWei: perAccountFloor,
        isExcluded: false,
      }),
      makeAccount({
        userId: 'user-1',
        stakeWei: perAccountFloor,
        isExcluded: true,
      }),
      makeAccount({ userId: 'user-2', stakeWei: perAccountFloor }),
      makeAccount({ userId: 'user-3', stakeWei: perAccountFloor }),
    ]

    const result = evaluateAutoThreshold(accounts, tripleCostWei)

    expect(result.distinctAccounts).toBe(2)
    expect(result.met).toBe(false)
  })

  it('computes the per-account and total floors precisely from tripleCostWei (arithmetic check)', () => {
    // A non-round tripleCostWei so the multiplication isn't trivially
    // eyeballed: perAccountFloor = 777 * 50 = 38,850; totalFloor = 777 * 25 = 19,425.
    const cost = BigInt(777)
    const floor = cost * BigInt(50)
    expect(floor).toBe(BigInt(38_850))

    const accounts: StakeAccount[] = [
      makeAccount({ userId: 'user-1', stakeWei: floor }),
      makeAccount({ userId: 'user-2', stakeWei: floor }),
      makeAccount({ userId: 'user-3', stakeWei: floor }),
    ]

    const result = evaluateAutoThreshold(accounts, cost)

    expect(result.totalStakeWei).toBe(BigInt(116_550)) // 3 * 38,850
    expect(result.totalStakeWei >= cost * BigInt(25)).toBe(true) // clears the 19,425 total floor
    expect(result.met).toBe(true)
  })

  it('populates the reasons array with both gate failures when no account qualifies', () => {
    const result = evaluateAutoThreshold(
      [makeAccount({ userId: 'user-1', stakeWei: BigInt(1) })],
      tripleCostWei,
    )

    expect(result.met).toBe(false)
    expect(result.reasons.length).toBeGreaterThanOrEqual(2)
    expect(result.reasons.some((r) => r.includes('0/3'))).toBe(true)
    expect(
      result.reasons.some((r) => r.toLowerCase().includes('below floor')),
    ).toBe(true)
  })
})
