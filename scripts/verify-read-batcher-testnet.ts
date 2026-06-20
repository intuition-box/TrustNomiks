/**
 * Read-only verification of the read-batcher against the LIVE Intuition testnet.
 *
 * Validates the foundation of the MultiVault_AtomExists race fix: that batched
 * multicall reads of `isTermCreated` actually work on testnet and return correct
 * results. If multicall were unavailable, every existence recheck would fail and
 * the executor would fall back to its failure mode for whole chunks — so this is
 * the load-bearing assumption to confirm.
 *
 * No wallet, no writes. Usage:
 *   npx tsx scripts/verify-read-batcher-testnet.ts
 */
import { createPublicClient, http, keccak256, toHex } from 'viem'
import type { Hex } from 'viem'
import { batchIsTermCreated, intuitionReadAbi } from '../src/lib/intuition/read-batcher'
import { INTUITION_CHAIN, MULTIVAULT_ADDRESS } from '../src/lib/intuition/config'
import registry from '../src/lib/intuition/canonical-registry.json'

async function main() {
  const client = createPublicClient({ chain: INTUITION_CHAIN, transport: http() })

  console.log('=== Config ===')
  console.log('chain        :', INTUITION_CHAIN.id, INTUITION_CHAIN.name)
  console.log('MultiVault   :', MULTIVAULT_ADDRESS)
  console.log('multicall3   :', (INTUITION_CHAIN as { contracts?: { multicall3?: { address: string } } }).contracts?.multicall3?.address ?? 'NONE')
  console.log('rpc          :', INTUITION_CHAIN.rpcUrls.default.http[0])

  // Known-existing candidates: canonical predicate term ids from the registry.
  const predicates = (registry as { predicates: Record<string, { termId: Hex }> }).predicates
  const predicateEntries = Object.entries(predicates).slice(0, 12)
  const existingIds = predicateEntries.map(([, p]) => p.termId)

  // Definitely-nonexistent control: keccak of a unique string.
  const fakeId = keccak256(toHex('trustnomiks-verify-nonexistent-marker-13579')) as Hex

  console.log(`\n=== batchIsTermCreated: ${existingIds.length} canonical predicates + 1 control ===`)
  const result = await batchIsTermCreated(client, [...existingIds, fakeId], { failureMode: 'throw' })

  let existCount = 0
  for (const [name, p] of predicateEntries) {
    const exists = result.get(p.termId.toLowerCase() as Hex)
    if (exists) existCount++
    console.log(`  ${exists ? '✅' : '⬜'} ${p.termId.slice(0, 14)}…  ${name}`)
  }
  const fakeExists = result.get(fakeId.toLowerCase() as Hex)
  console.log(`  ${fakeExists ? '⚠️ TRUE ' : '✅ false'} ${fakeId.slice(0, 14)}…  (control, expected false)`)

  // Cross-check: a direct single readContract must agree with the multicall result.
  const probe = existingIds[0]
  const direct = await client.readContract({
    address: MULTIVAULT_ADDRESS,
    abi: intuitionReadAbi,
    functionName: 'isTermCreated',
    args: [probe],
  })
  const viaBatch = result.get(probe.toLowerCase() as Hex)

  console.log('\n=== Verdict ===')
  const multicallWorks = result.size === existingIds.length + 1
  console.log(`multicall returned a result for every term : ${multicallWorks ? 'YES' : 'NO'} (${result.size}/${existingIds.length + 1})`)
  console.log(`direct readContract == multicall (probe)    : ${direct === viaBatch} (direct=${direct}, batch=${viaBatch})`)
  console.log(`control (fake) correctly absent             : ${fakeExists === false}`)
  console.log(`canonical predicates present on-chain       : ${existCount}/${existingIds.length}`)

  const pass = multicallWorks && direct === viaBatch && fakeExists === false
  console.log(`\n${pass ? '✅ READ-BATCHER VERIFIED on live testnet' : '❌ VERIFICATION FAILED'}`)
  if (!pass) process.exit(1)
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
