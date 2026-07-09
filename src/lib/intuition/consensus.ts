/**
 * Read-only on-chain consensus snapshot for a disputed claim: the relative
 * stake behind the published claim triple ("for") vs. its counter-triple
 * ("against"). Consumed by GET /api/challenges/[id]/consensus.
 *
 * `getBondingCurveConfig` is read via a local `readContract` ABI subset
 * (mirroring src/lib/intuition/graphql-client.ts's STAKE_READ_ABI) rather
 * than the `@0xintuition/protocol` wrapper `multiVaultGetBondingCurveConfig`:
 * that wrapper's `ReadConfig` requires a full viem `PublicClient`, which is
 * incompatible with the narrower `Pick<PublicClient, 'multicall' |
 * 'readContract'>` this module accepts (so it can be exercised with a stub
 * in tests without constructing a real client).
 */

import { createPublicClient, http, parseAbi } from 'viem'
import type { Address, Hex, PublicClient } from 'viem'
import type { StakeAccount } from '@/lib/challenges/threshold'
import { INTUITION_CHAIN, MULTIVAULT_ADDRESS } from './config'
import { batchGetVault, intuitionReadAbi } from './read-batcher'
import type { MinimalSupabaseClient } from './claim-triple'

const CURVE_CONFIG_ABI = parseAbi([
  'function getBondingCurveConfig() view returns ((address registry, uint256 defaultCurveId))',
])

export interface ConsensusSide {
  totalAssetsWei: string
  totalShares: string
}

export interface ConsensusSnapshot {
  /** false when the claim has no on-chain triple yet (not disputable on-chain). */
  published: boolean
  tripleTermId: string | null
  counterTermId: string | null
  curveId: string | null
  /** The claim triple vault (support). */
  for: ConsensusSide | null
  /** The counter-triple vault (dispute). */
  against: ConsensusSide | null
  fetchedAt: string
}

const ZERO_SIDE: ConsensusSide = { totalAssetsWei: '0', totalShares: '0' }

