/**
 * Batched RPC read helpers for Intuition Protocol.
 *
 * Replaces per-item `multiVaultIsTermCreated` / `readContract` calls with
 * `publicClient.multicall` to reduce RPC round-trips during the publish pipeline.
 */

import { parseAbi } from 'viem'
import type { Hex, PublicClient } from 'viem'
import { MULTIVAULT_ADDRESS } from './config'

// ── ABI (centralized) ────────────────────────────────────────────────────────

export const intuitionReadAbi = parseAbi([
  'function isTermCreated(bytes32 id) view returns (bool)',
  'function getAtomCost() view returns (uint256)',
  'function getTripleCost() view returns (uint256)',
  'function getGeneralConfig() view returns ((address admin, address protocolMultisig, uint256 feeDenominator, address trustBonding, uint256 minDeposit, uint256 minShare, uint256 atomDataMaxLength, uint256 feeThreshold))',
  'function previewAtomCreate(bytes32 termId, uint256 assets) view returns (uint256 shares, uint256 assetsAfterFixedFees, uint256 assetsAfterFees)',
  'function previewTripleCreate(bytes32 termId, uint256 assets) view returns (uint256 shares, uint256 assetsAfterFixedFees, uint256 assetsAfterFees)',
])

// ── Types ────────────────────────────────────────────────────────────────────

export type MulticallCapableClient = Pick<PublicClient, 'multicall' | 'readContract'>

type FailureMode = 'throw' | 'assumeExists' | 'assumeMissing'

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 100

/** Protocol fallback values when on-chain config reads fail. */
const FALLBACK_ATOM_COST = BigInt('400000000000000')
const FALLBACK_TRIPLE_COST = BigInt('400000000000000')
const FALLBACK_EXTRA_DEPOSIT = BigInt(0)

// ── Internal helper ──────────────────────────────────────────────────────────

