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
import type { Hex, PublicClient } from 'viem'
import { INTUITION_CHAIN, MULTIVAULT_ADDRESS } from './config'
import { batchGetVault } from './read-batcher'

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