function unpublishedSnapshot(): ConsensusSnapshot {
  return {
    published: false,
    tripleTermId: null,
    counterTermId: null,
    curveId: null,
    for: null,
    against: null,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Defensively extract `defaultCurveId` from the raw `readContract` result.
 * viem decodes a single named-tuple return as an object with the component
 * names as keys, but this mirrors graphql-client.ts's equivalent helper for
 * `getBondingCurveConfig` in case a given RPC client instead returns the
 * positional array form.
 */
function defaultCurveIdFromResult(result: unknown): bigint {
  if (
    typeof result === 'object' &&
    result !== null &&
    'defaultCurveId' in result
  ) {
    return (result as { defaultCurveId: bigint }).defaultCurveId
  }
  if (Array.isArray(result) && typeof result[1] === 'bigint') {
    return result[1]
  }
  throw new Error('Unable to read Intuition default bonding curve id')
}

export async function fetchConsensusSnapshot(
  resolved: { tripleTermId: Hex; counterTermId: Hex } | null,
  publicClient: Pick<
    PublicClient,
    'multicall' | 'readContract'
  > = createPublicClient({ chain: INTUITION_CHAIN, transport: http() }),
): Promise<ConsensusSnapshot> {
  if (resolved === null) {
    return unpublishedSnapshot()
  }

  const { tripleTermId, counterTermId } = resolved

  const curveConfig = await publicClient.readContract({
    address: MULTIVAULT_ADDRESS,
    abi: CURVE_CONFIG_ABI,
    functionName: 'getBondingCurveConfig',
  })
  const curveId = defaultCurveIdFromResult(curveConfig)

  const vaults = await batchGetVault(
    publicClient,
    [tripleTermId, counterTermId],
    curveId,
    { failureMode: 'assumeZero' },
  )

  const toSide = (termId: Hex): ConsensusSide => {
    const vault = vaults.get(termId.toLowerCase() as Hex)
    if (!vault) return ZERO_SIDE
    return {
      totalAssetsWei: vault.totalAssets.toString(),
      totalShares: vault.totalShares.toString(),
    }
  }

  return {
    published: true,
    tripleTermId,
    counterTermId,
    curveId: curveId.toString(),
    for: toSide(tripleTermId),
    against: toSide(counterTermId),
    fetchedAt: new Date().toISOString(),
  }
}

// ── gatherDisputeAccounts ────────────────────────────────────────────────────

/**
 * Gathers the per-account dispute (counter-side) stake feeding
 * `evaluateAutoThreshold` (src/lib/challenges/threshold.ts).
 *
 * The auto-threshold only counts LINKED accounts, so the countable staker set
 * is exactly the users the app itself recorded staking on this challenge
 * (`challenge_events` rows with `event_type = 'stake_recorded'`) — not every
 * wallet holding counter-triple shares. For each such user we resolve their
 * currently-linked wallets (`wallet_links`, `unlinked_at IS NULL`) and read
 * their on-chain position on the counter-triple.
 *
 * GraphQL indexer positions are intentionally NOT unioned in here for MVP:
 * they would only surface additional non-linked wallets, and those are
 * excluded by policy regardless (plan §6.4 / B2), so folding them in would
 * add a second data source without changing the result.
 */
export interface DisputeAccountsInput {
  challengeId: string
  counterTermId: Hex
  curveId: bigint
  /** Owner (+ publisher) user ids to flag isExcluded. */
  excludedUserIds: string[]
  /** Date.now() from the caller, so age math stays testable. */
  nowMs: number
}

interface ChallengeEventActorRow {
  actor_id: string | null
  created_at: string
}

interface WalletLinkRow {
  user_id: string
  wallet_address: string
  linked_at: string
}

const MS_PER_HOUR = 3_600_000

export async function gatherDisputeAccounts(
  supabase: MinimalSupabaseClient,
  input: DisputeAccountsInput,
  publicClient: Pick<
    PublicClient,
    'multicall' | 'readContract'
  > = createPublicClient({ chain: INTUITION_CHAIN, transport: http() }),
): Promise<StakeAccount[]> {
  const { challengeId, counterTermId, curveId, excludedUserIds, nowMs } = input

  // 1. App-recorded stakers for this challenge (actor_id NULL = system, skip).
  const { data: events, error: eventsError } = await supabase
    .from('challenge_events')
    .select('actor_id, created_at')
    .eq('challenge_id', challengeId)
    .eq('event_type', 'stake_recorded')

  if (eventsError || !events) {
    return []
  }

  const stakerIds = Array.from(
    new Set(
      (events as ChallengeEventActorRow[])
        .map((event) => event.actor_id)
        .filter((actorId): actorId is string => actorId !== null),
    ),
  )

  if (stakerIds.length === 0) {
    return []
  }

  // 2. Each staker's currently-linked wallets, tracking the earliest
  // linked_at per user for accountAgeHours.
  const { data: walletRows, error: walletsError } = await supabase
    .from('wallet_links')
    .select('user_id, wallet_address, linked_at')
    .in('user_id', stakerIds)
    .is('unlinked_at', null)

  if (walletsError || !walletRows) {
    return []
  }

  const walletsByUser = new Map<string, Address[]>()
  const earliestLinkedAtMsByUser = new Map<string, number>()

  for (const row of walletRows as WalletLinkRow[]) {
    const wallets = walletsByUser.get(row.user_id) ?? []
    wallets.push(row.wallet_address as Address)
    walletsByUser.set(row.user_id, wallets)

    const linkedAtMs = new Date(row.linked_at).getTime()
    const earliest = earliestLinkedAtMsByUser.get(row.user_id)
    if (earliest === undefined || linkedAtMs < earliest) {
      earliestLinkedAtMsByUser.set(row.user_id, linkedAtMs)
    }
  }

  const allWallets = Array.from(
    new Set(Array.from(walletsByUser.values()).flat()),
  )

  if (allWallets.length === 0) {
    return []
  }

  // 3. Read the counter-triple vault totals once, and every wallet's raw
  // share balance on that same vault, via multicall.
  const vaults = await batchGetVault(publicClient, [counterTermId], curveId, {
    failureMode: 'assumeZero',
  })
  const vault = vaults.get(counterTermId.toLowerCase() as Hex) ?? {
    totalAssets: BigInt(0),
    totalShares: BigInt(0),
  }

  // Not using the `@0xintuition/protocol` wrapper `multiVaultGetShares` here
  // for the same reason `fetchConsensusSnapshot` avoids
  // `multiVaultGetBondingCurveConfig` (see module comment above): its
  // `ReadConfig` requires a full viem `PublicClient`, incompatible with this
  // module's narrower `Pick<PublicClient, 'multicall' | 'readContract'>`
  // parameter. `intuitionReadAbi` (from read-batcher.ts) already declares
  // `getShares`, so a single multicall across all wallets reuses it directly
  // instead of one RPC round-trip per wallet.
  const sharesByWallet = new Map<Address, bigint>()
  const CHUNK_SIZE = 100

  try {
    for (let i = 0; i < allWallets.length; i += CHUNK_SIZE) {
      const chunk = allWallets.slice(i, i + CHUNK_SIZE)

      const multicallResult = await publicClient.multicall({
        allowFailure: true,
        contracts: chunk.map((wallet) => ({
          address: MULTIVAULT_ADDRESS,
          abi: intuitionReadAbi,
          functionName: 'getShares',
          args: [wallet, counterTermId, curveId],
        })),
      })

      for (let j = 0; j < chunk.length; j++) {
        const callResult = multicallResult[j]
        if (callResult.status === 'success') {
          sharesByWallet.set(chunk[j], callResult.result as unknown as bigint)
        }
        // Failed reads are left unset and default to 0 below — resilience
        // over completeness, this is a display-verdict input only.
      }
    }
  } catch (error) {
    console.warn(
      'gatherDisputeAccounts: getShares multicall failed entirely; wallets default to zero stake',
      error instanceof Error ? error.message : error,
    )
  }

  // 4/5. Aggregate per user: sum wallets' proportional assets, take the
  // earliest linked_at for age, flag exclusions, and drop zero-stake users.
  const accounts: StakeAccount[] = []

  for (const userId of stakerIds) {
    const wallets = walletsByUser.get(userId)
    if (!wallets || wallets.length === 0) continue

    let stakeWei = BigInt(0)
    for (const wallet of wallets) {
      const shares = sharesByWallet.get(wallet) ?? BigInt(0)
      // Proportional shares->assets conversion (shares * totalAssets /
      // totalShares). An acceptable approximation for a display-verdict
      // threshold; an exact per-wallet convertToAssets read is unnecessary
      // here.
      const assets =
        vault.totalShares === BigInt(0)
          ? BigInt(0)
          : (shares * vault.totalAssets) / vault.totalShares
      stakeWei += assets
    }

    if (stakeWei === BigInt(0)) continue // no live position

    const earliestLinkedAtMs = earliestLinkedAtMsByUser.get(userId)
    const accountAgeHours =
      earliestLinkedAtMs === undefined
        ? 0
        : Math.floor((nowMs - earliestLinkedAtMs) / MS_PER_HOUR)

    accounts.push({
      userId,
      stakeWei,
      accountAgeHours,
      isExcluded: excludedUserIds.includes(userId),
    })
  }

  return accounts
}
