/**
 * Resolves which atoms and triples from a RawBundle already exist on-chain.
 *
 * Uses deterministic ID calculation (Keccak256) to pre-compute term IDs,
 * then checks existence via the Intuition SDK.
 */

import { toHex } from 'viem'
import type { Hex, PublicClient } from 'viem'
import {
  calculateAtomId,
  calculateTripleId,
  multiVaultIsTermCreated,
  multiVaultGetAtomCost,
  multiVaultGetTripleCost,
} from '@0xintuition/sdk'
import { MULTIVAULT_ADDRESS, ATOM_CHUNK_SIZE, TRIPLE_CHUNK_SIZE, PROVENANCE_CHUNK_SIZE } from './config'
import type { RawBundle, RawAtomEntry, RawTripleEntry, RawProvenanceEntry } from './bundle-builder'
import type { AtomPlanItem, TriplePlanItem, ProvenancePlanItem, PublishPlan } from './types'

// ── Helpers ─────────────────────────────────────────────────────────────────

function stringToAtomData(str: string): Hex {
  return toHex(new TextEncoder().encode(str))
}

function computeAtomTermId(normalizedData: string): Hex {
  return calculateAtomId(stringToAtomData(normalizedData))
}

function computeTripleTermId(
  subjectTermId: Hex,
  predicateTermId: Hex,
  objectTermId: Hex,
): Hex {
  return calculateTripleId(subjectTermId, predicateTermId, objectTermId)
}

// ── Additional helper for double-checking atoms before creation ─────────────

