/**
 * Client-side challenge executor — dispute a claim / withdraw a dispute.
 *
 * A dispute is a deposit of tTRUST into a claim triple's COUNTER-triple
 * (every triple gets an automatic counter-triple vault on creation; opening a
 * dispute and adding to an existing dispute are the same deposit call, the
 * caller just labels the intent). Withdrawing a dispute redeems shares from
 * that same counter-triple.
 *
 * HasCounterStake invariant: the MultiVault contract reverts a counter-triple
 * deposit with `MultiVault_HasCounterStake` if the caller already holds a
 * supporting ("for") position on the claim triple itself — you cannot argue
 * both sides at once. `executeContestationDeposit` pre-checks this and fails
 * fast with a clear message instead of surfacing the raw revert.
 *
 * Slippage: both the deposit and the redeem apply a 95% floor (5% tolerance)
 * against the previewed shares/assets, derived from `previewDeposit` /
 * `previewRedeem` immediately before the write.
 *
 * Persistence: this module only executes the on-chain leg. The caller is
 * responsible for persisting the resulting tx hash via
 * `record_challenge_onchain_tx` (or equivalent) once this resolves.
 */

import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import {
  multiVaultDeposit,
  multiVaultRedeem,
  multiVaultGetShares,
  multiVaultGetGeneralConfig,
  multiVaultPreviewDeposit,
  multiVaultPreviewRedeem,
  multiVaultCreateAtoms,
  multiVaultCreateTriples,
  eventParseAtomCreated,
  eventParseTripleCreated,
} from '@0xintuition/protocol'
import { MULTIVAULT_ADDRESS } from './config'
import {
  isRevert,
  stringToAtomData,
  computeAtomTermId,
  computeTripleTermId,
} from './tx-helpers'
import { normalizeLiteral } from './atom-normalizer'
import { getCanonicalPredicate } from './canonical-registry'
import { batchIsTermCreated, intuitionReadAbi } from './read-batcher'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(walletClient: WalletClient, publicClient: PublicClient) {
  return {
    address: MULTIVAULT_ADDRESS,
    publicClient,
    walletClient,
  }
}

function requireAccount(walletClient: WalletClient, action: string): Address {
  const account = walletClient.account?.address
  if (!account) {
    throw new Error(
      `Wallet is not connected — no account available to sign the ${action}.`,
    )
  }
  return account
}

// ── Open / add to a dispute ─────────────────────────────────────────────────

export interface ContestationDepositParams {
  /** The "for" side triple — used for the HasCounterStake pre-check. */
  tripleTermId: Hex
  /** The counter-triple to deposit into (the dispute side). */
  counterTermId: Hex
  curveId: bigint
  /** tTRUST to stake, in wei. */
  amountWei: bigint
}

export interface ContestationDepositResult {
  txHash: Hex
  account: Address
  counterTermId: Hex
  curveId: bigint
  amountWei: bigint
  /** Best-effort shares-minted delta; null if it could not be determined. */
  sharesMinted: bigint | null
}

export async function executeContestationDeposit(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: ContestationDepositParams,
): Promise<ContestationDepositResult> {
  const { tripleTermId, counterTermId, curveId, amountWei } = params
  const account = requireAccount(walletClient, 'dispute deposit')
  const config = makeConfig(walletClient, publicClient)

  try {
    // Minimum deposit gate.
    const { minDeposit } = await multiVaultGetGeneralConfig(config)
    if (amountWei < minDeposit) {
      throw new Error('Stake amount is below the network minimum deposit')
    }

    // HasCounterStake invariant: a supporting position on the claim triple
    // blocks depositing into its counter-triple until it is redeemed.
    const forShares = await multiVaultGetShares(config, {
      args: [account, tripleTermId, curveId],
    })
    if (forShares > BigInt(0)) {
      throw new Error(
        'You hold a supporting position on this claim. Redeem it before you can dispute.',
      )
    }

    // Best-effort baseline for the post-write shares delta below.
    let sharesBefore: bigint | null = null
    try {
      sharesBefore = await multiVaultGetShares(config, {
        args: [account, counterTermId, curveId],
      })
    } catch {
      sharesBefore = null
    }

    // Slippage: floor minShares at 95% of the previewed shares.
    const [previewShares] = await multiVaultPreviewDeposit(config, {
      args: [counterTermId, curveId, amountWei],
    })
    const minShares = (previewShares * BigInt(95)) / BigInt(100)

    const txHash = await multiVaultDeposit(config, {
      args: [account, counterTermId, curveId, minShares],
      value: amountWei,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    })
    if (receipt.status === 'reverted') {
      throw new Error('Dispute transaction reverted on-chain.')
    }

    // Best-effort post-verify: shares-minted delta.
    let sharesMinted: bigint | null = null
    if (sharesBefore !== null) {
      try {
        const sharesAfter = await multiVaultGetShares(config, {
          args: [account, counterTermId, curveId],
        })
        sharesMinted = sharesAfter - sharesBefore
      } catch {
        sharesMinted = null
      }
    }

    return {
      txHash,
      account,
      counterTermId,
      curveId,
      amountWei,
      sharesMinted,
    }
  } catch (err) {
    if (isRevert(err, 'MultiVault_HasCounterStake')) {
      throw new Error(
        'You hold a supporting position on this claim. Redeem it before you can dispute.',
      )
    }
    if (isRevert(err, 'MultiVault_DepositBelowMinimumDeposit')) {
      throw new Error('Stake amount is below the network minimum deposit')
    }
    if (isRevert(err, 'MultiVault_InsufficientBalance')) {
      throw new Error('Insufficient wallet balance to cover this deposit.')
    }
    throw err
  }
}

