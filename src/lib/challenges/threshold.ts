/**
 * Anti-sybil auto-threshold gate for dispute consensus (plan §6.4).
 *
 * Decides whether a dispute's community counter-stake is broad and deep
 * enough to auto-clear without moderator intervention: enough distinct,
 * sufficiently-aged accounts, each staking enough, summing to enough total.
 *
 * Pure by design — no I/O. The caller (consensus gathering) is responsible
 * for reading on-chain vault state, resolving wallets to users, summing
 * per-user stake, and flagging owner/publisher wallets as excluded. This
 * module only evaluates the already-assembled numbers.
 *
 * Caveat: testnet tTRUST is free, so clearing this threshold is a display
 * verdict only (surfaced to moderators/owners), never a data write, and it
 * never gates an on-chain action by itself. Residual sybil risk (e.g. one
 * actor funding several aged wallets) is not solved by this gate — it is
 * documented and left to moderator veto (`moderatorVetoDays`) and the owner
 * response window (`ownerResponseWindowDays`), both enforced elsewhere in
 * `evaluate_stake_threshold_tx`.
 */

export const THRESHOLD_POLICY = {
  minDistinctAccounts: 3, // distinct linked accounts (deduped by user)
  minStakePerAccountTripleCostMultiple: 50, // each counted account must stake >= 50 * getTripleCost()
  minTotalStakeFloorTripleCostMultiple: 25, // and the qualifying total must clear 25 * getTripleCost()
  minAccountAgeHours: 24, // account must be older than this
  ownerResponseWindowDays: 5, // (informational here; enforced in evaluate_stake_threshold_tx)
  moderatorVetoDays: 7, // (informational here; enforced in the RPC)
} as const

/** One already-per-user-aggregated staking account. The caller (consensus
 * gathering) is responsible for grouping wallets by user, summing their stake,
 * and flagging the owner/publisher as excluded — this evaluator does not do I/O. */
export interface StakeAccount {
  userId: string // the deduped identity key
  stakeWei: bigint // total tTRUST (assets) this account has on the DISPUTE (counter) side
  accountAgeHours: number
  isExcluded: boolean // owner / publisher wallets are excluded from the count
}

export interface ThresholdResult {
  met: boolean
  totalStakeWei: bigint // sum of qualifying accounts' stake
  distinctAccounts: number // number of qualifying accounts
  qualifyingAccounts: number // alias for clarity (== distinctAccounts)
  reasons: string[] // human-readable reasons it did/didn't pass
}

/** Collapse possibly-duplicate entries for the same userId into one,
 * conservatively: sum stake, take the minimum age, and exclude the user if
 * ANY of their entries is excluded. */
function dedupeByUser(accounts: StakeAccount[]): StakeAccount[] {
  const byUser = new Map<string, StakeAccount>()

  for (const account of accounts) {
    const existing = byUser.get(account.userId)
    if (!existing) {
      byUser.set(account.userId, { ...account })
      continue
    }
    existing.stakeWei += account.stakeWei
    existing.accountAgeHours = Math.min(
      existing.accountAgeHours,
      account.accountAgeHours,
    )
    existing.isExcluded = existing.isExcluded || account.isExcluded
  }

  return Array.from(byUser.values())
}

export function evaluateAutoThreshold(
  accounts: StakeAccount[],
  tripleCostWei: bigint,
): ThresholdResult {
  const perAccountFloor =
    tripleCostWei *
    BigInt(THRESHOLD_POLICY.minStakePerAccountTripleCostMultiple)
  const totalFloor =
    tripleCostWei *
    BigInt(THRESHOLD_POLICY.minTotalStakeFloorTripleCostMultiple)

  const deduped = dedupeByUser(accounts)

  const qualifying = deduped.filter(
    (account) =>
      !account.isExcluded &&
      account.accountAgeHours >= THRESHOLD_POLICY.minAccountAgeHours &&
      account.stakeWei >= perAccountFloor,
  )

  const distinctAccounts = qualifying.length
  const totalStakeWei = qualifying.reduce(
    (sum, account) => sum + account.stakeWei,
    BigInt(0),
  )

  const reasons: string[] = []

  const hasEnoughAccounts =
    distinctAccounts >= THRESHOLD_POLICY.minDistinctAccounts
  if (!hasEnoughAccounts) {
    reasons.push(
      `Only ${distinctAccounts}/${THRESHOLD_POLICY.minDistinctAccounts} qualifying accounts`,
    )
  }

  const hasEnoughTotal = totalStakeWei >= totalFloor
  if (!hasEnoughTotal) {
    reasons.push(`Total stake ${totalStakeWei} below floor ${totalFloor}`)
  }

  const met = hasEnoughAccounts && hasEnoughTotal

  if (met) {
    reasons.push(
      `Threshold met: ${distinctAccounts} qualifying accounts staking ${totalStakeWei} total`,
    )
  }

  return {
    met,
    totalStakeWei,
    distinctAccounts,
    qualifyingAccounts: distinctAccounts,
    reasons,
  }
}
