/**
 * Build an UNSIGNED createAtoms transaction that mints the canonical predicate
 * atoms which are pinned to IPFS but were never created on-chain (found by
 * scripts/audit-predicates.ts). This produces transaction parameters only — it
 * does NOT broadcast. Sign + send with your wallet (cast, wallet MCP, or the app).
 *
 * It re-derives the missing set live (read-only) so it never tries to create an
 * atom that already exists (which would revert with MultiVault_AtomExists).
 *
 * Usage:  npx tsx scripts/mint-missing-predicates.ts
 * Output: one unsigned tx object {to, data, value, chainId} + the expected term ids.
 */
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  stringToHex,
  formatEther,
} from 'viem'
import type { Hex } from 'viem'
import { calculateAtomId } from '@0xintuition/sdk'
import { batchIsTermCreated } from '../src/lib/intuition/read-batcher'
import { INTUITION_CHAIN, MULTIVAULT_ADDRESS } from '../src/lib/intuition/config'
import registry from '../src/lib/intuition/canonical-registry.json'

const createAtomsAbi = parseAbi([
  'function createAtoms(bytes[] atomDatas, uint256[] assets) payable returns (bytes32[])',
])
const readAbi = parseAbi(['function getAtomCost() view returns (uint256)'])

async function main() {
  const client = createPublicClient({ chain: INTUITION_CHAIN, transport: http() })

  const predicates = (registry as {
    predicates: Record<string, { uri: string; termId: Hex }>
  }).predicates
  const all = Object.entries(predicates).map(([name, p]) => ({
    name,
    uri: p.uri,
    termId: calculateAtomId(stringToHex(p.uri)) as Hex,
  }))

  // Re-derive the missing set live (read-only) so we never re-create an existing atom.
  const onchain = await batchIsTermCreated(client, all.map((a) => a.termId), { failureMode: 'throw' })
  const missing = all.filter((a) => onchain.get(a.termId.toLowerCase() as Hex) !== true)

  console.log(`chain ${INTUITION_CHAIN.id} · MultiVault ${MULTIVAULT_ADDRESS}`)
  console.log(`missing predicates (pinned, not minted): ${missing.length}/${all.length}`)
  for (const m of missing) console.log(`  · ${m.name}  ${m.termId}  ${m.uri}`)

  if (missing.length === 0) {
    console.log('\n✅ Nothing to mint — every canonical predicate already exists on-chain.')
    return
  }

  const atomCost = await client.readContract({
    address: MULTIVAULT_ADDRESS,
    abi: readAbi,
    functionName: 'getAtomCost',
  })

  // assets[i] = atomCost (minimal: create with no extra vault deposit).
  const atomDatas = missing.map((m) => stringToHex(m.uri))
  const assets = missing.map(() => atomCost)
  const value = atomCost * BigInt(missing.length)

  const data = encodeFunctionData({
    abi: createAtomsAbi,
    functionName: 'createAtoms',
    args: [atomDatas, assets],
  })

  console.log(`\natomCost = ${atomCost} wei (${formatEther(atomCost)} tTRUST) per atom`)
  console.log(`total value = ${value} wei (${formatEther(value)} tTRUST)`)
  console.log('\nExpected term ids after mint (verify post-broadcast):')
  for (const m of missing) console.log(`  ${m.name} -> ${m.termId}`)

  console.log('\n--- UNSIGNED TRANSACTION (sign + broadcast with your wallet) ---')
  console.log(
    JSON.stringify(
      { to: MULTIVAULT_ADDRESS, data, value: value.toString(), chainId: String(INTUITION_CHAIN.id) },
      null,
      2,
    ),
  )
  console.log(
    '\nNote: re-run this script right before broadcasting — on the shared testnet ' +
      'another publisher could mint one of these in the meantime (the script will drop it).',
  )
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
