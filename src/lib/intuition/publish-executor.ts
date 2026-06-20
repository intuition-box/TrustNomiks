/**
 * Client-side publish executor — batched version.
 *
 * Uses protocol-level batch functions (multiVaultCreateAtoms, multiVaultCreateTriples)
 * to drastically reduce the number of wallet confirmations. Items are chunked by phase:
 *   - Atoms:      chunks of ATOM_CHUNK_SIZE (25)
 *   - Triples:    chunks of TRIPLE_CHUNK_SIZE (50)
 *   - Provenance: chunks of PROVENANCE_CHUNK_SIZE (50)
 *
 * Failure policy:
 *   - Atom chunk failure → abort entirely (no triples on incomplete atoms)
 *   - Triple chunk failure → continue other triple chunks
 *   - Provenance chunk failure → continue other provenance chunks
 *   - Provenance is only created for triples that were actually confirmed
 *
 * TermId verification: events are cross-checked against pre-computed IDs.
 * Mismatches are flagged but the on-chain value is used as source of truth.
 */

import { toHex } from 'viem'
import type { Hex, PublicClient, WalletClient } from 'viem'
import {
  multiVaultCreateAtoms,
  multiVaultCreateTriples,
  eventParseAtomCreated,
  eventParseTripleCreated,
} from '@0xintuition/protocol'
import type { WriteConfig } from '@0xintuition/protocol'
import {
  MULTIVAULT_ADDRESS,
  TX_DELAY_MS,
  ATOM_CHUNK_SIZE,
  TRIPLE_CHUNK_SIZE,
  PROVENANCE_CHUNK_SIZE,
} from './config'
import {
  calculateAtomId,
  calculateTripleId,
} from '@0xintuition/sdk'
import { batchIsTermCreated } from './read-batcher'
import type {
  PublishPlan,
  PublishEvent,
  PublishRunResult,
  TriplePlanItem,
  ProvenancePlanItem,
} from './types'

// ── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeWriteConfig(
  walletClient: WalletClient,
  publicClient: PublicClient,
): WriteConfig {
  return {
    address: MULTIVAULT_ADDRESS,
    publicClient,
    walletClient,
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

/** Encode a string to hex bytes — same encoding as existence-resolver uses for calculateAtomId */
function stringToAtomData(str: string): Hex {
  return toHex(new TextEncoder().encode(str))
}

/** Compute atom term ID from normalized data */
function computeAtomTermId(normalizedData: string): Hex {
  return calculateAtomId(stringToAtomData(normalizedData))
}

// ── Main executor ───────────────────────────────────────────────────────────

export async function* executePublishPlan(
  plan: PublishPlan,
  walletClient: WalletClient,
  publicClient: PublicClient,
): AsyncGenerator<PublishEvent> {
  // Verify wallet connection before starting
  console.log('🔍 Publish executor starting - checking wallet connection...')
  console.log('WalletClient:', walletClient ? 'Present' : 'MISSING')
  console.log('PublicClient:', publicClient ? 'Present' : 'MISSING')

  if (walletClient) {
    try {
      const account = walletClient.account
      const chain = walletClient.chain
      console.log('Wallet account:', account?.address || 'No account')
      console.log('Wallet chain:', chain?.id || 'No chain')
    } catch (e) {
      console.error('Error checking wallet details:', e)
    }
  }

  const config = makeWriteConfig(walletClient, publicClient)

  // Track created term IDs for cross-phase lookups
  const createdAtomTermIds = new Map<string, Hex>()
  const createdTripleTermIds = new Map<string, Hex>()

  // Pre-populate with existing items (already on-chain)
  for (const atom of plan.atoms.existing) {
    createdAtomTermIds.set(atom.atomId, atom.computedTermId)
  }
  for (const t of plan.triples.existing) {
    createdTripleTermIds.set(t.tripleId, t.computedTripleTermId)
  }

  const atomCost = plan.estimatedCost.atomCostPerUnit
  const tripleCost = plan.estimatedCost.tripleCostPerUnit
  // Seed deposit added on top of the protocol creation cost so each fresh
  // vault opens with a real user position (= generalConfig.minDeposit, read
  // dynamically by the existence-resolver). assets[i] = cost + extraDeposit.
  const extraDeposit = plan.estimatedCost.extraDepositPerUnit
  const atomAssetPerUnit = atomCost + extraDeposit
  const tripleAssetPerUnit = tripleCost + extraDeposit

  // ── Phase 1: Batch create atoms ───────────────────────────────────────────

  const atomsToCreate = plan.atoms.toCreate

  // IMPROVED FIX: Verify which atoms actually exist and get their real term IDs
  console.log('🔧 IMPROVED FIX: Checking which atoms actually exist on-chain...')

  const realExistingAtoms: typeof atomsToCreate = []
  const needToCreate: typeof atomsToCreate = []
  const atomTermIdToAtom = new Map<string, typeof atomsToCreate[0][]>()

  for (const atom of atomsToCreate) {
    const computedTermId = computeAtomTermId(atom.normalizedData)
    const key = computedTermId.toLowerCase()
    if (!atomTermIdToAtom.has(key)) {
      atomTermIdToAtom.set(key, [])
    }
    atomTermIdToAtom.get(key)!.push(atom)
  }

  const atomRecheckTermIds = Array.from(atomTermIdToAtom.keys()) as Hex[]
  // assumeMissing: a read failure must NOT mark an atom as already existing —
  // that would skip its creation forever and break every triple referencing it.
  // Treat unknowns as "needs creation"; the per-chunk recheck and the
  // MultiVault_AtomExists handler below are the net against double-creation.
  // (Restores the legacy "if can't check, try to create" semantics.)
  const atomRecheckResults = await batchIsTermCreated(publicClient, atomRecheckTermIds, {
    failureMode: 'assumeMissing',
  })

  for (const [, atoms] of atomTermIdToAtom) {
    for (const atom of atoms) {
      const termId = computeAtomTermId(atom.normalizedData)
      const exists = atomRecheckResults.get(termId.toLowerCase() as Hex) ?? false
      if (exists) {
        createdAtomTermIds.set(atom.atomId, termId)
        realExistingAtoms.push(atom)
        console.log(`✅ FOUND existing atom: "${atom.normalizedData}" (${atom.atomId})`)
      } else {
        needToCreate.push(atom)
        console.log(`❌ NEEDS creation: "${atom.normalizedData}" (${atom.atomId})`)
      }
    }
  }

  console.log(`Found ${realExistingAtoms.length} existing atoms, ${needToCreate.length} need creation`)

  // Deduplicate atoms by their normalized data to avoid creating duplicates
  const atomsByData = new Map<string, typeof needToCreate[0]>()
  for (const atom of needToCreate) {
    if (!atomsByData.has(atom.normalizedData)) {
      atomsByData.set(atom.normalizedData, atom)
    } else {
      // Map duplicate atoms to the first instance
      const termId = computeAtomTermId(atom.normalizedData)
      createdAtomTermIds.set(atom.atomId, termId)
      console.log(`🔄 Mapped duplicate atom: "${atom.normalizedData}" (${atom.atomId}) -> existing instance`)
    }
  }

  const finalAtomsToCreate = Array.from(atomsByData.values())
  console.log(`✅ ENABLING atom creation - ${finalAtomsToCreate.length} unique atoms will be created (${needToCreate.length} total requested), ${realExistingAtoms.length} already exist`)

  const atomChunks = chunkArray(finalAtomsToCreate, ATOM_CHUNK_SIZE)
  let atomsProcessed = 0
  let atomPhaseAborted = false

  yield {
    type: 'phase_start',
    phase: 'atoms',
    totalChunks: atomChunks.length,
    progress: { currentChunk: 0, totalChunks: atomChunks.length, itemsProcessed: 0, totalItems: finalAtomsToCreate.length },
  }

  for (let ci = 0; ci < atomChunks.length; ci++) {
    const chunk = atomChunks[ci]

    yield {
      type: 'chunk_pending',
      phase: 'atoms',
      chunkIndex: ci,
      totalChunks: atomChunks.length,
      progress: { currentChunk: ci, totalChunks: atomChunks.length, itemsProcessed: atomsProcessed, totalItems: finalAtomsToCreate.length },
    }

    // ── Per-chunk existence recheck (closes the recheck→write race) ──────────
    // An atom can be created (by another publisher on the shared testnet, or by
    // an earlier chunk in this run) between the initial recheck above and this
    // write. Re-check immediately before submitting and drop atoms that now
    // exist, so the contract call only ever creates genuinely-missing atoms.
    // assumeMissing: a read failure here still attempts the write — the
    // MultiVault_AtomExists handler below is the net against double-creation.
    const chunkRecheck = await batchIsTermCreated(
      publicClient,
      chunk.map((a) => a.computedTermId as Hex),
      { failureMode: 'assumeMissing' },
    )

    const submitChunk: typeof chunk = []
    const skippedMappings: PublishRunResult['atomMappings'] = []
    for (const atom of chunk) {
      const exists = chunkRecheck.get((atom.computedTermId as string).toLowerCase() as Hex) ?? false
      if (exists) {
        createdAtomTermIds.set(atom.atomId, atom.computedTermId)
        for (const needAtom of needToCreate) {
          if (needAtom.normalizedData === atom.normalizedData) {
            createdAtomTermIds.set(needAtom.atomId, atom.computedTermId)
          }
        }
        skippedMappings.push({
          atomId: atom.atomId,
          atomType: atom.atomType,
          normalizedData: atom.normalizedData,
          termId: atom.computedTermId as string,
          txHash: '',
          status: 'confirmed' as const,
          errorMessage: 'Atom already exists on-chain (skipped before write)',
        })
      } else {
        submitChunk.push(atom)
      }
    }

    // Entire chunk already on-chain — no write needed.
    if (submitChunk.length === 0) {
      atomsProcessed += chunk.length
      yield {
        type: 'chunk_success',
        phase: 'atoms',
        chunkIndex: ci,
        totalChunks: atomChunks.length,
        txHash: '',
        progress: { currentChunk: ci + 1, totalChunks: atomChunks.length, itemsProcessed: atomsProcessed, totalItems: finalAtomsToCreate.length },
        chunkMappings: { atomMappings: skippedMappings },
      }
      if (ci < atomChunks.length - 1) {
        await delay(TX_DELAY_MS)
      }
      continue
    }

    try {
      const hexDataArray = submitChunk.map((a) => stringToAtomData(a.normalizedData))
      const assetsArray = submitChunk.map(() => atomAssetPerUnit)
      const totalValue = atomAssetPerUnit * BigInt(submitChunk.length)

      console.log(`Creating atom chunk ${ci + 1}/${atomChunks.length}: ${submitChunk.length} to create, ${skippedMappings.length} already existed:`)
      submitChunk.forEach((atom, idx) => {
        console.log(`  [${idx}] "${atom.normalizedData}" (${atom.atomId})`)
      })

      const txHash = await multiVaultCreateAtoms(config, {
        args: [hexDataArray, assetsArray],
        value: totalValue,
      })

      // Wait for confirmation and parse AtomCreated events
      const events = await eventParseAtomCreated(publicClient, txHash)

      // Mismatch: tx mined but can't reliably map events to inputs — treat as failed
      if (events.length !== submitChunk.length) {
        const mismatchErr = `Event count mismatch: expected ${submitChunk.length}, got ${events.length}. Tx ${txHash} mined but items not trackable — rerun to resolve.`
        const failedMappings: PublishRunResult['atomMappings'] = submitChunk.map((atom) => ({
          atomId: atom.atomId,
          atomType: atom.atomType,
          normalizedData: atom.normalizedData,
          termId: atom.computedTermId as string,
          txHash: txHash as string,
          status: 'failed' as const,
          errorMessage: mismatchErr,
        }))

        atomsProcessed += chunk.length

        yield {
          type: 'chunk_failed',
          phase: 'atoms',
          chunkIndex: ci,
          totalChunks: atomChunks.length,
          error: mismatchErr,
          txHash: txHash as string,
          progress: { currentChunk: ci + 1, totalChunks: atomChunks.length, itemsProcessed: atomsProcessed, totalItems: finalAtomsToCreate.length },
          chunkMappings: { atomMappings: [...skippedMappings, ...failedMappings] },
        }

        atomPhaseAborted = true
        yield { type: 'abort', phase: 'atoms', error: `Atom chunk ${ci + 1}/${atomChunks.length} event mismatch — aborting before triples phase` }
        break
      }

      // Events match — verify each termId against pre-computed value
      const atomMappings: PublishRunResult['atomMappings'] = [...skippedMappings]
      for (let j = 0; j < submitChunk.length; j++) {
        const atom = submitChunk[j]
        const actualTermId = events[j].args.termId as Hex

        createdAtomTermIds.set(atom.atomId, actualTermId)

        // Also map any atoms in needToCreate that have the same normalized data
        for (const needAtom of needToCreate) {
          if (needAtom.normalizedData === atom.normalizedData) {
            createdAtomTermIds.set(needAtom.atomId, actualTermId)
          }
        }

        atomMappings.push({
          atomId: atom.atomId,
          atomType: atom.atomType,
          normalizedData: atom.normalizedData,
          termId: actualTermId as string,
          txHash: txHash as string,
          status: 'confirmed',
          errorMessage: actualTermId !== atom.computedTermId
            ? `TermId mismatch: expected ${atom.computedTermId}, got ${actualTermId}`
            : undefined,
        })
      }

      atomsProcessed += chunk.length

      yield {
        type: 'chunk_success',
        phase: 'atoms',
        chunkIndex: ci,
        totalChunks: atomChunks.length,
        txHash: txHash as string,
        progress: { currentChunk: ci + 1, totalChunks: atomChunks.length, itemsProcessed: atomsProcessed, totalItems: finalAtomsToCreate.length },
        chunkMappings: { atomMappings },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`Atom chunk ${ci + 1} failed:`, errorMsg)

      // MultiVault_AtomExists revert. The batch call is atomic: a revert means
      // NONE of the atoms in submitChunk were created this tx. Only the atom(s)
      // that already existed triggered it — the rest are still missing. Recheck
      // each one and confirm ONLY those genuinely on-chain; the remainder are
      // real failures and must not be silently marked confirmed.
      if (errorMsg.includes('MultiVault_AtomExists')) {
        console.log('Detected MultiVault_AtomExists — rechecking each atom in the chunk individually...')

        const existsAfterRevert = await batchIsTermCreated(
          publicClient,
          submitChunk.map((a) => a.computedTermId as Hex),
          { failureMode: 'assumeMissing' },
        )

        const confirmedMappings: PublishRunResult['atomMappings'] = []
        const stillMissing: typeof submitChunk = []
        for (const atom of submitChunk) {
          const exists = existsAfterRevert.get((atom.computedTermId as string).toLowerCase() as Hex) ?? false
          if (exists) {
            createdAtomTermIds.set(atom.atomId, atom.computedTermId)
            for (const needAtom of needToCreate) {
              if (needAtom.normalizedData === atom.normalizedData) {
                createdAtomTermIds.set(needAtom.atomId, atom.computedTermId)
              }
            }
            confirmedMappings.push({
              atomId: atom.atomId,
              atomType: atom.atomType,
              normalizedData: atom.normalizedData,
              termId: atom.computedTermId as string,
              txHash: '',
              status: 'confirmed' as const,
              errorMessage: 'Atom already exists on-chain (confirmed after AtomExists revert)',
            })
          } else {
            stillMissing.push(atom)
          }
        }

        atomsProcessed += chunk.length

        if (stillMissing.length === 0) {
          // Revert was caused purely by already-existing atoms — safe to continue.
          yield {
            type: 'chunk_success',
            phase: 'atoms',
            chunkIndex: ci,
            totalChunks: atomChunks.length,
            txHash: '',
            progress: { currentChunk: ci + 1, totalChunks: atomChunks.length, itemsProcessed: atomsProcessed, totalItems: finalAtomsToCreate.length },
            chunkMappings: { atomMappings: [...skippedMappings, ...confirmedMappings] },
          }
        } else {
          // Some atoms are genuinely still missing: the atomic revert means they
          // were NOT created. Surface them as failed and abort so the run resumes.
          const failedMappings: PublishRunResult['atomMappings'] = stillMissing.map((atom) => ({
            atomId: atom.atomId,
            atomType: atom.atomType,
            normalizedData: atom.normalizedData,
            termId: atom.computedTermId as string,
            txHash: '',
            status: 'failed' as const,
            errorMessage: 'MultiVault_AtomExists reverted the chunk; this atom is still not on-chain and must be retried',
          }))

          yield {
            type: 'chunk_failed',
            phase: 'atoms',
            chunkIndex: ci,
            totalChunks: atomChunks.length,
            error: `MultiVault_AtomExists: ${confirmedMappings.length} already existed, ${stillMissing.length} still missing`,
            progress: { currentChunk: ci + 1, totalChunks: atomChunks.length, itemsProcessed: atomsProcessed, totalItems: finalAtomsToCreate.length },
            chunkMappings: { atomMappings: [...skippedMappings, ...confirmedMappings, ...failedMappings] },
          }

          atomPhaseAborted = true
          yield { type: 'abort', phase: 'atoms', error: `Atom chunk ${ci + 1}/${atomChunks.length} partially reverted (AtomExists) — aborting before triples phase` }
          break
        }
      } else {
        // Build failed mappings for all atoms in this chunk
        const failedMappings: PublishRunResult['atomMappings'] = submitChunk.map((atom) => ({
          atomId: atom.atomId,
          atomType: atom.atomType,
          normalizedData: atom.normalizedData,
          termId: atom.computedTermId as string,
          txHash: '',
          status: 'failed' as const,
          errorMessage: errorMsg,
        }))

        atomsProcessed += chunk.length

        yield {
          type: 'chunk_failed',
          phase: 'atoms',
          chunkIndex: ci,
          totalChunks: atomChunks.length,
          error: errorMsg,
          progress: { currentChunk: ci + 1, totalChunks: atomChunks.length, itemsProcessed: atomsProcessed, totalItems: finalAtomsToCreate.length },
          chunkMappings: { atomMappings: [...skippedMappings, ...failedMappings] },
        }

        // ABORT: atom chunk failure stops before triples phase
        atomPhaseAborted = true
        yield { type: 'abort', phase: 'atoms', error: `Atom chunk ${ci + 1}/${atomChunks.length} failed — aborting before triples phase` }
        break
      }
    }

    if (ci < atomChunks.length - 1) {
      await delay(TX_DELAY_MS)
    }
  }

  yield { type: 'phase_end', phase: 'atoms' }

  if (atomPhaseAborted) {
    yield { type: 'complete' }
    return
  }

  // ── Phase 2: Batch create triples ─────────────────────────────────────────

  const triplesToCreate = plan.triples.toCreate
  console.log(`Starting triples phase with ${triplesToCreate.length} triples to create`)
  console.log(`Available atom term IDs: ${createdAtomTermIds.size}`)

  const tripleChunks = chunkArray(triplesToCreate, TRIPLE_CHUNK_SIZE)
  let triplesProcessed = 0
  const confirmedTripleIds = new Set<string>()

  // Pre-populate confirmed set with existing triples
  for (const t of plan.triples.existing) {
    confirmedTripleIds.add(t.tripleId)
  }

  yield {
    type: 'phase_start',
    phase: 'triples',
    totalChunks: tripleChunks.length,
    progress: { currentChunk: 0, totalChunks: tripleChunks.length, itemsProcessed: 0, totalItems: triplesToCreate.length },
  }

  for (let ci = 0; ci < tripleChunks.length; ci++) {
    const chunk = tripleChunks[ci]

    // Separate valid triples (all atom termIds available) from skipped ones
    const validTriples: TriplePlanItem[] = []
    const skippedTriples: TriplePlanItem[] = []

    for (const triple of chunk) {
      const sub = createdAtomTermIds.get(triple.subjectAtomId)
      const pred = createdAtomTermIds.get(triple.predicateAtomId)
      const obj = createdAtomTermIds.get(triple.objectAtomId)

      if (sub && pred && obj) {
        validTriples.push(triple)
      } else {
        console.log(`⚠️  Skipping triple ${triple.tripleId}:`)
        if (!sub) console.log(`  Subject ${triple.subjectAtomId}: MISSING`)
        if (!pred) console.log(`  Predicate ${triple.predicateAtomId}: MISSING`)
        if (!obj) console.log(`  Object ${triple.objectAtomId}: MISSING`)
        skippedTriples.push(triple)
      }
    }

    console.log(`Triple chunk ${ci + 1}: ${validTriples.length} valid, ${skippedTriples.length} skipped`)

    yield {
      type: 'chunk_pending',
      phase: 'triples',
      chunkIndex: ci,
      totalChunks: tripleChunks.length,
      progress: { currentChunk: ci, totalChunks: tripleChunks.length, itemsProcessed: triplesProcessed, totalItems: triplesToCreate.length },
    }

    // Start with mappings for skipped triples
    const claimMappings: PublishRunResult['claimMappings'] = skippedTriples.map((t) => ({
      tripleId: t.tripleId,
      claimGroup: t.claimGroup,
      originRowId: t.originRowId,
      subjectTermId: t.subjectTermId as string,
      predicateTermId: t.predicateTermId as string,
      objectTermId: t.objectTermId as string,
      tripleTermId: t.computedTripleTermId as string,
      txHash: '',
      status: 'failed' as const,
      errorMessage: 'Missing atom term ID for subject, predicate, or object',
    }))

    if (validTriples.length === 0) {
      triplesProcessed += chunk.length
      yield {
        type: 'chunk_failed',
        phase: 'triples',
        chunkIndex: ci,
        totalChunks: tripleChunks.length,
        error: 'All triples in chunk skipped (missing atom termIds)',
        progress: { currentChunk: ci + 1, totalChunks: tripleChunks.length, itemsProcessed: triplesProcessed, totalItems: triplesToCreate.length },
        chunkMappings: { claimMappings },
      }
      continue // Continue to next triple chunk
    }

    // ── Triple safety guard (mirror of the atom IMPROVED FIX) ───────────────
    // 1. Recompute each triple's term_id from the *live* atom term_ids.
    // 2. Dedup intra-batch by computed term_id.
    // 3. Recheck on-chain existence just before submission.
    // 4. Triples that already exist or duplicate another in the batch are
    //    marked 'confirmed' (so provenance can target them) and dropped
    //    from the createTriples call. This is the same pattern as for
    //    atoms — it eliminates the entire MultiVault_TripleExists revert
    //    class without sacrificing correctness.

    type EffectiveTriple = {
      planItem: TriplePlanItem
      effSubjectId: Hex
      effPredicateId: Hex
      effObjectId: Hex
      effTripleTermId: Hex
    }
    const effectiveTriples: EffectiveTriple[] = validTriples.map((t) => {
      const sub = createdAtomTermIds.get(t.subjectAtomId)!
      const pred = createdAtomTermIds.get(t.predicateAtomId)!
      const obj = createdAtomTermIds.get(t.objectAtomId)!
      return {
        planItem: t,
        effSubjectId: sub,
        effPredicateId: pred,
        effObjectId: obj,
        effTripleTermId: calculateTripleId(sub, pred, obj),
      }
    })

    const seenInBatch = new Set<string>()
    const triplesToSubmit: EffectiveTriple[] = []
    const dedupedTriples: EffectiveTriple[] = []
    const preConfirmed: Array<{ et: EffectiveTriple; reason: string }> = []

    // Dedup within batch
    for (const et of effectiveTriples) {
      const key = et.effTripleTermId.toLowerCase()
      if (seenInBatch.has(key)) {
        preConfirmed.push({ et, reason: 'Duplicate within batch (skipped — same triple termId already submitted)' })
        continue
      }
      seenInBatch.add(key)
      dedupedTriples.push(et)
    }

    // Batch-check existence for deduped triples
    if (dedupedTriples.length > 0) {
      const recheckTermIds = dedupedTriples.map((et) => et.effTripleTermId)
      const recheckResults = await batchIsTermCreated(publicClient, recheckTermIds, {
        failureMode: 'assumeExists',
      })

      for (const et of dedupedTriples) {
        const exists = recheckResults.get(et.effTripleTermId.toLowerCase() as Hex) ?? true
        if (exists) {
          preConfirmed.push({ et, reason: 'Triple already exists on-chain (skipped)' })
        } else {
          triplesToSubmit.push(et)
        }
      }
    }

    // Persist the pre-confirmed (existing/dup) triples so provenance can find them.
    for (const { et, reason } of preConfirmed) {
      createdTripleTermIds.set(et.planItem.tripleId, et.effTripleTermId)
      confirmedTripleIds.add(et.planItem.tripleId)
      claimMappings.push({
        tripleId: et.planItem.tripleId,
        claimGroup: et.planItem.claimGroup,
        originRowId: et.planItem.originRowId,
        subjectTermId: et.effSubjectId as string,
        predicateTermId: et.effPredicateId as string,
        objectTermId: et.effObjectId as string,
        tripleTermId: et.effTripleTermId as string,
        txHash: '',
        status: 'confirmed',
        errorMessage: reason,
      })
    }

    if (triplesToSubmit.length === 0) {
      triplesProcessed += chunk.length
      console.log(`Triple chunk ${ci + 1}: all ${effectiveTriples.length} triple(s) already exist or were deduped — skipping createTriples`)
      yield {
        type: 'chunk_success',
        phase: 'triples',
        chunkIndex: ci,
        totalChunks: tripleChunks.length,
        txHash: '',
        progress: { currentChunk: ci + 1, totalChunks: tripleChunks.length, itemsProcessed: triplesProcessed, totalItems: triplesToCreate.length },
        chunkMappings: { claimMappings },
      }
      continue
    }

    console.log(`Triple chunk ${ci + 1}: ${preConfirmed.length} pre-confirmed (existing/dup), ${triplesToSubmit.length} new to submit`)

    try {
      const subjectIds = triplesToSubmit.map((et) => et.effSubjectId)
      const predicateIds = triplesToSubmit.map((et) => et.effPredicateId)
      const objectIds = triplesToSubmit.map((et) => et.effObjectId)
      const assetsArray = triplesToSubmit.map(() => tripleAssetPerUnit)
      const totalValue = tripleAssetPerUnit * BigInt(triplesToSubmit.length)

      console.log(`🚀 About to call createTriples for ${triplesToSubmit.length} triples`)
      console.log(`Triple cost: ${tripleCost}, Total value: ${totalValue}`)

      const txHash = await multiVaultCreateTriples(config, {
        args: [subjectIds, predicateIds, objectIds, assetsArray],
        value: totalValue,
      })

      console.log(`✅ Triple creation succeeded! TxHash: ${txHash}`)

      // Wait for confirmation and parse TripleCreated events
      const events = await eventParseTripleCreated(publicClient, txHash)

      // Mismatch: tx mined but can't reliably map events to inputs
      if (events.length !== triplesToSubmit.length) {
        const mismatchErr = `Event count mismatch: expected ${triplesToSubmit.length}, got ${events.length}. Tx ${txHash} mined but items not trackable — rerun to resolve.`
        for (const et of triplesToSubmit) {
          // Don't add to confirmedTripleIds — provenance won't target these
          claimMappings.push({
            tripleId: et.planItem.tripleId,
            claimGroup: et.planItem.claimGroup,
            originRowId: et.planItem.originRowId,
            subjectTermId: et.effSubjectId as string,
            predicateTermId: et.effPredicateId as string,
            objectTermId: et.effObjectId as string,
            tripleTermId: et.effTripleTermId as string,
            txHash: txHash as string,
            status: 'failed',
            errorMessage: mismatchErr,
          })
        }

        triplesProcessed += chunk.length

        yield {
          type: 'chunk_failed',
          phase: 'triples',
          chunkIndex: ci,
          totalChunks: tripleChunks.length,
          error: mismatchErr,
          txHash: txHash as string,
          progress: { currentChunk: ci + 1, totalChunks: tripleChunks.length, itemsProcessed: triplesProcessed, totalItems: triplesToCreate.length },
          chunkMappings: { claimMappings },
        }
        continue // Continue to next triple chunk
      }

      // Events match — verify each termId
      for (let j = 0; j < triplesToSubmit.length; j++) {
        const et = triplesToSubmit[j]
        const actualTermId = events[j].args.termId as Hex

        createdTripleTermIds.set(et.planItem.tripleId, actualTermId)
        confirmedTripleIds.add(et.planItem.tripleId)
        claimMappings.push({
          tripleId: et.planItem.tripleId,
          claimGroup: et.planItem.claimGroup,
          originRowId: et.planItem.originRowId,
          subjectTermId: et.effSubjectId as string,
          predicateTermId: et.effPredicateId as string,
          objectTermId: et.effObjectId as string,
          tripleTermId: actualTermId as string,
          txHash: txHash as string,
          status: 'confirmed',
          errorMessage: actualTermId !== et.effTripleTermId
            ? `TermId mismatch: expected ${et.effTripleTermId}, got ${actualTermId}`
            : undefined,
        })
      }

      triplesProcessed += chunk.length

      yield {
        type: 'chunk_success',
        phase: 'triples',
        chunkIndex: ci,
        totalChunks: tripleChunks.length,
        txHash: txHash as string,
        progress: { currentChunk: ci + 1, totalChunks: tripleChunks.length, itemsProcessed: triplesProcessed, totalItems: triplesToCreate.length },
        chunkMappings: { claimMappings },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`❌ Triple creation failed for chunk ${ci + 1}:`, errorMsg)

      // Residual TripleExists race (recheck → createTriples is not atomic):
      // mark all triples in the submitted set as confirmed using their
      // computed term_ids. Same recovery semantics as the AtomExists handler.
      if (errorMsg.includes('MultiVault_TripleExists')) {
        console.log('Detected TripleExists revert. Marking submitted triples as existing and continuing…')
        for (const et of triplesToSubmit) {
          createdTripleTermIds.set(et.planItem.tripleId, et.effTripleTermId)
          confirmedTripleIds.add(et.planItem.tripleId)
          claimMappings.push({
            tripleId: et.planItem.tripleId,
            claimGroup: et.planItem.claimGroup,
            originRowId: et.planItem.originRowId,
            subjectTermId: et.effSubjectId as string,
            predicateTermId: et.effPredicateId as string,
            objectTermId: et.effObjectId as string,
            tripleTermId: et.effTripleTermId as string,
            txHash: '',
            status: 'confirmed',
            errorMessage: 'Triple already exists on-chain (recovered from revert)',
          })
        }

        triplesProcessed += chunk.length
        yield {
          type: 'chunk_success',
          phase: 'triples',
          chunkIndex: ci,
          totalChunks: tripleChunks.length,
          txHash: '',
          progress: { currentChunk: ci + 1, totalChunks: tripleChunks.length, itemsProcessed: triplesProcessed, totalItems: triplesToCreate.length },
          chunkMappings: { claimMappings },
        }
        continue
      }

      for (const et of triplesToSubmit) {
        claimMappings.push({
          tripleId: et.planItem.tripleId,
          claimGroup: et.planItem.claimGroup,
          originRowId: et.planItem.originRowId,
          subjectTermId: et.effSubjectId as string,
          predicateTermId: et.effPredicateId as string,
          objectTermId: et.effObjectId as string,
          tripleTermId: et.effTripleTermId as string,
          txHash: '',
          status: 'failed',
          errorMessage: errorMsg,
        })
      }

      triplesProcessed += chunk.length

      yield {
        type: 'chunk_failed',
        phase: 'triples',
        chunkIndex: ci,
        totalChunks: tripleChunks.length,
        error: errorMsg,
        progress: { currentChunk: ci + 1, totalChunks: tripleChunks.length, itemsProcessed: triplesProcessed, totalItems: triplesToCreate.length },
        chunkMappings: { claimMappings },
      }
      // Continue to next triple chunk (not aborting)
    }

    if (ci < tripleChunks.length - 1) {
      await delay(TX_DELAY_MS)
    }
  }

  yield { type: 'phase_end', phase: 'triples' }

  // ── Phase 3: Batch create provenance triples ──────────────────────────────

  // Only create provenance for triples that were actually confirmed
  const provToCreate = plan.provenance.toCreate.filter(
    (p) => confirmedTripleIds.has(p.claimTripleId),
  )

  const provenanceChunks = chunkArray(provToCreate, PROVENANCE_CHUNK_SIZE)
  let provenanceProcessed = 0

  yield {
    type: 'phase_start',
    phase: 'provenance',
    totalChunks: provenanceChunks.length,
    progress: { currentChunk: 0, totalChunks: provenanceChunks.length, itemsProcessed: 0, totalItems: provToCreate.length },
  }

  for (let ci = 0; ci < provenanceChunks.length; ci++) {
    const chunk = provenanceChunks[ci]

    // Separate valid from skipped
    const validProvs: ProvenancePlanItem[] = []
    const skippedProvs: ProvenancePlanItem[] = []

    for (const prov of chunk) {
      const claimTermId = createdTripleTermIds.get(prov.claimTripleId)
      const sourceTermId = createdAtomTermIds.get(prov.sourceAtomId)
      const predTermId = createdAtomTermIds.get(prov.predicateAtomId) ?? prov.predicateTermId

      if (claimTermId && sourceTermId && predTermId) {
        validProvs.push(prov)
      } else {
        skippedProvs.push(prov)
      }
    }

    yield {
      type: 'chunk_pending',
      phase: 'provenance',
      chunkIndex: ci,
      totalChunks: provenanceChunks.length,
      progress: { currentChunk: ci, totalChunks: provenanceChunks.length, itemsProcessed: provenanceProcessed, totalItems: provToCreate.length },
    }

    const provenanceMappings: PublishRunResult['provenanceMappings'] = skippedProvs.map((p) => ({
      tripleId: p.claimTripleId,
      sourceAtomId: p.sourceAtomId,
      relation: p.relation,
      predicateTermId: p.predicateTermId as string,
      provenanceTripleTermId: p.computedTripleTermId as string,
      txHash: '',
      status: 'failed' as const,
      errorMessage: 'Missing term ID for claim triple, source, or predicate',
    }))

    if (validProvs.length === 0) {
      provenanceProcessed += chunk.length
      yield {
        type: 'chunk_failed',
        phase: 'provenance',
        chunkIndex: ci,
        totalChunks: provenanceChunks.length,
        error: 'All provenance in chunk skipped (missing termIds)',
        progress: { currentChunk: ci + 1, totalChunks: provenanceChunks.length, itemsProcessed: provenanceProcessed, totalItems: provToCreate.length },
        chunkMappings: { provenanceMappings },
      }
      continue
    }

    // ── Provenance safety guard (mirror of triple-phase guard) ─────────────
    // Recompute each provenance triple_term_id from the live atom/triple
    // term_ids, dedup intra-batch, and recheck on-chain. Skip existing/dup.

    type EffectiveProv = {
      planItem: ProvenancePlanItem
      effSubjectId: Hex   // claim triple term_id
      effPredicateId: Hex // based_on term_id
      effObjectId: Hex    // source atom term_id
      effTripleTermId: Hex
    }
    const effectiveProvs: EffectiveProv[] = validProvs.map((p) => {
      const claimTermId = createdTripleTermIds.get(p.claimTripleId)!
      const pred = createdAtomTermIds.get(p.predicateAtomId) ?? p.predicateTermId
      const sourceTermId = createdAtomTermIds.get(p.sourceAtomId)!
      const sub = p.relation === 'includes_claim' ? sourceTermId : claimTermId
      const obj = p.relation === 'includes_claim' ? claimTermId : sourceTermId
      return {
        planItem: p,
        effSubjectId: sub,
        effPredicateId: pred,
        effObjectId: obj,
        effTripleTermId: calculateTripleId(sub, pred, obj),
      }
    })

    const seenProvInBatch = new Set<string>()
    const provsToSubmit: EffectiveProv[] = []
    const dedupedProvs: EffectiveProv[] = []
    const preConfirmedProvs: Array<{ ep: EffectiveProv; reason: string }> = []

    // Dedup within batch
    for (const ep of effectiveProvs) {
      const key = ep.effTripleTermId.toLowerCase()
      if (seenProvInBatch.has(key)) {
        preConfirmedProvs.push({ ep, reason: 'Duplicate within batch (skipped)' })
        continue
      }
      seenProvInBatch.add(key)
      dedupedProvs.push(ep)
    }

    // Batch-check existence for deduped provenance
    if (dedupedProvs.length > 0) {
      const recheckTermIds = dedupedProvs.map((ep) => ep.effTripleTermId)
      const recheckResults = await batchIsTermCreated(publicClient, recheckTermIds, {
        failureMode: 'assumeExists',
      })

      for (const ep of dedupedProvs) {
        const exists = recheckResults.get(ep.effTripleTermId.toLowerCase() as Hex) ?? true
        if (exists) {
          preConfirmedProvs.push({ ep, reason: 'Provenance triple already exists on-chain (skipped)' })
        } else {
          provsToSubmit.push(ep)
        }
      }
    }

    for (const { ep, reason } of preConfirmedProvs) {
      provenanceMappings.push({
        tripleId: ep.planItem.claimTripleId,
        sourceAtomId: ep.planItem.sourceAtomId,
        relation: ep.planItem.relation,
        predicateTermId: ep.effPredicateId as string,
        provenanceTripleTermId: ep.effTripleTermId as string,
        txHash: '',
        status: 'confirmed',
        errorMessage: reason,
      })
    }

    if (provsToSubmit.length === 0) {
      provenanceProcessed += chunk.length
      console.log(`Provenance chunk ${ci + 1}: all ${effectiveProvs.length} already exist or deduped — skipping createTriples`)
      yield {
        type: 'chunk_success',
        phase: 'provenance',
        chunkIndex: ci,
        totalChunks: provenanceChunks.length,
        txHash: '',
        progress: { currentChunk: ci + 1, totalChunks: provenanceChunks.length, itemsProcessed: provenanceProcessed, totalItems: provToCreate.length },
        chunkMappings: { provenanceMappings },
      }
      continue
    }

    try {
      // Provenance/membership triples can use either:
      // [claim_triple] --[based_on]--> [source_atom], or
      // [export_run] --[includes_claim]--> [claim_triple].
      const subjectIds = provsToSubmit.map((ep) => ep.effSubjectId)
      const predicateIds = provsToSubmit.map((ep) => ep.effPredicateId)
      const objectIds = provsToSubmit.map((ep) => ep.effObjectId)
      const assetsArray = provsToSubmit.map(() => tripleAssetPerUnit)
      const totalValue = tripleAssetPerUnit * BigInt(provsToSubmit.length)

      const txHash = await multiVaultCreateTriples(config, {
        args: [subjectIds, predicateIds, objectIds, assetsArray],
        value: totalValue,
      })

      const events = await eventParseTripleCreated(publicClient, txHash)

      // Mismatch: tx mined but can't reliably map events to inputs
      if (events.length !== provsToSubmit.length) {
        const mismatchErr = `Event count mismatch: expected ${provsToSubmit.length}, got ${events.length}. Tx ${txHash} mined but items not trackable — rerun to resolve.`
        for (const ep of provsToSubmit) {
          provenanceMappings.push({
            tripleId: ep.planItem.claimTripleId,
            sourceAtomId: ep.planItem.sourceAtomId,
            relation: ep.planItem.relation,
            predicateTermId: ep.effPredicateId as string,
            provenanceTripleTermId: ep.effTripleTermId as string,
            txHash: txHash as string,
            status: 'failed',
            errorMessage: mismatchErr,
          })
        }

        provenanceProcessed += chunk.length

        yield {
          type: 'chunk_failed',
          phase: 'provenance',
          chunkIndex: ci,
          totalChunks: provenanceChunks.length,
          error: mismatchErr,
          txHash: txHash as string,
          progress: { currentChunk: ci + 1, totalChunks: provenanceChunks.length, itemsProcessed: provenanceProcessed, totalItems: provToCreate.length },
          chunkMappings: { provenanceMappings },
        }
        continue // Continue to next provenance chunk
      }

      // Events match — verify each termId
      for (let j = 0; j < provsToSubmit.length; j++) {
        const ep = provsToSubmit[j]
        const actualTermId = events[j].args.termId as Hex

        provenanceMappings.push({
          tripleId: ep.planItem.claimTripleId,
          sourceAtomId: ep.planItem.sourceAtomId,
          relation: ep.planItem.relation,
          predicateTermId: ep.effPredicateId as string,
          provenanceTripleTermId: actualTermId as string,
          txHash: txHash as string,
          status: 'confirmed',
          errorMessage: actualTermId !== ep.effTripleTermId
            ? `TermId mismatch: expected ${ep.effTripleTermId}, got ${actualTermId}`
            : undefined,
        })
      }

      provenanceProcessed += chunk.length

      yield {
        type: 'chunk_success',
        phase: 'provenance',
        chunkIndex: ci,
        totalChunks: provenanceChunks.length,
        txHash: txHash as string,
        progress: { currentChunk: ci + 1, totalChunks: provenanceChunks.length, itemsProcessed: provenanceProcessed, totalItems: provToCreate.length },
        chunkMappings: { provenanceMappings },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)

      // Residual TripleExists race: mark as confirmed using computed term_ids.
      if (errorMsg.includes('MultiVault_TripleExists')) {
        console.log('Detected TripleExists revert in provenance. Marking as existing and continuing…')
        for (const ep of provsToSubmit) {
          provenanceMappings.push({
            tripleId: ep.planItem.claimTripleId,
            sourceAtomId: ep.planItem.sourceAtomId,
            relation: ep.planItem.relation,
            predicateTermId: ep.effPredicateId as string,
            provenanceTripleTermId: ep.effTripleTermId as string,
            txHash: '',
            status: 'confirmed',
            errorMessage: 'Provenance triple already exists on-chain (recovered from revert)',
          })
        }

        provenanceProcessed += chunk.length
        yield {
          type: 'chunk_success',
          phase: 'provenance',
          chunkIndex: ci,
          totalChunks: provenanceChunks.length,
          txHash: '',
          progress: { currentChunk: ci + 1, totalChunks: provenanceChunks.length, itemsProcessed: provenanceProcessed, totalItems: provToCreate.length },
          chunkMappings: { provenanceMappings },
        }
        continue
      }

      for (const ep of provsToSubmit) {
        provenanceMappings.push({
          tripleId: ep.planItem.claimTripleId,
          sourceAtomId: ep.planItem.sourceAtomId,
          relation: ep.planItem.relation,
          predicateTermId: ep.effPredicateId as string,
          provenanceTripleTermId: ep.effTripleTermId as string,
          txHash: '',
          status: 'failed',
          errorMessage: errorMsg,
        })
      }

      provenanceProcessed += chunk.length

      yield {
        type: 'chunk_failed',
        phase: 'provenance',
        chunkIndex: ci,
        totalChunks: provenanceChunks.length,
        error: errorMsg,
        progress: { currentChunk: ci + 1, totalChunks: provenanceChunks.length, itemsProcessed: provenanceProcessed, totalItems: provToCreate.length },
        chunkMappings: { provenanceMappings },
      }
      // Continue to next provenance chunk
    }

    if (ci < provenanceChunks.length - 1) {
      await delay(TX_DELAY_MS)
    }
  }

  yield { type: 'phase_end', phase: 'provenance' }
  yield { type: 'complete' }
}
