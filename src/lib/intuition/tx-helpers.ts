/**
 * Shared low-level tx helpers for the Intuition publish + challenge executors.
 *
 * Deterministic term-ID computation (atoms + triples) and a small revert-name
 * detection helper, factored out of publish-executor.ts so a future J3
 * challenge-executor can reuse the exact same logic.
 */

import { toHex } from 'viem'
import type { Hex } from 'viem'
import { calculateAtomId, calculateTripleId } from '@0xintuition/sdk'

/** Encode a string to hex bytes — same encoding as existence-resolver uses for calculateAtomId */
export function stringToAtomData(str: string): Hex {
  return toHex(new TextEncoder().encode(str))
}

/** Compute atom term ID from normalized data */
export function computeAtomTermId(normalizedData: string): Hex {
  return calculateAtomId(stringToAtomData(normalizedData))
}

/** Compute triple term ID from subject/predicate/object atom term IDs */
export function computeTripleTermId(
  subjectTermId: Hex,
  predicateTermId: Hex,
  objectTermId: Hex,
): Hex {
  return calculateTripleId(subjectTermId, predicateTermId, objectTermId)
}

/** True if `error`'s message contains `revertName` (e.g. 'MultiVault_AtomExists') */
export function isRevert(error: unknown, revertName: string): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(revertName)
}