export async function recheckAtomExistence(
  atoms: RawAtomEntry[],
  publicClient: PublicClient,
): Promise<Map<string, { exists: boolean; termId: Hex }>> {
  const readConfig = { address: MULTIVAULT_ADDRESS, publicClient }
  const resultMap = new Map<string, { exists: boolean; termId: Hex }>()

  // Check atoms in smaller batches to avoid rate limits
  for (let i = 0; i < atoms.length; i += 10) {
    const batch = atoms.slice(i, i + 10)

    const checks = await Promise.all(
      batch.map(async (atom) => {
        const termId = computeAtomTermId(atom.normalizedData)
        try {
          const exists = await multiVaultIsTermCreated(readConfig, { args: [termId] })
          console.log(`Recheck atom: "${atom.normalizedData}" (${atom.atomId}) => ${exists ? 'EXISTS' : 'NOT_FOUND'}`)
          return { atomId: atom.atomId, exists, termId }
        } catch (error) {
          console.error(`Recheck failed for atom "${atom.normalizedData}" (${atom.atomId}):`, error)
          // Be conservative - assume it exists if we can't check
          return { atomId: atom.atomId, exists: true, termId }
        }
      })
    )

    for (const { atomId, exists, termId } of checks) {
      resultMap.set(atomId, { exists, termId })
    }

    // Small delay to avoid rate limiting
    if (i + 10 < atoms.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  return resultMap
}

// ── Main resolver ───────────────────────────────────────────────────────────

export async function resolveExistence(
  bundle: RawBundle,
  publicClient: PublicClient,
): Promise<PublishPlan> {
  const readConfig = { address: MULTIVAULT_ADDRESS, publicClient }

  // 1. Compute term IDs for all atoms
  const atomTermIds = new Map<string, Hex>()
  for (const atom of bundle.atoms) {
    const termId = computeAtomTermId(atom.normalizedData)
    atomTermIds.set(atom.atomId, termId)
  }

  // 2. Check atom existence in batches
  const atomPlanItems: AtomPlanItem[] = []
  const atomEntries = bundle.atoms

  for (let i = 0; i < atomEntries.length; i += 20) {
    const batch = atomEntries.slice(i, i + 20)
    const existenceChecks = await Promise.all(
      batch.map(async (atom) => {
        const termId = atomTermIds.get(atom.atomId)!
        try {
          const exists = await multiVaultIsTermCreated(readConfig, { args: [termId] })
          console.log(`Atom existence check: "${atom.normalizedData}" (${atom.atomId}) => ${exists ? 'EXISTS' : 'NOT_FOUND'}`)
          return { atom, termId, exists }
        } catch (error) {
          console.error(`Failed to check existence for atom "${atom.normalizedData}" (${atom.atomId}):`, error)
          // On error, be conservative: assume it exists to avoid duplicate creation
          return { atom, termId, exists: true }
        }
      }),
    )

    for (const { atom, termId, exists } of existenceChecks) {
      atomPlanItems.push({
        atomId: atom.atomId,
        atomType: atom.atomType,
        normalizedData: atom.normalizedData,
        computedTermId: termId,
        exists,
      })
    }
  }

  // 3. Build atom lookup for triple resolution
  const atomTermIdLookup = new Map<string, Hex>()
  for (const item of atomPlanItems) {
    atomTermIdLookup.set(item.atomId, item.computedTermId)
  }

  // 4. Compute and check triple existence
  const triplePlanItems: TriplePlanItem[] = []

  for (let i = 0; i < bundle.triples.length; i += 20) {
    const batch = bundle.triples.slice(i, i + 20)
    const tripleChecks = await Promise.all(
      batch.map(async (triple) => {
        const subjectTermId = atomTermIdLookup.get(triple.subjectAtomId)
        const predicateTermId = atomTermIdLookup.get(triple.predicateAtomId)
        const objectTermId = atomTermIdLookup.get(triple.objectAtomId)

        if (!subjectTermId || !predicateTermId || !objectTermId) {
          return { triple, exists: false, subjectTermId: '0x0' as Hex, predicateTermId: '0x0' as Hex, objectTermId: '0x0' as Hex, computedTripleTermId: '0x0' as Hex }
        }

        const computedTripleTermId = computeTripleTermId(subjectTermId, predicateTermId, objectTermId)

        try {
          const exists = await multiVaultIsTermCreated(readConfig, { args: [computedTripleTermId] })
          return { triple, exists, subjectTermId, predicateTermId, objectTermId, computedTripleTermId }
        } catch {
          return { triple, exists: false, subjectTermId, predicateTermId, objectTermId, computedTripleTermId }
        }
      }),
    )

    for (const check of tripleChecks) {
      triplePlanItems.push({
        tripleId: check.triple.tripleId,
        claimGroup: check.triple.claimGroup,
        originRowId: check.triple.originRowId,
        subjectAtomId: check.triple.subjectAtomId,
        predicateAtomId: check.triple.predicateAtomId,
        objectAtomId: check.triple.objectAtomId,
        subjectTermId: check.subjectTermId,
        predicateTermId: check.predicateTermId,
        objectTermId: check.objectTermId,
        computedTripleTermId: check.computedTripleTermId,
        exists: check.exists,
      })
    }
  }

  // 5. Compute and check provenance triple existence
  const provenancePlanItems: ProvenancePlanItem[] = []

  // We need the term IDs from already-resolved claim triples
  const claimTripleTermIds = new Map<string, Hex>()
  for (const t of triplePlanItems) {
    claimTripleTermIds.set(t.tripleId, t.computedTripleTermId)
  }

  for (let i = 0; i < bundle.provenance.length; i += 20) {
    const batch = bundle.provenance.slice(i, i + 20)
    const provChecks = await Promise.all(
      batch.map(async (prov) => {
        const claimTripleTermId = claimTripleTermIds.get(prov.claimTripleId)
        const sourceTermId = atomTermIdLookup.get(prov.sourceAtomId)
        const predicateTermId = atomTermIdLookup.get(prov.predicateAtomId)

        if (!claimTripleTermId || !sourceTermId || !predicateTermId) {
          return { prov, exists: false, claimTripleTermId: '0x0' as Hex, sourceTermId: '0x0' as Hex, predicateTermId: '0x0' as Hex, computedTripleTermId: '0x0' as Hex }
        }

        // Provenance triple: [claim_triple] -- [based_on] --> [source_atom]
        const computedTripleTermId = computeTripleTermId(claimTripleTermId, predicateTermId, sourceTermId)

        try {
          const exists = await multiVaultIsTermCreated(readConfig, { args: [computedTripleTermId] })
          return { prov, exists, claimTripleTermId, sourceTermId, predicateTermId, computedTripleTermId }
        } catch {
          return { prov, exists: false, claimTripleTermId, sourceTermId, predicateTermId, computedTripleTermId }
        }
      }),
    )

    for (const check of provChecks) {
      provenancePlanItems.push({
        claimTripleId: check.prov.claimTripleId,
        claimTripleTermId: check.claimTripleTermId,
        sourceAtomId: check.prov.sourceAtomId,
        sourceTermId: check.sourceTermId,
        predicateTermId: check.predicateTermId,
        computedTripleTermId: check.computedTripleTermId,
        exists: check.exists,
      })
    }
  }

  // 6. Get cost estimates from on-chain config
  let atomCost: bigint
  let tripleCost: bigint

  try {
    ;[atomCost, tripleCost] = await Promise.all([
      multiVaultGetAtomCost(readConfig),
      multiVaultGetTripleCost(readConfig),
    ])
  } catch {
    // Fallback to safe defaults if chain query fails
    atomCost = BigInt('400000000000000')   // 0.0004 ETH
    tripleCost = BigInt('400000000000000') // 0.0004 ETH
  }

  const atomsToCreate = atomPlanItems.filter((a) => !a.exists)
  const atomsExisting = atomPlanItems.filter((a) => a.exists)
  const triplesToCreate = triplePlanItems.filter((t) => !t.exists)
  const triplesExisting = triplePlanItems.filter((t) => t.exists)
  const provToCreate = provenancePlanItems.filter((p) => !p.exists)
  const provExisting = provenancePlanItems.filter((p) => p.exists)

  return {
    tokenId: bundle.tokenId,
    tokenName: bundle.tokenName,
    tokenTicker: bundle.tokenTicker,
    atoms: { toCreate: atomsToCreate, existing: atomsExisting },
    triples: { toCreate: triplesToCreate, existing: triplesExisting },
    provenance: { toCreate: provToCreate, existing: provExisting },
    estimatedCost: {
      atomCostPerUnit: atomCost,
      tripleCostPerUnit: tripleCost,
      totalAtomsCost: atomCost * BigInt(atomsToCreate.length),
      totalTriplesCost: tripleCost * BigInt(triplesToCreate.length),
      totalProvenanceCost: tripleCost * BigInt(provToCreate.length),
      totalCost:
        atomCost * BigInt(atomsToCreate.length) +
        tripleCost * BigInt(triplesToCreate.length) +
        tripleCost * BigInt(provToCreate.length),
    },
    summary: {
      atomsToCreate: atomsToCreate.length,
      atomsExisting: atomsExisting.length,
      triplesToCreate: triplesToCreate.length,
      triplesExisting: triplesExisting.length,
      provenanceToCreate: provToCreate.length,
      provenanceExisting: provExisting.length,
    },
    batchInfo: {
      atomChunkSize: ATOM_CHUNK_SIZE,
      tripleChunkSize: TRIPLE_CHUNK_SIZE,
      provenanceChunkSize: PROVENANCE_CHUNK_SIZE,
      atomChunks: Math.ceil(atomsToCreate.length / ATOM_CHUNK_SIZE) || 0,
      tripleChunks: Math.ceil(triplesToCreate.length / TRIPLE_CHUNK_SIZE) || 0,
      provenanceChunks: Math.ceil(provToCreate.length / PROVENANCE_CHUNK_SIZE) || 0,
      estimatedWalletSignatures:
        (Math.ceil(atomsToCreate.length / ATOM_CHUNK_SIZE) || 0) +
        (Math.ceil(triplesToCreate.length / TRIPLE_CHUNK_SIZE) || 0) +
        (Math.ceil(provToCreate.length / PROVENANCE_CHUNK_SIZE) || 0),
    },
  }
}
