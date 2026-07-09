/**
 * Mint the canonical predicate atoms that are pinned to IPFS but not yet
 * on-chain — and BROADCAST the transaction, unlike mint-missing-predicates.ts
 * which only prints an unsigned tx. Signs with a private key so no manual
 * wallet step is needed. Testnet only.
 *
 * Setup: put a testnet wallet key (funded with tTRUST) in .env.local:
 *   INTUITION_OPERATOR_PRIVATE_KEY=0x...
 * Run:   npm run intuition:mint-predicates-broadcast
 *        (or: npx tsx --env-file=.env.local scripts/mint-predicates-broadcast.ts)
 *
 * It re-derives the missing set live (read-only) right before sending, so it
 * never re-creates an atom that already exists (which would revert with
 * MultiVault_AtomExists), and drops any predicate another publisher minted in
 * the meantime on the shared testnet.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  stringToHex,
  formatEther,
} from 'viem'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { calculateAtomId } from '@0xintuition/sdk'
import { batchIsTermCreated } from '../src/lib/intuition/read-batcher'
import {
  INTUITION_CHAIN,
  MULTIVAULT_ADDRESS,
} from '../src/lib/intuition/config'
import registry from '../src/lib/intuition/canonical-registry.json'

const createAtomsAbi = parseAbi([
  'function createAtoms(bytes[] atomDatas, uint256[] assets) payable returns (bytes32[])',
])
const readAbi = parseAbi(['function getAtomCost() view returns (uint256)'])

async function main() {
  const rawKey = process.env.INTUITION_OPERATOR_PRIVATE_KEY
  if (!rawKey) {
    console.error(
      'Missing INTUITION_OPERATOR_PRIVATE_KEY in .env.local.\n' +
        'Add a testnet wallet private key (0x-prefixed) funded with tTRUST, then re-run:\n' +
        '  INTUITION_OPERATOR_PRIVATE_KEY=0x...',
    )
    process.exit(1)
  }
  const key = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex
  const account = privateKeyToAccount(key)

  const publicClient = createPublicClient({
    chain: INTUITION_CHAIN,
    transport: http(),
  })
  const walletClient = createWalletClient({
    account,
    chain: INTUITION_CHAIN,
    transport: http(),
  })

  const predicates = (
    registry as {
      predicates: Record<string, { uri: string; termId: Hex }>
    }
  ).predicates
  const all = Object.entries(predicates).map(([name, p]) => ({
    name,
    uri: p.uri,
    termId: calculateAtomId(stringToHex(p.uri)) as Hex,
  }))

  // Re-derive the missing set live so we never re-create an existing atom.
  const onchain = await batchIsTermCreated(
    publicClient,
    all.map((a) => a.termId),
    { failureMode: 'throw' },
  )
  const missing = all.filter(
    (a) => onchain.get(a.termId.toLowerCase() as Hex) !== true,
  )

  console.log(`operator ${account.address} · chain ${INTUITION_CHAIN.id}`)
  const balance = await publicClient.getBalance({ address: account.address })
  console.log(`balance  = ${formatEther(balance)} tTRUST`)
  console.log(`missing  = ${missing.length}/${all.length} predicate(s)`)
  for (const m of missing) console.log(`  · ${m.name}`)

  if (missing.length === 0) {
    console.log('\nNothing to mint — every canonical predicate already exists.')
    return
  }

  const atomCost = await publicClient.readContract({
    address: MULTIVAULT_ADDRESS,
    abi: readAbi,
    functionName: 'getAtomCost',
  })
  const atomDatas = missing.map((m) => stringToHex(m.uri))
  const assets = missing.map(() => atomCost)
  const value = atomCost * BigInt(missing.length)
  console.log(`cost     = ${formatEther(value)} tTRUST total`)

  if (balance < value) {
    console.error(
      '\nInsufficient tTRUST. Fund the operator wallet on Intuition testnet and retry.',
    )
    process.exit(1)
  }

  console.log('\nbroadcasting createAtoms ...')
  const txHash = await walletClient.writeContract({
    address: MULTIVAULT_ADDRESS,
    abi: createAtomsAbi,
    functionName: 'createAtoms',
    args: [atomDatas, assets],
    value,
  })
  console.log(`tx: ${txHash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
  if (receipt.status === 'reverted') {
    console.error('\nReverted on-chain. Nothing was minted.')
    process.exit(1)
  }

  console.log(
    `\nMinted ${missing.length} predicate(s) in block ${receipt.blockNumber}.`,
  )
  console.log('Verify with: npm run intuition:audit-predicates')
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