// ── Withdraw a dispute ──────────────────────────────────────────────────────

export interface WithdrawContestationParams {
  counterTermId: Hex
  curveId: bigint
}

export interface WithdrawContestationResult {
  txHash: Hex
  account: Address
  sharesRedeemed: bigint
}

export async function executeWithdrawContestation(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: WithdrawContestationParams,
): Promise<WithdrawContestationResult> {
  const { counterTermId, curveId } = params
  const account = requireAccount(walletClient, 'dispute withdrawal')
  const config = makeConfig(walletClient, publicClient)

  try {
    const shares = await multiVaultGetShares(config, {
      args: [account, counterTermId, curveId],
    })
    if (shares === BigInt(0)) {
      throw new Error('No dispute position to withdraw.')
    }

    // Slippage: floor minAssets at 95% of the previewed assets.
    const [assetsAfterFees] = await multiVaultPreviewRedeem(config, {
      args: [counterTermId, curveId, shares],
    })
    const minAssets = (assetsAfterFees * BigInt(95)) / BigInt(100)

    const txHash = await multiVaultRedeem(config, {
      args: [account, counterTermId, curveId, shares, minAssets],
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    })
    if (receipt.status === 'reverted') {
      throw new Error('Withdraw transaction reverted on-chain.')
    }

    return { txHash, account, sharesRedeemed: shares }
  } catch (err) {
    if (isRevert(err, 'MultiVault_InsufficientBalance')) {
      throw new Error('Insufficient balance to complete this withdrawal.')
    }
    throw err
  }
}

// ── Open an UPDATE challenge (J5) ────────────────────────────────────────────
//
// Executes the on-chain leg of an accepted UPDATE challenge: mints the
// corrected value as a new claim triple and links the disputed (old) claim to
// it, in a SINGLE ordered `createTriples` batch — optionally preceded by a
// `createAtoms` call, only if the new value atom is not yet on-chain:
//
//   ① new claim triple:  (subjectTermId, predicateTermId, NEW object atom)
//      — same subject + predicate as the disputed claim, corrected value.
//   ② supersession link: (oldTripleTermId, superseded_by, ①'s term ID)
//      — "old claim is superseded_by the new claim".
//   ③ provenance (optional): (①'s term ID, based_on, sourceAtomTermId)
//      — links the new claim to the evidence atom that justified it.
//
// Ordering constraint: the MultiVault contract's `_createTriples` processes
// the arrays sequentially within a single transaction, so ② and ③ may
// reference ①'s triple term ID even though, at submission time, that triple
// does not exist on-chain yet — as long as ① is placed earlier in the same
// submitted arrays, it will have been created by the time ②/③ are processed
// in that same tx. All term IDs are computed deterministically off-chain
// (calculateAtomId / calculateTripleId, via tx-helpers) before the write, so
// ①'s ID is already known even though the row doesn't exist on-chain yet.
//
// Idempotency: ①/②/③ are each independently rechecked against on-chain state
// immediately before submission and dropped from the batch if already
// present — this also transparently handles a retried/partial prior run
// where, e.g., ① (the new claim) already exists on-chain but ② (the
// supersession link) does not: ① is simply omitted from the submitted
// arrays while ②/③ still reference its (already on-chain) term ID by value,
// which is valid regardless of whether ① was created in *this* transaction
// or a previous one. The relative order of the survivors is always
// preserved, so whenever ① *does* still need creating, it is always placed
// ahead of ②/③ in the arrays actually submitted.
//
// Persistence: like the other executors in this file, this function only
// executes the on-chain leg. The caller persists the resulting tx hash(es)
// via `record_challenge_supersession_tx` (or equivalent) once this resolves.

