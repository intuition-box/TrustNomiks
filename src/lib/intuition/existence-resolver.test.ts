import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Hex } from 'viem'
import type { RawBundle } from './bundle-builder'

// Mock @0xintuition/sdk
vi.mock('@0xintuition/sdk', () => ({
  calculateAtomId: vi.fn((data: Hex) => data),
  calculateTripleId: vi.fn((s: Hex, p: Hex, o: Hex) =>
    `${s}${p}${o}`.slice(0, 66) as Hex,
  ),
}))

// Mock read-batcher — tests target the orchestration logic, not the RPC layer
const mockBatchIsTermCreated = vi.fn()
const mockBatchPreviewAtomCreates = vi.fn()
const mockBatchPreviewTripleCreates = vi.fn()
const mockReadPublishConfig = vi.fn()

vi.mock('./read-batcher', () => ({
  batchIsTermCreated: (...args: unknown[]) => mockBatchIsTermCreated(...args),
  batchPreviewAtomCreates: (...args: unknown[]) => mockBatchPreviewAtomCreates(...args),
  batchPreviewTripleCreates: (...args: unknown[]) => mockBatchPreviewTripleCreates(...args),
  readPublishConfig: (...args: unknown[]) => mockReadPublishConfig(...args),
}))

import { resolveExistence } from './existence-resolver'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TERM_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1' as Hex
const TERM_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1' as Hex
const TERM_C = '0xccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc1' as Hex

function makeBundle(): RawBundle {
  return {
    tokenId: 'token-1',
    tokenName: 'TestCoin',
    tokenTicker: 'TEST',
    exportRun: {
      exportRunId: 'run-1',
      atomId: 'atom:export-run:run-1',
      normalizedData: 'export:run-1',
    },
    atoms: [
      { atomId: 'atom:token:TestCoin', atomType: 'token', normalizedData: 'token:TestCoin' },
      { atomId: 'atom:predicate:has_name', atomType: 'predicate', normalizedData: 'predicate:has_name' },
      { atomId: 'atom:literal:TestCoin', atomType: 'literal', normalizedData: 'literal:TestCoin' },
    ],
    triples: [
      {
        tripleId: 'triple:1',
        claimGroup: null,
        originRowId: null,
        subjectAtomId: 'atom:token:TestCoin',
        predicateAtomId: 'atom:predicate:has_name',
        objectAtomId: 'atom:literal:TestCoin',
      },
    ],
    provenance: [],
  }
}

