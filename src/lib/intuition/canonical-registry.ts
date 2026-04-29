/**
 * Canonical predicate registry for Intuition Protocol publishing.
 *
 * Each entry binds an internal snake_case key (used in DB and bundle-builder)
 * to the canonical on-chain atom: a human-readable label, the IPFS Thing
 * pinned to back it, and the deterministic bytes32 termId computed from
 * keccak256(utf8("ipfs://<cid>")).
 *
 * Two `source` values:
 *   - "pinned": atom we created and pinned ourselves (fresh CID).
 *   - "reused": existing canonical Intuition atom we point to without re-pinning.
 *
 * The registry JSON is committed to the repo and is the source of truth for
 * the normalizer. It is populated by `scripts/pin-canonical-predicates.ts`
 * and validated against on-chain state by `scripts/verify-canonical-registry.ts`.
 */

import { calculateAtomId } from '@0xintuition/sdk'
import { stringToHex } from 'viem'
import registryJson from './canonical-registry.json'

export type CanonicalSource = 'pinned' | 'reused'

export type CanonicalPredicateEntry = {
  /** Internal snake_case key — matches values in PREDICATE_MAP. */
  internalKey: string
  /** Human-readable label, lowercase with spaces, used as Thing.name. */
  canonicalLabel: string
  /** "pinned" = we minted the IPFS Thing; "reused" = existing canonical atom. */
  source: CanonicalSource
  /** IPFS CID for pinned atoms; null for reused atoms whose CID we don't track. */
  cid: string | null
  /** The exact string hashed on-chain (e.g. "ipfs://bafy..."). */
  uri: string
  /** Deterministic bytes32 termId = keccak256(utf8(uri)). */
  termId: `0x${string}`
  /** ISO timestamp when the entry was first written. */
  pinnedAt: string
  /** Optional human-readable description (also pinned in the Thing). */
  description?: string
  /** When source="reused", the term_id we matched against on testnet. */
  reusedFrom?: string
}

export type CanonicalRegistry = {
  version: number
  network: 'testnet' | 'mainnet'
  predicates: Record<string, CanonicalPredicateEntry>
}

const REGISTRY = registryJson as CanonicalRegistry

/** Returns the registry as loaded from JSON. Mutations should go through scripts. */
export function getCanonicalRegistry(): CanonicalRegistry {
  return REGISTRY
}

/** Lookup a predicate by its internal snake_case key. Throws if missing. */
export function getCanonicalPredicate(internalKey: string): CanonicalPredicateEntry {
  const entry = REGISTRY.predicates[internalKey]
  if (!entry) {
    throw new Error(
      `[canonical-registry] predicate "${internalKey}" missing from registry. ` +
      `Add it to PREDICATE_MAP and run \`npm run intuition:pin-predicates\`.`,
    )
  }
  return entry
}

/** Returns `true` if the internal key has a registry entry (pinned or reused). */
export function hasCanonicalPredicate(internalKey: string): boolean {
  return internalKey in REGISTRY.predicates
}

/**
 * Compute the deterministic bytes32 termId for a given uri.
 * Mirrors the on-chain `calculateAtomId(bytes)`:
 *   salt = keccak256(utf8("ATOM_SALT"))
 *   id   = keccak256(encodePacked(salt, keccak256(atomData)))
 * Delegated to @0xintuition/sdk for fidelity.
 */
export function termIdFromUri(uri: string): `0x${string}` {
  return calculateAtomId(stringToHex(uri))
}