export interface OpenUpdateParams {
  /** Subject of the disputed (and the new) claim — from resolveChallengeTripleFull. */
  subjectTermId: Hex
  /** Predicate of the disputed (and the new) claim — same as above. */
  predicateTermId: Hex
  /** The claim triple being superseded. */
  oldTripleTermId: Hex
  /** Raw proposed value (e.g. String(proposed_value)); normalized internally. */
  newValue: string
  /** Optional based_on provenance target (evidence source atom), if known. */
  sourceAtomTermId?: Hex
}

export interface OpenUpdateResult {
  /** Atoms tx (if the new value atom needed minting) followed by the triples tx. */
  txHashes: Hex[]
  newObjectTermId: Hex
  /** = computeTripleTermId(subject, predicate, newObject) */
  newClaimTripleTermId: Hex
  /** = computeTripleTermId(old, superseded_by, newClaim) */
  supersedeTripleTermId: Hex
}

/** One row of the ordered createTriples batch, plus its deterministic term ID. */
interface TripleCandidate {
  label: 'claim' | 'supersede' | 'provenance'
  subject: Hex
  predicate: Hex
  object: Hex
  termId: Hex
}

/** Read atomCost / tripleCost / minDeposit in a single multicall (throws on failure). */
async function readUpdateCosts(
  publicClient: PublicClient,
): Promise<{ atomAsset: bigint; tripleAsset: bigint }> {
  const results = await publicClient.multicall({
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
  const [atomCostResult, tripleCostResult, generalConfigResult] = results

  if (
    atomCostResult.status !== 'success' ||
    tripleCostResult.status !== 'success' ||
    generalConfigResult.status !== 'success'
  ) {
    throw new Error(
      'Failed to read MultiVault cost configuration for the update.',
    )
  }

  const atomCost = atomCostResult.result as bigint
  const tripleCost = tripleCostResult.result as bigint
  const { minDeposit } = generalConfigResult.result as { minDeposit: bigint }

  return {
    atomAsset: atomCost + minDeposit,
    tripleAsset: tripleCost + minDeposit,
  }
}

export async function executeOpenUpdate(
  walletClient: WalletClient,
  publicClient: PublicClient,
  params: OpenUpdateParams,
): Promise<OpenUpdateResult> {
  const {
    subjectTermId,
    predicateTermId,
    oldTripleTermId,
    newValue,
    sourceAtomTermId,
  } = params
  requireAccount(walletClient, 'claim update')
  const config = makeConfig(walletClient, publicClient)

  try {
    // ── 1. Compute all term IDs deterministically off-chain ──────────────────
    const objNorm = normalizeLiteral(String(newValue))
    const objData = stringToAtomData(objNorm)
    const newObjectTermId = computeAtomTermId(objNorm)

    const supersededByTermId = getCanonicalPredicate('superseded_by')
      .termId as Hex
    const newClaimTripleTermId = computeTripleTermId(
      subjectTermId,
      predicateTermId,
      newObjectTermId,
    )
    const supersedeTripleTermId = computeTripleTermId(
      oldTripleTermId,
      supersededByTermId,
      newClaimTripleTermId,
    )

    let basedOnTermId: Hex | undefined
    let provTripleTermId: Hex | undefined
    if (sourceAtomTermId) {
      basedOnTermId = getCanonicalPredicate('based_on').termId as Hex
      provTripleTermId = computeTripleTermId(
        newClaimTripleTermId,
        basedOnTermId,
        sourceAtomTermId,
      )
    }

    // ── 2. Read atomCost / tripleCost / minDeposit ────────────────────────────
    const { atomAsset, tripleAsset } = await readUpdateCosts(publicClient)

    const txHashes: Hex[] = []

    // ── 3. ATOMS phase — only the new value atom can be missing; predicate,
    //      subject, superseded_by, and based_on atoms already exist from the
    //      original publish + the canonical-predicate mint. ────────────────
    const atomExistence = await batchIsTermCreated(
      publicClient,
      [newObjectTermId],
      { failureMode: 'assumeMissing' },
    )
    let objectAtomConfirmed =
      atomExistence.get(newObjectTermId.toLowerCase() as Hex) ?? false

    if (!objectAtomConfirmed) {
      try {
        const atomsTxHash = await multiVaultCreateAtoms(config, {
          args: [[objData], [atomAsset]],
          value: atomAsset,
        })

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: atomsTxHash,
        })
        if (receipt.status === 'reverted') {
          throw new Error(
            'New value atom creation transaction reverted on-chain.',
          )
        }

        const events = await eventParseAtomCreated(publicClient, atomsTxHash)
        if (events.length !== 1) {
          throw new Error(
            `On-chain events did not match: expected 1 atom, got ${events.length} (tx ${atomsTxHash}). Rerun to resolve.`,
          )
        }

        txHashes.push(atomsTxHash)
        objectAtomConfirmed = true
      } catch (err) {
        // MultiVault_AtomExists: the batch is atomic (only 1 item here), so
        // the revert means the atom was NOT created by this call — but it
        // may already exist from a prior run. Recheck before failing.
        if (isRevert(err, 'MultiVault_AtomExists')) {
          const recheck = await batchIsTermCreated(
            publicClient,
            [newObjectTermId],
            { failureMode: 'assumeMissing' },
          )
          const exists =
            recheck.get(newObjectTermId.toLowerCase() as Hex) ?? false
          if (!exists) {
            throw new Error(
              `MultiVault_AtomExists reverted, but the new value atom (${newObjectTermId}) is still not on-chain — cannot proceed.`,
            )
          }
          objectAtomConfirmed = true
        } else {
          throw err
        }
      }
    }

    // ── 4. TRIPLES phase — ordered candidates: claim, then supersede, then
    //      the optional provenance link. Order is significant: supersede and
    //      provenance reference the claim's term ID, which must already have
    //      been created earlier in the SAME batch if it isn't on-chain yet. ─
    const candidates: TripleCandidate[] = [
      {
        label: 'claim',
        subject: subjectTermId,
        predicate: predicateTermId,
        object: newObjectTermId,
        termId: newClaimTripleTermId,
      },
      {
        label: 'supersede',
        subject: oldTripleTermId,
        predicate: supersededByTermId,
        object: newClaimTripleTermId,
        termId: supersedeTripleTermId,
      },
    ]
    if (sourceAtomTermId && basedOnTermId && provTripleTermId) {
      candidates.push({
        label: 'provenance',
        subject: newClaimTripleTermId,
        predicate: basedOnTermId,
        object: sourceAtomTermId,
        termId: provTripleTermId,
      })
    }

    // Recheck existence; drop anything already on-chain. `.filter` preserves
    // the original (claim-first) order among the survivors.
    const tripleExistence = await batchIsTermCreated(
      publicClient,
      candidates.map((c) => c.termId),
      { failureMode: 'assumeMissing' },
    )
    const survivors = candidates.filter(
      (c) => !(tripleExistence.get(c.termId.toLowerCase() as Hex) ?? false),
    )

    if (survivors.length > 0) {
      const subjectIds = survivors.map((c) => c.subject)
      const predicateIds = survivors.map((c) => c.predicate)
      const objectIds = survivors.map((c) => c.object)
      const assetsArray = survivors.map(() => tripleAsset)
      const totalValue = tripleAsset * BigInt(survivors.length)

      try {
        const triplesTxHash = await multiVaultCreateTriples(config, {
          args: [subjectIds, predicateIds, objectIds, assetsArray],
          value: totalValue,
        })

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: triplesTxHash,
        })
        if (receipt.status === 'reverted') {
          throw new Error('Supersession triples transaction reverted on-chain.')
        }

        const events = await eventParseTripleCreated(
          publicClient,
          triplesTxHash,
        )
        if (events.length !== survivors.length) {
          throw new Error(
            `On-chain events did not match: expected ${survivors.length} triple(s), got ${events.length} (tx ${triplesTxHash}). Rerun to resolve.`,
          )
        }

        txHashes.push(triplesTxHash)
      } catch (err) {
        // MultiVault_TripleExists: the batch is atomic, so a revert means
        // NONE of `survivors` were created by this call. Only the one(s)
        // that already existed (created by a concurrent run) triggered it —
        // recheck each individually and fail only if some are still missing.
        if (isRevert(err, 'MultiVault_TripleExists')) {
          const recheck = await batchIsTermCreated(
            publicClient,
            survivors.map((c) => c.termId),
            { failureMode: 'assumeMissing' },
          )
          const stillMissing = survivors.filter(
            (c) => !(recheck.get(c.termId.toLowerCase() as Hex) ?? false),
          )
          if (stillMissing.length > 0) {
            throw new Error(
              `MultiVault_TripleExists reverted the batch; still missing on-chain: ${stillMissing
                .map((c) => `${c.label} (${c.termId})`)
                .join(', ')}`,
            )
          }
          // All survivors already existed (race with a concurrent run) —
          // treat as success; no new tx hash to report for this leg.
        } else {
          throw err
        }
      }
    }

    return {
      txHashes,
      newObjectTermId,
      newClaimTripleTermId,
      supersedeTripleTermId,
    }
  } catch (err) {
    if (isRevert(err, 'MultiVault_InsufficientBalance')) {
      throw new Error('Insufficient tTRUST to publish the update.')
    }
    throw err
  }
}
