/**
 * READ-ONLY on-chain audit of every canonical predicate in the registry.
 *
 * For each predicate in src/lib/intuition/canonical-registry.json this script:
 *   1. Recomputes the deterministic atom id from the registry `uri`, mirroring
 *      the exact computation the codebase uses everywhere
 *      (canonical-registry.ts `termIdFromUri`, pin/verify scripts, and the
 *      executor's `calculateAtomId(stringToAtomData(...))`):
 *
 *        recompute = calculateAtomId(stringToHex(uri))
 *
 *      Note: the executor encodes via `stringToAtomData(s) =
 *      toHex(new TextEncoder().encode(s))`. For UTF-8 strings this is
 *      byte-identical to viem's `stringToHex(s)`, so both produce the same
 *      `calculateAtomId` input. We assert this equivalence at runtime.
 *   2. Compares the recomputed id to the registry's stored `termId`.
 *   3. Queries on-chain `isTermCreated` (via batchIsTermCreated on a viem
 *      publicClient against intuitionTestnet) for BOTH the registry termId and
 *      the recomputed id (when they differ).
 *
 * Classification per predicate:
 *   HEALTHY     — registry termId == recompute AND exists on-chain
 *   DATA_ERROR  — registry termId != recompute (registry stale/wrong)
 *   NOT_CREATED — registry termId == recompute but not on-chain (pinned, never minted)
 *
 * No wallet, no writes. Usage:
 *   npx tsx scripts/audit-predicates.ts
 */
import { createPublicClient, http, stringToHex, toHex } from 'viem'
import type { Hex } from 'viem'
import { calculateAtomId } from '@0xintuition/sdk'
import { batchIsTermCreated } from '../src/lib/intuition/read-batcher'
import { INTUITION_CHAIN, MULTIVAULT_ADDRESS } from '../src/lib/intuition/config'
import registry from '../src/lib/intuition/canonical-registry.json'

type Entry = {
  internalKey: string
  uri: string
  termId: Hex
  source: string
}

type Class = 'HEALTHY' | 'DATA_ERROR' | 'NOT_CREATED'

// Mirror executor encoding to prove equivalence with stringToHex.
function stringToAtomData(str: string): Hex {
  return toHex(new TextEncoder().encode(str))
}

