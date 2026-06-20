/**
 * Resolves which atoms and triples from a RawBundle already exist on-chain.
 *
 * Uses deterministic ID calculation (Keccak256) to pre-compute term IDs,
 * then checks existence via batched multicall reads.
 */

import { toHex } from 'viem'
import type { Hex, PublicClient } from 'viem'
import {
  calculateAtomId,
  calculateTripleId,
} from '@0xintuition/sdk'
import { ATOM_CHUNK_SIZE, TRIPLE_CHUNK_SIZE, PROVENANCE_CHUNK_SIZE } from './config'
import type { RawBundle } from './bundle-builder'
import type { AtomPlanItem, TriplePlanItem, ProvenancePlanItem, PublishPlan } from './types'
import {
  batchIsTermCreated,
  batchPreviewAtomCreates,
  batchPreviewTripleCreates,
  readPublishConfig,
} from './read-batcher'

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

// ── Main resolver ───────────────────────────────────────────────────────────

export async function resolveExistence(
  bundle: RawBundle,
  publicClient: PublicClient,
): Promise<PublishPlan> {
  // 1. Compute term IDs for all atoms
  const atomTermIds = new Map<string, Hex>()
  for (const atom of bundle.atoms) {
    const termId = computeAtomTermId(atom.normalizedData)
    atomTermIds.set(atom.atomId, termId)
  }

  // 2. Batch-check atom existence (conservative: assume exists on failure)
  const allAtomTermIds = Array.from(atomTermIds.values())
  const atomExistence = await batchIsTermCreated(publicClient, allAtomTermIds, {
    failureMode: 'assumeExists',
  })

  const atomPlanItems: AtomPlanItem[] = bundle.atoms.map((atom) => {
    const termId = atomTermIds.get(atom.atomId)!
    const exists = atomExistence.get(termId.toLowerCase() as Hex) ?? true
    return {
      atomId: atom.atomId,
      atomType: atom.atomType,
      normalizedData: atom.normalizedData,
      computedTermId: termId,
      exists,
    }
  })

  const existingAtomCount = atomPlanItems.filter((a) => a.exists).length
  console.log(
    `Atom existence batch: ${existingAtomCount} exist, ` +
    `${atomPlanItems.length - existingAtomCount} to create (${atomPlanItems.length} total)`,
  )

  // 3. Build atom lookup for triple resolution
  const atomTermIdLookup = new Map<string, Hex>()
  for (const item of atomPlanItems) {
    atomTermIdLookup.set(item.atomId, item.computedTermId)
  }

  // 4. Compute triple term IDs and batch-check existence
  const triplePlanItems: TriplePlanItem[] = []
  const validTripleTermIds: Hex[] = []
  const tripleIndexToTermId = new Map<number, Hex>()

  for (let i = 0; i < bundle.triples.length; i++) {
    const triple = bundle.triples[i]
    const subjectTermId = atomTermIdLookup.get(triple.subjectAtomId)
    const predicateTermId = atomTermIdLookup.get(triple.predicateAtomId)
    const objectTermId = atomTermIdLookup.get(triple.objectAtomId)

    if (!subjectTermId || !predicateTermId || !objectTermId) {
      triplePlanItems.push({
        tripleId: triple.tripleId,
        claimGroup: triple.claimGroup,
        originRowId: triple.originRowId,
        subjectAtomId: triple.subjectAtomId,
        predicateAtomId: triple.predicateAtomId,
        objectAtomId: triple.objectAtomId,
        subjectTermId: '0x0' as Hex,
        predicateTermId: '0x0' as Hex,
        objectTermId: '0x0' as Hex,
        computedTripleTermId: '0x0' as Hex,
        exists: false,
      })
      continue
    }

    const computedTripleTermId = computeTripleTermId(subjectTermId, predicateTermId, objectTermId)
    validTripleTermIds.push(computedTripleTermId)
    tripleIndexToTermId.set(i, computedTripleTermId)

    triplePlanItems.push({
      tripleId: triple.tripleId,
      claimGroup: triple.claimGroup,
      originRowId: triple.originRowId,
      subjectAtomId: triple.subjectAtomId,
      predicateAtomId: triple.predicateAtomId,
      objectAtomId: triple.objectAtomId,
      subjectTermId,
      predicateTermId,
      objectTermId,
      computedTripleTermId,
      exists: false, // updated below
    })
  }

  if (validTripleTermIds.length > 0) {
    const tripleExistence = await batchIsTermCreated(publicClient, validTripleTermIds, {
      failureMode: 'assumeMissing',
    })

    for (const [index, termId] of tripleIndexToTermId) {
      triplePlanItems[index].exists = tripleExistence.get(termId.toLowerCase() as Hex) ?? false
    }
  }

  const existingTripleCount = triplePlanItems.filter((t) => t.exists).length
  console.log(
    `Triple existence batch: ${existingTripleCount} exist, ` +
    `${triplePlanItems.length - existingTripleCount} to create (${triplePlanItems.length} total)`,
  )

  // 5. Compute provenance triple term IDs and batch-check existence
  const provenancePlanItems: ProvenancePlanItem[] = []
  const claimTripleTermIds = new Map<string, Hex>()
  for (const t of triplePlanItems) {
    claimTripleTermIds.set(t.tripleId, t.computedTripleTermId)
  }

  const validProvTermIds: Hex[] = []
  const provIndexToTermId = new Map<number, Hex>()

  for (let i = 0; i < bundle.provenance.length; i++) {
    const prov = bundle.provenance[i]
    const claimTripleTermId = claimTripleTermIds.get(prov.claimTripleId)
    const sourceTermId = atomTermIdLookup.get(prov.sourceAtomId)
    const predicateTermId = atomTermIdLookup.get(prov.predicateAtomId)

    if (!claimTripleTermId || !sourceTermId || !predicateTermId) {
      provenancePlanItems.push({
        linkId: prov.linkId,
        relation: prov.relation,
        claimTripleId: prov.claimTripleId,
        claimTripleTermId: '0x0' as Hex,
        sourceAtomId: prov.sourceAtomId,
        sourceTermId: '0x0' as Hex,
        predicateAtomId: prov.predicateAtomId,
        predicateTermId: '0x0' as Hex,
        subjectTermId: '0x0' as Hex,
        objectTermId: '0x0' as Hex,
        computedTripleTermId: '0x0' as Hex,
        exists: false,
      })
      continue
    }

    const subjectTermId = prov.relation === 'includes_claim'
      ? sourceTermId
      : claimTripleTermId
    const objectTermId = prov.relation === 'includes_claim'
      ? claimTripleTermId
      : sourceTermId
    const computedTripleTermId = computeTripleTermId(subjectTermId, predicateTermId, objectTermId)

    validProvTermIds.push(computedTripleTermId)
    provIndexToTermId.set(i, computedTripleTermId)

    provenancePlanItems.push({
      linkId: prov.linkId,
      relation: prov.relation,
      claimTripleId: prov.claimTripleId,
      claimTripleTermId,
      sourceAtomId: prov.sourceAtomId,
      sourceTermId,
      predicateAtomId: prov.predicateAtomId,
      predicateTermId,
      subjectTermId,
      objectTermId,
      computedTripleTermId,
      exists: false, // updated below
    })
  }

  if (validProvTermIds.length > 0) {
    const provExistence = await batchIsTermCreated(publicClient, validProvTermIds, {
      failureMode: 'assumeMissing',
    })

    for (const [index, termId] of provIndexToTermId) {
      provenancePlanItems[index].exists = provExistence.get(termId.toLowerCase() as Hex) ?? false
    }
  }

  const existingProvCount = provenancePlanItems.filter((p) => p.exists).length
  console.log(
    `Provenance existence batch: ${existingProvCount} exist, ` +
    `${provenancePlanItems.length - existingProvCount} to create (${provenancePlanItems.length} total)`,
  )

  // 6. Get cost estimates via batched config read
  const { atomCost, tripleCost, extraDepositPerUnit } = await readPublishConfig(publicClient)

  const atomUnit = atomCost + extraDepositPerUnit
  const tripleUnit = tripleCost + extraDepositPerUnit

  const atomsToCreate = atomPlanItems.filter((a) => !a.exists)
  const atomsExisting = atomPlanItems.filter((a) => a.exists)
  const triplesToCreate = triplePlanItems.filter((t) => !t.exists)
  const triplesExisting = triplePlanItems.filter((t) => t.exists)
  const provToCreate = provenancePlanItems.filter((p) => !p.exists)
  const provExisting = provenancePlanItems.filter((p) => p.exists)

  // 7. Batch-preview creations to catch zero-share edge cases
  if (atomsToCreate.length > 0) {
    await batchPreviewAtomCreates(
      publicClient,
      atomsToCreate.map((a) => ({
        id: a.atomId,
        termId: a.computedTermId,
        assets: atomUnit,
      })),
    )
  }

  const allTriplesToPreview = [
    ...triplesToCreate.map((t) => ({
      id: t.tripleId,
      termId: t.computedTripleTermId,
      assets: tripleUnit,
    })),
    ...provToCreate.map((p) => ({
      id: p.linkId,
      termId: p.computedTripleTermId,
      assets: tripleUnit,
    })),
  ]

  if (allTriplesToPreview.length > 0) {
    await batchPreviewTripleCreates(publicClient, allTriplesToPreview)
  }

  return {
    tokenId: bundle.tokenId,
    tokenName: bundle.tokenName,
    tokenTicker: bundle.tokenTicker,
    exportRun: {
      exportRunId: bundle.exportRun.exportRunId,
      atomId: bundle.exportRun.atomId,
      normalizedData: bundle.exportRun.normalizedData,
      computedTermId: atomTermIds.get(bundle.exportRun.atomId)!,
    },
    atoms: { toCreate: atomsToCreate, existing: atomsExisting },
    triples: { toCreate: triplesToCreate, existing: triplesExisting },
    provenance: { toCreate: provToCreate, existing: provExisting },
    estimatedCost: {
      atomCostPerUnit: atomCost,
      tripleCostPerUnit: tripleCost,
      extraDepositPerUnit,
      totalAtomsCost: atomUnit * BigInt(atomsToCreate.length),
      totalTriplesCost: tripleUnit * BigInt(triplesToCreate.length),
      totalProvenanceCost: tripleUnit * BigInt(provToCreate.length),
      totalCost:
        atomUnit * BigInt(atomsToCreate.length) +
        tripleUnit * BigInt(triplesToCreate.length) +
        tripleUnit * BigInt(provToCreate.length),
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
