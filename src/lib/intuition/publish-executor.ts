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
      const assetsArray = chunk.map(() => atomCost)
      const totalValue = atomCost * BigInt(chunk.length)

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

    try {
      const subjectIds = validTriples.map((t) => createdAtomTermIds.get(t.subjectAtomId)!)
      const predicateIds = validTriples.map((t) => createdAtomTermIds.get(t.predicateAtomId)!)
      const objectIds = validTriples.map((t) => createdAtomTermIds.get(t.objectAtomId)!)
      const assetsArray = validTriples.map(() => tripleCost)
      const totalValue = tripleCost * BigInt(validTriples.length)

      console.log(`🚀 About to call createTriples for ${validTriples.length} triples`)
      console.log(`Triple cost: ${tripleCost}, Total value: ${totalValue}`)
      console.log(`Wallet client status:`, walletClient ? 'Connected' : 'NOT CONNECTED')
      console.log(`Public client status:`, publicClient ? 'Available' : 'NOT AVAILABLE')

      // Log first few triples for debugging
      validTriples.slice(0, 3).forEach((t, i) => {
        console.log(`Triple ${i + 1}:`, {
          subject: subjectIds[i],
          predicate: predicateIds[i],
          object: objectIds[i]
        })
      })

      console.log(`🔄 Calling multiVaultCreateTriples...`)

      const txHash = await multiVaultCreateTriples(config, {
        args: [subjectIds, predicateIds, objectIds, assetsArray],
        value: totalValue,
      })

      console.log(`✅ Triple creation succeeded! TxHash: ${txHash}`)

      // Wait for confirmation and parse TripleCreated events
      const events = await eventParseTripleCreated(publicClient, txHash)

      // Mismatch: tx mined but can't reliably map events to inputs
      if (events.length !== validTriples.length) {
        const mismatchErr = `Event count mismatch: expected ${validTriples.length}, got ${events.length}. Tx ${txHash} mined but items not trackable — rerun to resolve.`
        for (const t of validTriples) {
          // Don't add to confirmedTripleIds — provenance won't target these
          claimMappings.push({
            tripleId: t.tripleId,
            claimGroup: t.claimGroup,
            originRowId: t.originRowId,
            subjectTermId: t.subjectTermId as string,
            predicateTermId: t.predicateTermId as string,
            objectTermId: t.objectTermId as string,
            tripleTermId: t.computedTripleTermId as string,
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
      for (let j = 0; j < validTriples.length; j++) {
        const triple = validTriples[j]
        const actualTermId = events[j].args.termId as Hex

        createdTripleTermIds.set(triple.tripleId, actualTermId)
        confirmedTripleIds.add(triple.tripleId)
        claimMappings.push({
          tripleId: triple.tripleId,
          claimGroup: triple.claimGroup,
          originRowId: triple.originRowId,
          subjectTermId: triple.subjectTermId as string,
          predicateTermId: triple.predicateTermId as string,
          objectTermId: triple.objectTermId as string,
          tripleTermId: actualTermId as string,
          txHash: txHash as string,
          status: 'confirmed',
          errorMessage: actualTermId !== triple.computedTripleTermId
            ? `TermId mismatch: expected ${triple.computedTripleTermId}, got ${actualTermId}`
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
      console.error(`Full error:`, err)

      for (const t of validTriples) {
        claimMappings.push({
          tripleId: t.tripleId,
          claimGroup: t.claimGroup,
          originRowId: t.originRowId,
          subjectTermId: t.subjectTermId as string,
          predicateTermId: t.predicateTermId as string,
          objectTermId: t.objectTermId as string,
          tripleTermId: t.computedTripleTermId as string,
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

    try {
      // Provenance triple: [claim_triple] --[based_on]--> [source_atom]
      const subjectIds = validProvs.map((p) => createdTripleTermIds.get(p.claimTripleId)!)
      const predicateIds = validProvs.map((p) =>
        createdAtomTermIds.get('atom:predicate:based_on') ?? p.predicateTermId,
      )
      const objectIds = validProvs.map((p) => createdAtomTermIds.get(p.sourceAtomId)!)
      const assetsArray = validProvs.map(() => tripleCost)
      const totalValue = tripleCost * BigInt(validProvs.length)

      const txHash = await multiVaultCreateTriples(config, {
        args: [subjectIds, predicateIds, objectIds, assetsArray],
        value: totalValue,
      })

      const events = await eventParseTripleCreated(publicClient, txHash)

      // Mismatch: tx mined but can't reliably map events to inputs
      if (events.length !== validProvs.length) {
        const mismatchErr = `Event count mismatch: expected ${validProvs.length}, got ${events.length}. Tx ${txHash} mined but items not trackable — rerun to resolve.`
        for (const p of validProvs) {
          provenanceMappings.push({
            tripleId: p.claimTripleId,
            sourceAtomId: p.sourceAtomId,
            provenanceTripleTermId: p.computedTripleTermId as string,
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
      for (let j = 0; j < validProvs.length; j++) {
        const prov = validProvs[j]
        const actualTermId = events[j].args.termId as Hex

        provenanceMappings.push({
          tripleId: prov.claimTripleId,
          sourceAtomId: prov.sourceAtomId,
          provenanceTripleTermId: actualTermId as string,
          txHash: txHash as string,
          status: 'confirmed',
          errorMessage: actualTermId !== prov.computedTripleTermId
            ? `TermId mismatch: expected ${prov.computedTripleTermId}, got ${actualTermId}`
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

      for (const p of validProvs) {
        provenanceMappings.push({
          tripleId: p.claimTripleId,
          sourceAtomId: p.sourceAtomId,
          provenanceTripleTermId: p.computedTripleTermId as string,
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
