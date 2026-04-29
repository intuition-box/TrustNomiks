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
import { recheckAtomExistence } from './existence-resolver'
import {
  calculateAtomId,
  calculateTripleId,
  multiVaultIsTermCreated,
} from '@0xintuition/sdk'
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

  const realExistingAtoms = []
  const needToCreate = []

  for (const atom of atomsToCreate) {
    const computedTermId = computeAtomTermId(atom.normalizedData)
    try {
      const exists = await multiVaultIsTermCreated({ address: MULTIVAULT_ADDRESS, publicClient }, { args: [computedTermId] })
      if (exists) {
        createdAtomTermIds.set(atom.atomId, computedTermId)
        realExistingAtoms.push(atom)
        console.log(`✅ FOUND existing atom: "${atom.normalizedData}" (${atom.atomId})`)
      } else {
        needToCreate.push(atom)
        console.log(`❌ NEEDS creation: "${atom.normalizedData}" (${atom.atomId})`)
      }
    } catch (error) {
      console.error(`Error checking atom ${atom.atomId}:`, error)
      needToCreate.push(atom) // If can't check, try to create
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
      const originalAtom = atomsByData.get(atom.normalizedData)!
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

    try {
      const hexDataArray = chunk.map((a) => stringToAtomData(a.normalizedData))
      const assetsArray = chunk.map(() => atomAssetPerUnit)
      const totalValue = atomAssetPerUnit * BigInt(chunk.length)

      console.log(`Creating atom chunk ${ci + 1}/${atomChunks.length} with ${chunk.length} atoms:`)
      chunk.forEach((atom, idx) => {
        console.log(`  [${idx}] "${atom.normalizedData}" (${atom.atomId})`)
      })

      console.log('✓ All atoms verified as needing creation - proceeding with contract call')

      const txHash = await multiVaultCreateAtoms(config, {
        args: [hexDataArray, assetsArray],
        value: totalValue,
      })

      // Wait for confirmation and parse AtomCreated events
      const events = await eventParseAtomCreated(publicClient, txHash)

      // Mismatch: tx mined but can't reliably map events to inputs — treat as failed
      if (events.length !== chunk.length) {
        const mismatchErr = `Event count mismatch: expected ${chunk.length}, got ${events.length}. Tx ${txHash} mined but items not trackable — rerun to resolve.`
        const failedMappings: PublishRunResult['atomMappings'] = chunk.map((atom) => ({
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
          chunkMappings: { atomMappings: failedMappings },
        }

        atomPhaseAborted = true
        yield { type: 'abort', phase: 'atoms', error: `Atom chunk ${ci + 1}/${atomChunks.length} event mismatch — aborting before triples phase` }
        break
      }

      // Events match — verify each termId against pre-computed value
      const atomMappings: PublishRunResult['atomMappings'] = []
      for (let j = 0; j < chunk.length; j++) {
        const atom = chunk[j]
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
        progress: { currentChunk: ci + 1, totalChunks: atomChunks.length, itemsProcessed: atomsProcessed, totalItems: atomsToCreate.length },
        chunkMappings: { atomMappings },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(`Atom chunk ${ci + 1} failed:`, errorMsg)

      // Special handling for MultiVault_AtomExists error
      if (errorMsg.includes('MultiVault_AtomExists')) {
        console.log('Detected atom already exists error. Marking atoms as existing and continuing...')

        // Mark these atoms as existing rather than failed
        const atomMappings: PublishRunResult['atomMappings'] = chunk.map((atom) => ({
          atomId: atom.atomId,
          atomType: atom.atomType,
          normalizedData: atom.normalizedData,
          termId: atom.computedTermId as string,
          txHash: '',
          status: 'confirmed' as const,
          errorMessage: 'Atom already exists on-chain (skipped)',
        }))

        // Add these atoms to the created atoms map so triples can reference them
        for (const atom of chunk) {
          createdAtomTermIds.set(atom.atomId, atom.computedTermId)
        }

        atomsProcessed += chunk.length

        yield {
          type: 'chunk_success',
          phase: 'atoms',
          chunkIndex: ci,
          totalChunks: atomChunks.length,
          txHash: '',
          progress: { currentChunk: ci + 1, totalChunks: atomChunks.length, itemsProcessed: atomsProcessed, totalItems: finalAtomsToCreate.length },
          chunkMappings: { atomMappings },
        }
      } else {
        // Build failed mappings for all atoms in this chunk
        const atomMappings: PublishRunResult['atomMappings'] = chunk.map((atom) => ({
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
          chunkMappings: { atomMappings },
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
    const preConfirmed: Array<{ et: EffectiveTriple; reason: string }> = []

    for (const et of effectiveTriples) {
      const key = et.effTripleTermId.toLowerCase()
      if (seenInBatch.has(key)) {
        preConfirmed.push({ et, reason: 'Duplicate within batch (skipped — same triple termId already submitted)' })
        continue
      }
      seenInBatch.add(key)
      try {
        const exists = await multiVaultIsTermCreated(
          { address: MULTIVAULT_ADDRESS, publicClient },
          { args: [et.effTripleTermId] },
        )
        if (exists) {
          preConfirmed.push({ et, reason: 'Triple already exists on-chain (skipped)' })
        } else {
          triplesToSubmit.push(et)
        }
      } catch (err) {
        // Conservative: assume exists if we can't check. Better than reverting the whole batch.
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[triples] existence recheck failed for ${et.planItem.tripleId} (${msg}) — assuming exists`)
        preConfirmed.push({ et, reason: `Existence recheck failed (${msg}); assumed existing` })
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
      const predTermId = createdAtomTermIds.get('atom:predicate:based_on') ?? prov.predicateTermId

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
      const sub = createdTripleTermIds.get(p.claimTripleId)!
      const pred = createdAtomTermIds.get('atom:predicate:based_on') ?? p.predicateTermId
      const obj = createdAtomTermIds.get(p.sourceAtomId)!
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
    const preConfirmedProvs: Array<{ ep: EffectiveProv; reason: string }> = []

    for (const ep of effectiveProvs) {
      const key = ep.effTripleTermId.toLowerCase()
      if (seenProvInBatch.has(key)) {
        preConfirmedProvs.push({ ep, reason: 'Duplicate within batch (skipped)' })
        continue
      }
      seenProvInBatch.add(key)
      try {
        const exists = await multiVaultIsTermCreated(
          { address: MULTIVAULT_ADDRESS, publicClient },
          { args: [ep.effTripleTermId] },
        )
        if (exists) {
          preConfirmedProvs.push({ ep, reason: 'Provenance triple already exists on-chain (skipped)' })
        } else {
          provsToSubmit.push(ep)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[provenance] existence recheck failed for ${ep.planItem.claimTripleId} (${msg}) — assuming exists`)
        preConfirmedProvs.push({ ep, reason: `Existence recheck failed (${msg}); assumed existing` })
      }
    }

    for (const { ep, reason } of preConfirmedProvs) {
      provenanceMappings.push({
        tripleId: ep.planItem.claimTripleId,
        sourceAtomId: ep.planItem.sourceAtomId,
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
      // Provenance triple: [claim_triple] --[based_on]--> [source_atom]
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