function applyTermFailure(
  result: Map<Hex, boolean>,
  termId: Hex,
  failureMode: FailureMode,
  error: unknown,
): void {
  switch (failureMode) {
    case 'assumeExists':
      result.set(termId, true)
      return
    case 'assumeMissing':
      result.set(termId, false)
      return
    case 'throw':
      throw new Error(
        `isTermCreated multicall failed for termId ${termId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
  }
}

// ── batchIsTermCreated ───────────────────────────────────────────────────────

/**
 * Batch-check whether term IDs exist on-chain via a single multicall.
 *
 * Deduplicates term IDs before the RPC and chunks large lists automatically.
 * Results are returned as a `Map<Hex, boolean>` so callers can remap back to
 * their original items.
 *
 * Handles both per-item multicall failures and complete chunk rejections.
 * When an entire chunk RPC fails, the configured failureMode is applied
 * to every termId in that chunk.
 */
export async function batchIsTermCreated(
  publicClient: MulticallCapableClient,
  termIds: Hex[],
  options?: {
    chunkSize?: number
    failureMode?: FailureMode
  },
): Promise<Map<Hex, boolean>> {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE
  const failureMode = options?.failureMode ?? 'throw'

  // Deduplicate before RPC
  const unique = Array.from(new Set(termIds.map((id) => id.toLowerCase() as Hex)))

  if (unique.length === 0) {
    return new Map()
  }

  const result = new Map<Hex, boolean>()

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)

    try {
      const multicallResult = await publicClient.multicall({
        allowFailure: true,
        contracts: chunk.map((termId) => ({
          address: MULTIVAULT_ADDRESS,
          abi: intuitionReadAbi,
          functionName: 'isTermCreated',
          args: [termId],
        })),
      })

      for (let j = 0; j < chunk.length; j++) {
        const callResult = multicallResult[j]
        const termId = chunk[j]

        if (callResult.status === 'success') {
          result.set(termId, callResult.result as unknown as boolean)
        } else {
          applyTermFailure(result, termId, failureMode, callResult.error)
        }
      }
    } catch (error) {
      console.warn(
        `isTermCreated multicall chunk failed for ${chunk.length} term(s); applying ${failureMode}`,
        error instanceof Error ? error.message : error,
      )
      for (const termId of chunk) {
        applyTermFailure(result, termId, failureMode, error)
      }
    }
  }

  return result
}

// ── batchPreviewAtomCreates ──────────────────────────────────────────────────

/**
 * Batch-preview atom creation for all items to be created.
 *
 * Throws if any preview fails or if a non-zero deposit would mint zero shares.
 */
export async function batchPreviewAtomCreates(
  publicClient: MulticallCapableClient,
  items: Array<{
    id: string
    termId: Hex
    assets: bigint
  }>,
  options?: { chunkSize?: number },
): Promise<void> {
  if (items.length === 0) return

  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)

    const multicallResult = await publicClient.multicall({
      allowFailure: true,
      contracts: chunk.map((item) => ({
        address: MULTIVAULT_ADDRESS,
        abi: intuitionReadAbi,
        functionName: 'previewAtomCreate',
        args: [item.termId, item.assets],
      })),
    })

    for (let j = 0; j < chunk.length; j++) {
      const callResult = multicallResult[j]
      const item = chunk[j]

      if (callResult.status !== 'success') {
        throw new Error(
          `Atom creation preview failed for ${item.id} (${item.termId})`,
        )
      }

      // ABI returns (uint256 shares, uint256 assetsAfterFixedFees, uint256 assetsAfterFees)
      const [shares, assetsAfterFixedFees] = callResult.result as unknown as [
        bigint,
        bigint,
        bigint,
      ]

      if (assetsAfterFixedFees > BigInt(0) && shares === BigInt(0)) {
        throw new Error(
          `Atom creation preview mints zero shares from non-zero deposit for ${item.id} (${item.termId})`,
        )
      }
    }
  }
}

// ── batchPreviewTripleCreates ────────────────────────────────────────────────

/**
 * Batch-preview triple creation for all items to be created.
 *
 * Throws if any preview fails or if a non-zero deposit would mint zero shares.
 * Used for both claim triples and provenance triples.
 */
export async function batchPreviewTripleCreates(
  publicClient: MulticallCapableClient,
  items: Array<{
    id: string
    termId: Hex
    assets: bigint
  }>,
  options?: { chunkSize?: number },
): Promise<void> {
  if (items.length === 0) return

  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)

    const multicallResult = await publicClient.multicall({
      allowFailure: true,
      contracts: chunk.map((item) => ({
        address: MULTIVAULT_ADDRESS,
        abi: intuitionReadAbi,
        functionName: 'previewTripleCreate',
        args: [item.termId, item.assets],
      })),
    })

    for (let j = 0; j < chunk.length; j++) {
      const callResult = multicallResult[j]
      const item = chunk[j]

      if (callResult.status !== 'success') {
        throw new Error(
          `Triple creation preview failed for ${item.id} (${item.termId})`,
        )
      }

      // ABI returns (uint256 shares, uint256 assetsAfterFixedFees, uint256 assetsAfterFees)
      const [shares, assetsAfterFixedFees] = callResult.result as unknown as [
        bigint,
        bigint,
        bigint,
      ]

      if (assetsAfterFixedFees > BigInt(0) && shares === BigInt(0)) {
        throw new Error(
          `Triple creation preview mints zero shares from non-zero deposit for ${item.id} (${item.termId})`,
        )
      }
    }
  }
}

// ── readPublishConfig ────────────────────────────────────────────────────────

/**
 * Read atom cost, triple cost, and general config in a single multicall.
 *
 * Falls back to safe defaults if the multicall fails entirely.
 */
export async function readPublishConfig(
  publicClient: MulticallCapableClient,
): Promise<{
  atomCost: bigint
  tripleCost: bigint
  extraDepositPerUnit: bigint
}> {
  try {
    const multicallResult = await publicClient.multicall({
      allowFailure: true,
      contracts: [
        {
          address: MULTIVAULT_ADDRESS,
          abi: intuitionReadAbi,
          functionName: 'getAtomCost',
        },
        {
          address: MULTIVAULT_ADDRESS,
          abi: intuitionReadAbi,
          functionName: 'getTripleCost',
        },
        {
          address: MULTIVAULT_ADDRESS,
          abi: intuitionReadAbi,
          functionName: 'getGeneralConfig',
        },
      ],
    })

    const atomCostResult = multicallResult[0]
    const tripleCostResult = multicallResult[1]
    const generalConfigResult = multicallResult[2]

    // If any single result failed, fall back globally to avoid mixing partial config
    if (
      atomCostResult.status !== 'success' ||
      tripleCostResult.status !== 'success' ||
      generalConfigResult.status !== 'success'
    ) {
      console.warn(
        'readPublishConfig: one or more config reads failed, using fallbacks',
      )
      return {
        atomCost: FALLBACK_ATOM_COST,
        tripleCost: FALLBACK_TRIPLE_COST,
        extraDepositPerUnit: FALLBACK_EXTRA_DEPOSIT,
      }
    }

    const atomCost = atomCostResult.result as bigint
    const tripleCost = tripleCostResult.result as bigint
    const generalConfig = generalConfigResult.result as {
      minDeposit: bigint
    }

    return {
      atomCost,
      tripleCost,
      extraDepositPerUnit: generalConfig.minDeposit,
    }
  } catch (error) {
    console.warn(
      'readPublishConfig: multicall failed entirely, using fallbacks:',
      error instanceof Error ? error.message : error,
    )
    return {
      atomCost: FALLBACK_ATOM_COST,
      tripleCost: FALLBACK_TRIPLE_COST,
      extraDepositPerUnit: FALLBACK_EXTRA_DEPOSIT,
    }
  }
}