function recompute(uri: string): Hex {
  return calculateAtomId(stringToHex(uri)) as Hex
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

async function main() {
  const client = createPublicClient({ chain: INTUITION_CHAIN, transport: http() })

  const predicates = (registry as { predicates: Record<string, Entry> }).predicates
  const entries = Object.entries(predicates)

  // Build the recompute + assert encoding equivalence (executor vs stringToHex).
  const rows = entries.map(([name, p]) => {
    const viaStringToHex = recompute(p.uri)
    const viaExecutor = calculateAtomId(stringToAtomData(p.uri)) as Hex
    if (viaStringToHex.toLowerCase() !== viaExecutor.toLowerCase()) {
      throw new Error(
        `encoding divergence for ${name}: stringToHex=${viaStringToHex} executor=${viaExecutor}`,
      )
    }
    return {
      name,
      uri: p.uri,
      source: p.source,
      registryTermId: p.termId.toLowerCase() as Hex,
      recomputeTermId: viaStringToHex.toLowerCase() as Hex,
      match: p.termId.toLowerCase() === viaStringToHex.toLowerCase(),
    }
  })

  // Collect every id we need to check on-chain (registry + recompute), dedup.
  const allIds = Array.from(
    new Set(rows.flatMap((r) => [r.registryTermId, r.recomputeTermId])),
  ) as Hex[]

  console.log('=== Config ===')
  console.log('chain      :', INTUITION_CHAIN.id, INTUITION_CHAIN.name)
  console.log('MultiVault :', MULTIVAULT_ADDRESS)
  console.log('rpc        :', INTUITION_CHAIN.rpcUrls.default.http[0])
  console.log(`predicates : ${rows.length}`)
  console.log(`unique ids : ${allIds.length} (registry ∪ recompute)`)
  console.log('encoding   : stringToHex(uri) == toHex(TextEncoder.encode(uri))  ✅ asserted\n')

  const onchain = await batchIsTermCreated(client, allIds, { failureMode: 'throw' })
  const exists = (id: Hex): boolean => onchain.get(id.toLowerCase() as Hex) === true

  const classified = rows.map((r) => {
    const regOn = exists(r.registryTermId)
    const recOn = exists(r.recomputeTermId)
    let cls: Class
    if (!r.match) cls = 'DATA_ERROR'
    else if (regOn) cls = 'HEALTHY'
    else cls = 'NOT_CREATED'
    return { ...r, regOn, recOn, cls }
  })

  // ── Table ──────────────────────────────────────────────────────────────────
  console.log('=== Per-predicate audit ===')
  console.log(
    pad('name', 28) +
      pad('registry termId', 20) +
      pad('recompute', 20) +
      pad('match?', 8) +
      pad('reg-on?', 9) +
      pad('rec-on?', 9) +
      'class',
  )
  console.log('-'.repeat(110))
  for (const c of classified) {
    console.log(
      pad(c.name, 28) +
        pad(c.registryTermId.slice(0, 16) + '…', 20) +
        pad(c.recomputeTermId.slice(0, 16) + '…', 20) +
        pad(c.match ? 'YES' : 'NO', 8) +
        pad(c.regOn ? 'yes' : 'no', 9) +
        pad(c.recOn ? 'yes' : 'no', 9) +
        c.cls,
    )
  }

  // ── Summary counts ───────────────────────────────────────────────────────────
  const counts = classified.reduce<Record<Class, number>>(
    (acc, c) => {
      acc[c.cls]++
      return acc
    },
    { HEALTHY: 0, DATA_ERROR: 0, NOT_CREATED: 0 },
  )
  console.log('\n=== Summary ===')
  console.log(`HEALTHY     : ${counts.HEALTHY}`)
  console.log(`DATA_ERROR  : ${counts.DATA_ERROR}`)
  console.log(`NOT_CREATED : ${counts.NOT_CREATED}`)

  // ── Focused verdict: has_contract_address ────────────────────────────────────
  const hca = classified.find((c) => c.name === 'has_contract_address')
  console.log('\n=== Verdict: has_contract_address ===')
  if (!hca) {
    console.log('NOT FOUND in registry (!)')
  } else {
    console.log(`uri              : ${hca.uri}`)
    console.log(`registry termId  : ${hca.registryTermId}`)
    console.log(`recompute termId : ${hca.recomputeTermId}`)
    console.log(`match?           : ${hca.match}`)
    console.log(`registry on-chain: ${hca.regOn}`)
    console.log(`recompute on-chain: ${hca.recOn}`)
    console.log(`class            : ${hca.cls}`)
    console.log('--- recommended fix ---')
    if (hca.cls === 'DATA_ERROR') {
      console.log(
        `Registry termId is WRONG (stale). Write this corrected termId into\n` +
          `src/lib/intuition/canonical-registry.json for has_contract_address:\n` +
          `  "termId": "${hca.recomputeTermId}"`,
      )
      console.log(
        hca.recOn
          ? `The corrected id EXISTS on-chain → after the edit, has_contract_address is HEALTHY.`
          : `The corrected id does NOT exist on-chain → after the edit it is NOT_CREATED (needs an on-chain wallet broadcast to mint).`,
      )
    } else if (hca.cls === 'NOT_CREATED') {
      console.log(
        `Registry termId is CORRECT (== recompute) but the atom was never minted on-chain.\n` +
          `No data edit needed. It must be CREATED on-chain via a wallet broadcast\n` +
          `(create the atom for uri ${hca.uri}).`,
      )
    } else {
      console.log('HEALTHY — no action needed.')
    }
  }

  // ── Other non-healthy predicates ─────────────────────────────────────────────
  const others = classified.filter((c) => c.cls !== 'HEALTHY' && c.name !== 'has_contract_address')
  console.log('\n=== Other non-HEALTHY predicates ===')
  if (others.length === 0) {
    console.log('(none — every other predicate is HEALTHY)')
  } else {
    for (const o of others) {
      console.log(`  · ${o.name} → ${o.cls}`)
      if (o.cls === 'DATA_ERROR') {
        console.log(`      registry : ${o.registryTermId}`)
        console.log(`      correct  : ${o.recomputeTermId}  (on-chain: ${o.recOn})`)
      } else {
        console.log(`      termId   : ${o.registryTermId}  (registry==recompute, not minted)`)
      }
    }
  }
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.stack || e.message : e)
  process.exit(1)
})