function publicClient() {
  return {} as unknown as import('viem').PublicClient
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('resolveExistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock: return false for all queried termIds (nothing exists yet)
    mockBatchIsTermCreated.mockImplementation(async (_client: unknown, termIds: Hex[]) => {
      const map = new Map<Hex, boolean>()
      for (const id of termIds) {
        map.set((id as string).toLowerCase() as Hex, false)
      }
      return map
    })
    mockReadPublishConfig.mockResolvedValue({
      atomCost: BigInt('400000000000000'),
      tripleCost: BigInt('400000000000000'),
      extraDepositPerUnit: BigInt('100000000000000'),
    })
    mockBatchPreviewAtomCreates.mockResolvedValue(undefined)
    mockBatchPreviewTripleCreates.mockResolvedValue(undefined)
  })

  it('returns a PublishPlan with the correct shape', async () => {
    const plan = await resolveExistence(makeBundle(), publicClient())

    expect(plan.tokenId).toBe('token-1')
    expect(plan.tokenName).toBe('TestCoin')
    expect(plan.tokenTicker).toBe('TEST')
    expect(plan.atoms).toBeDefined()
    expect(plan.triples).toBeDefined()
    expect(plan.provenance).toBeDefined()
    expect(plan.estimatedCost).toBeDefined()
    expect(plan.summary).toBeDefined()
    expect(plan.batchInfo).toBeDefined()
    expect(plan.exportRun).toBeDefined()
  })

  it('checks atom existence via batched call with assumeExists', async () => {
    await resolveExistence(makeBundle(), publicClient())

    expect(mockBatchIsTermCreated).toHaveBeenCalled()
    // First call is for atoms
    const atomCall = mockBatchIsTermCreated.mock.calls[0]
    expect(atomCall[1]).toHaveLength(3) // 3 atoms
    expect(atomCall[2]).toEqual({ failureMode: 'assumeExists' })
  })

  it('correctly separates existing and new atoms', async () => {
    // The mock SDK passes through the data as the term ID
    // So term IDs are the encoded normalizedData strings
    // Mock: first atom exists, others don't
    mockBatchIsTermCreated.mockImplementation(async (_client: unknown, termIds: Hex[]) => {
      const map = new Map<Hex, boolean>()
      for (const id of termIds) {
        map.set(id.toLowerCase() as Hex, false)
      }
      // Mark the first one as existing
      const firstKey = (termIds[0] as string).toLowerCase() as Hex
      map.set(firstKey, true)
      return map
    })

    const plan = await resolveExistence(makeBundle(), publicClient())

    expect(plan.atoms.existing).toHaveLength(1)
    expect(plan.atoms.toCreate).toHaveLength(2)
    expect(plan.summary.atomsExisting).toBe(1)
    expect(plan.summary.atomsToCreate).toBe(2)
  })

  it('checks triple existence for valid triples', async () => {
    const bundle = makeBundle()
    await resolveExistence(bundle, publicClient())

    // Second batchIsTermCreated call should be for triples
    const tripleCallArgs = mockBatchIsTermCreated.mock.calls.find(
      (call: unknown[]) => (call[2] as Record<string, string>)?.failureMode === 'assumeMissing',
    )
    expect(tripleCallArgs).toBeDefined()
  })

  it('skips triple existence check when there are no triples', async () => {
    const bundle = makeBundle()
    bundle.triples = []
    await resolveExistence(bundle, publicClient())

    // Only atom batchIsTermCreated should have been called
    const calls = mockBatchIsTermCreated.mock.calls
    const tripleCalls = calls.filter(
      (call: unknown[]) => (call[2] as Record<string, string>)?.failureMode === 'assumeMissing',
    )
    expect(tripleCalls).toHaveLength(0)
  })

  it('reads config via readPublishConfig', async () => {
    await resolveExistence(makeBundle(), publicClient())

    expect(mockReadPublishConfig).toHaveBeenCalledTimes(1)
  })

  it('computes correct cost estimates', async () => {
    mockReadPublishConfig.mockResolvedValue({
      atomCost: BigInt('100'),
      tripleCost: BigInt('200'),
      extraDepositPerUnit: BigInt('10'),
    })

    // No atoms exist → all 3 are toCreate, 1 triple toCreate
    const plan = await resolveExistence(makeBundle(), publicClient())

    // atomUnit = 100 + 10 = 110, tripleUnit = 200 + 10 = 210
    expect(plan.estimatedCost.totalAtomsCost).toBe(BigInt(110 * 3))
    expect(plan.estimatedCost.totalTriplesCost).toBe(BigInt(210 * 1))
    expect(plan.estimatedCost.totalCost).toBe(BigInt(110 * 3 + 210 * 1))
  })

  it('previews atom creations when atoms need to be created', async () => {
    await resolveExistence(makeBundle(), publicClient())

    expect(mockBatchPreviewAtomCreates).toHaveBeenCalledTimes(1)
    const previewCall = mockBatchPreviewAtomCreates.mock.calls[0]
    expect(previewCall[1]).toHaveLength(3) // 3 atoms to create
  })

  it('skips atom preview when all atoms exist', async () => {
    // All atoms exist
    mockBatchIsTermCreated.mockResolvedValue(
      new Map<Hex, boolean>([
        [TERM_A.toLowerCase() as Hex, true],
        [TERM_B.toLowerCase() as Hex, true],
        [TERM_C.toLowerCase() as Hex, true],
      ]),
    )

    await resolveExistence(makeBundle(), publicClient())

    expect(mockBatchPreviewAtomCreates).not.toHaveBeenCalled()
  })

  it('previews triple creations including provenance', async () => {
    const bundle = makeBundle()
    bundle.provenance = [
      {
        linkId: 'prov:1',
        relation: 'based_on',
        claimTripleId: 'triple:1',
        sourceAtomId: 'atom:token:TestCoin',
        predicateAtomId: 'atom:predicate:has_name',
      },
    ]

    await resolveExistence(bundle, publicClient())

    expect(mockBatchPreviewTripleCreates).toHaveBeenCalledTimes(1)
    // 1 claim triple + 1 provenance triple = 2
    const previewCall = mockBatchPreviewTripleCreates.mock.calls[0]
    expect(previewCall[1]).toHaveLength(2)
  })

  it('computes correct batch info', async () => {
    const plan = await resolveExistence(makeBundle(), publicClient())

    expect(plan.batchInfo.atomChunkSize).toBe(25)
    expect(plan.batchInfo.tripleChunkSize).toBe(50)
    expect(plan.batchInfo.provenanceChunkSize).toBe(50)
    expect(plan.batchInfo.atomChunks).toBe(1) // ceil(3/25)
    expect(plan.batchInfo.tripleChunks).toBe(1) // ceil(1/50)
    expect(plan.batchInfo.provenanceChunks).toBe(0) // 0 provenance
    expect(plan.batchInfo.estimatedWalletSignatures).toBe(2) // 1 atom + 1 triple
  })

  it('handles provenance with includes_claim relation', async () => {
    const bundle = makeBundle()
    bundle.provenance = [
      {
        linkId: 'prov:1',
        relation: 'includes_claim',
        claimTripleId: 'triple:1',
        sourceAtomId: 'atom:token:TestCoin',
        predicateAtomId: 'atom:predicate:has_name',
      },
    ]

    const plan = await resolveExistence(bundle, publicClient())

    expect(plan.provenance.toCreate).toHaveLength(1)
    expect(plan.summary.provenanceToCreate).toBe(1)
  })

  it('marks triples with missing atoms as non-existing', async () => {
    const bundle = makeBundle()
    // Add a triple that references a non-existent atom
    bundle.triples.push({
      tripleId: 'triple:2',
      claimGroup: null,
      originRowId: null,
      subjectAtomId: 'atom:nonexistent',
      predicateAtomId: 'atom:predicate:has_name',
      objectAtomId: 'atom:literal:TestCoin',
    })

    const plan = await resolveExistence(bundle, publicClient())

    // triple:2 should have exists=false and zero termIds
    const brokenTriple = plan.triples.toCreate.find((t) => t.tripleId === 'triple:2')
    expect(brokenTriple).toBeDefined()
    expect(brokenTriple!.exists).toBe(false)
    expect(brokenTriple!.computedTripleTermId).toBe('0x0')
  })
})
