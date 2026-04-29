/**
 * Verify the canonical predicate registry against testnet state.
 *
 * Three layers of checks per entry:
 *   1. Local consistency: termId == keccak256(utf8(uri)).
 *   2. IPFS reachability (pinned only): the CID resolves and the JSON contains
 *      a `name` matching `canonicalLabel`. Fetched via the Pinata gateway when
 *      PINATA_GATEWAY is set, otherwise via a public IPFS gateway.
 *   3. On-chain state (best-effort): GraphQL atoms(term_id: X) returns either
 *      no atom (not yet created — fine) or an atom whose `data` field equals
 *      the registry uri. A mismatch fails verification.
 *
 * Exit code 1 on any failure. Designed to run in CI.
 *
 * Usage:
 *   npm run intuition:verify-registry
 */

import { calculateAtomId } from '@0xintuition/sdk'
import { stringToHex } from 'viem'
import {
  type CanonicalRegistry,
  type CanonicalPredicateEntry,
} from '../src/lib/intuition/canonical-registry'
import registryJson from '../src/lib/intuition/canonical-registry.json'

const GRAPHQL_ENDPOINT = 'https://testnet.intuition.sh/v1/graphql'

type Failure = { key: string; layer: string; reason: string }

function termIdFromUri(uri: string): `0x${string}` {
  return calculateAtomId(stringToHex(uri))
}

async function fetchIpfsJson(cid: string): Promise<unknown> {
  const gateway = process.env.PINATA_GATEWAY
  const url = gateway
    ? `https://${gateway}/ipfs/${cid}`
    : `https://ipfs.io/ipfs/${cid}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`IPFS fetch ${res.status} from ${url}`)
  return res.json()
}

async function fetchOnChainAtom(termId: string): Promise<{ data: string; type: string; label: string } | null> {
  const query = `query Q($id: String!) {
    atoms(where: { term_id: { _eq: $id } }) { term_id data type label }
  }`
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id: termId } }),
  })
  const json = (await res.json()) as { data?: { atoms?: Array<{ data: string; type: string; label: string }> } }
  const atoms = json.data?.atoms ?? []
  return atoms[0] ?? null
}

function checkLocal(entry: CanonicalPredicateEntry, fails: Failure[]): void {
  const computed = termIdFromUri(entry.uri)
  if (computed.toLowerCase() !== entry.termId.toLowerCase()) {
    fails.push({
      key: entry.internalKey,
      layer: 'local',
      reason: `termId mismatch: registry=${entry.termId} computed=${computed}`,
    })
  }
  if (entry.canonicalLabel !== entry.canonicalLabel.trim()) {
    fails.push({
      key: entry.internalKey,
      layer: 'local',
      reason: `label has leading/trailing whitespace: "${entry.canonicalLabel}"`,
    })
  }
  if (/[A-Z_]/.test(entry.canonicalLabel)) {
    fails.push({
      key: entry.internalKey,
      layer: 'local',
      reason: `label "${entry.canonicalLabel}" should be lowercase with spaces (no underscores or capitals)`,
    })
  }
}

async function checkIpfs(entry: CanonicalPredicateEntry, fails: Failure[]): Promise<void> {
  if (entry.source !== 'pinned' || !entry.cid) return
  try {
    const json = (await fetchIpfsJson(entry.cid)) as { name?: string; '@type'?: string }
    if (json['@type'] !== 'Thing') {
      fails.push({ key: entry.internalKey, layer: 'ipfs', reason: `pinned doc @type is "${json['@type']}", expected "Thing"` })
    }
    if (json.name !== entry.canonicalLabel) {
      fails.push({
        key: entry.internalKey,
        layer: 'ipfs',
        reason: `pinned name "${json.name}" != registry label "${entry.canonicalLabel}"`,
      })
    }
  } catch (err) {
    fails.push({ key: entry.internalKey, layer: 'ipfs', reason: (err as Error).message })
  }
}

async function checkOnChain(entry: CanonicalPredicateEntry, fails: Failure[]): Promise<void> {
  try {
    const atom = await fetchOnChainAtom(entry.termId)
    if (!atom) return // not yet created — fine
    if (atom.data !== entry.uri) {
      fails.push({
        key: entry.internalKey,
        layer: 'onchain',
        reason: `on-chain data "${atom.data}" != registry uri "${entry.uri}"`,
      })
    }
    if (entry.source === 'pinned' && atom.type !== 'Thing') {
      fails.push({
        key: entry.internalKey,
        layer: 'onchain',
        reason: `on-chain type "${atom.type}" != "Thing" for pinned predicate`,
      })
    }
  } catch (err) {
    fails.push({ key: entry.internalKey, layer: 'onchain', reason: (err as Error).message })
  }
}

async function main(): Promise<void> {
  const registry = registryJson as CanonicalRegistry
  const entries = Object.values(registry.predicates)
  const fails: Failure[] = []

  console.log(`[verify-canonical-registry] checking ${entries.length} entries`)

  for (const entry of entries) {
    checkLocal(entry, fails)
  }

  await Promise.all(entries.map((e) => checkIpfs(e, fails)))
  await Promise.all(entries.map((e) => checkOnChain(e, fails)))

  if (fails.length === 0) {
    console.log('[verify-canonical-registry] OK — all entries valid')
    return
  }

  console.error(`[verify-canonical-registry] ${fails.length} failure(s):`)
  for (const f of fails) {
    console.error(`  · [${f.layer}] ${f.key}: ${f.reason}`)
  }
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
