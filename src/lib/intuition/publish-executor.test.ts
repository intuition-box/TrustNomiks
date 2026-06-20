import { describe, expect, it, vi, beforeEach } from 'vitest'
import { toHex } from 'viem'
import type { Hex, PublicClient, WalletClient } from 'viem'
import type {
  PublishPlan,
  PublishEvent,
  AtomPlanItem,
  TriplePlanItem,
} from './types'

// ── Mock @0xintuition/sdk (term-id math) ─────────────────────────────────────
// calculateAtomId passes the hex data straight through, so an atom's on-chain
// term id == toHex(encode(normalizedData)). We mirror that in atom fixtures via
// computedTermId so the initial recheck and the per-chunk recheck agree.
vi.mock('@0xintuition/sdk', () => ({
  calculateAtomId: vi.fn((data: Hex) => data),
  calculateTripleId: vi.fn(
    (s: Hex, p: Hex, o: Hex) => `${s}${p}${o}`.slice(0, 66) as Hex,
  ),
}))

// ── Mock @0xintuition/protocol (write calls + event parsers) ─────────────────
// Keep the real address helpers so ./config still resolves a valid MultiVault
// address; stub only the on-chain write/parse functions.
const mockMultiVaultCreateAtoms = vi.fn()
const mockMultiVaultCreateTriples = vi.fn()
const mockEventParseAtomCreated = vi.fn()
const mockEventParseTripleCreated = vi.fn()

vi.mock('@0xintuition/protocol', async () => {
  const actual = await vi.importActual<typeof import('@0xintuition/protocol')>(
    '@0xintuition/protocol',
  )
  return {
    ...actual,
    multiVaultCreateAtoms: (...args: unknown[]) => mockMultiVaultCreateAtoms(...args),
    multiVaultCreateTriples: (...args: unknown[]) => mockMultiVaultCreateTriples(...args),
    eventParseAtomCreated: (...args: unknown[]) => mockEventParseAtomCreated(...args),
    eventParseTripleCreated: (...args: unknown[]) => mockEventParseTripleCreated(...args),
  }
})

// ── Mock ./read-batcher (same pattern as existence-resolver.test.ts) ─────────
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

import { executePublishPlan } from './publish-executor'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Term id an atom resolves to on-chain given the mock SDK (toHex(encode(data))). */
function atomTermId(normalizedData: string): Hex {
  return toHex(new TextEncoder().encode(normalizedData))
}

function makeAtom(
  atomId: string,
  normalizedData: string,
  atomType = 'token',
): AtomPlanItem {
  return {
    atomId,
    atomType,
    normalizedData,
    computedTermId: atomTermId(normalizedData),
    exists: false,
  }
}

const SUB = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex
const PRED = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex
const OBJ = '0x3333333333333333333333333333333333333333333333333333333333333333' as Hex
const TRIPLE_TERM = '0x4444444444444444444444444444444444444444444444444444444444444444' as Hex

/** A triple whose three atom term ids come from the atoms created in the plan. */
function makeTriple(
  tripleId: string,
  subjectAtomId: string,
  predicateAtomId: string,
  objectAtomId: string,
): TriplePlanItem {
  return {
    tripleId,
    claimGroup: null,
    originRowId: null,
    subjectAtomId,
    predicateAtomId,
    objectAtomId,
    subjectTermId: SUB,
    predicateTermId: PRED,
    objectTermId: OBJ,
    computedTripleTermId: TRIPLE_TERM,
    exists: false,
  }
}

function makePlan(overrides: Partial<PublishPlan> = {}): PublishPlan {
  return {
    tokenId: 'token-1',
    tokenName: 'TestCoin',
    tokenTicker: 'TEST',
    exportRun: {
      exportRunId: 'run-1',
      atomId: 'atom:export-run:run-1',
      normalizedData: 'export:run-1',
      computedTermId: atomTermId('export:run-1'),
    },
    atoms: { toCreate: [], existing: [] },
    triples: { toCreate: [], existing: [] },
    provenance: { toCreate: [], existing: [] },
    estimatedCost: {
      atomCostPerUnit: BigInt(100),
      tripleCostPerUnit: BigInt(200),
      extraDepositPerUnit: BigInt(10),
      totalAtomsCost: BigInt(0),
      totalTriplesCost: BigInt(0),
      totalProvenanceCost: BigInt(0),
      totalCost: BigInt(0),
    },
    summary: {
      atomsToCreate: 0,
      atomsExisting: 0,
      triplesToCreate: 0,
      triplesExisting: 0,
      provenanceToCreate: 0,
      provenanceExisting: 0,
    },
    batchInfo: {
      atomChunkSize: 25,
      tripleChunkSize: 50,
      provenanceChunkSize: 50,
      atomChunks: 0,
      tripleChunks: 0,
      provenanceChunks: 0,
      estimatedWalletSignatures: 0,
    },
    ...overrides,
  }
}

function walletClient() {
  return {
    account: { address: '0xWallet' },
    chain: { id: 13579 },
  } as unknown as WalletClient
}

function publicClient() {
  return {} as unknown as PublicClient
}

/** Build a batchIsTermCreated result map; everything not listed defaults to `dflt`. */
function existsMap(
  termIds: Hex[],
  present: Hex[],
  dflt = false,
): Map<Hex, boolean> {
  const presentLower = new Set(present.map((t) => (t as string).toLowerCase()))
  const map = new Map<Hex, boolean>()
  for (const id of termIds) {
    const key = (id as string).toLowerCase() as Hex
    map.set(key, presentLower.has(key) ? true : dflt)
  }
  return map
}

/** Drain the generator into a list of events. */
async function collect(gen: AsyncGenerator<PublishEvent>): Promise<PublishEvent[]> {
  const events: PublishEvent[] = []
  for await (const ev of gen) {
    events.push(ev)
  }
  return events
}

const atomEvent = (termId: Hex) => ({ args: { termId } })

// ── Tests ────────────────────────────────────────────────────────────────────

describe('executePublishPlan — atom phase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEventParseAtomCreated.mockResolvedValue([])
    mockEventParseTripleCreated.mockResolvedValue([])
  })

  // ── Criterion 1: Per-chunk recheck ─────────────────────────────────────────

  describe('per-chunk recheck (recheck→write race)', () => {
    it('skips an atom that the per-chunk recheck now reports as existing (no write for it) and records it confirmed', async () => {
      const atomA = makeAtom('atom:A', 'atom-A')
      const atomB = makeAtom('atom:B', 'atom-B')
      const plan = makePlan({ atoms: { toCreate: [atomA, atomB], existing: [] } })

      // Deterministic by call order:
      //   call 0 = initial recheck (assumeMissing) → neither exists → both need creation
      //   call 1 = per-chunk recheck (assumeMissing) → A now exists, B still missing
      mockBatchIsTermCreated
        .mockResolvedValueOnce(existsMap([atomA.computedTermId, atomB.computedTermId], [])) // initial
        .mockResolvedValueOnce(existsMap([atomA.computedTermId, atomB.computedTermId], [atomA.computedTermId])) // per-chunk: A exists

      // Only atomB is submitted → one created event for B's term id.
      mockMultiVaultCreateAtoms.mockResolvedValue('0xtxB')
      mockEventParseAtomCreated.mockResolvedValue([atomEvent(atomB.computedTermId)])

      const events = await collect(
        executePublishPlan(plan, walletClient(), publicClient()),
      )

      // Write happened, but only for the still-missing atom B.
      expect(mockMultiVaultCreateAtoms).toHaveBeenCalledTimes(1)
      const [, callArgs] = mockMultiVaultCreateAtoms.mock.calls[0] as [
        unknown,
        { args: [Hex[], bigint[]] },
      ]
      const submittedData = callArgs.args[0]
      expect(submittedData).toHaveLength(1)
      expect(submittedData[0]).toBe(toHex(new TextEncoder().encode('atom-B')))

      // The skipped atom A is recorded as confirmed in the chunk_success mappings.
      const success = events.find(
        (e) => e.type === 'chunk_success' && e.phase === 'atoms',
      )!
      const mappings = success.chunkMappings!.atomMappings!
      const aMapping = mappings.find((m) => m.atomId === 'atom:A')!
      expect(aMapping.status).toBe('confirmed')
      expect(aMapping.txHash).toBe('') // skipped before write
      const bMapping = mappings.find((m) => m.atomId === 'atom:B')!
      expect(bMapping.status).toBe('confirmed')
      expect(bMapping.txHash).toBe('0xtxB')
    })

    it('does NOT call multiVaultCreateAtoms when the whole chunk already exists on the per-chunk recheck', async () => {
      const atomA = makeAtom('atom:A', 'atom-A')
      const atomB = makeAtom('atom:B', 'atom-B')
      const plan = makePlan({ atoms: { toCreate: [atomA, atomB], existing: [] } })

      mockBatchIsTermCreated
        .mockResolvedValueOnce(existsMap([atomA.computedTermId, atomB.computedTermId], [])) // initial: none exist → both need creation
        .mockResolvedValueOnce(
          existsMap(
            [atomA.computedTermId, atomB.computedTermId],
            [atomA.computedTermId, atomB.computedTermId],
          ),
        ) // per-chunk: both now exist

      const events = await collect(
        executePublishPlan(plan, walletClient(), publicClient()),
      )

      expect(mockMultiVaultCreateAtoms).not.toHaveBeenCalled()

      const success = events.find(
        (e) => e.type === 'chunk_success' && e.phase === 'atoms',
      )!
      expect(success.txHash).toBe('')
      const mappings = success.chunkMappings!.atomMappings!
      expect(mappings).toHaveLength(2)
      expect(mappings.every((m) => m.status === 'confirmed')).toBe(true)
      expect(mappings.every((m) => m.txHash === '')).toBe(true)

      // No abort — phase completes cleanly.
      expect(events.some((e) => e.type === 'abort')).toBe(false)
      expect(events.some((e) => e.type === 'complete')).toBe(true)
    })

    it('does NOT call multiVaultCreateAtoms when the initial recheck already finds every atom existing', async () => {
      const atomA = makeAtom('atom:A', 'atom-A')
      const plan = makePlan({ atoms: { toCreate: [atomA], existing: [] } })

      // Initial recheck: atom already exists → it never reaches needToCreate.
      mockBatchIsTermCreated.mockResolvedValue(
        existsMap([atomA.computedTermId], [atomA.computedTermId]),
      )

      const events = await collect(
        executePublishPlan(plan, walletClient(), publicClient()),
      )

      expect(mockMultiVaultCreateAtoms).not.toHaveBeenCalled()
      // No atoms in finalAtomsToCreate → zero atom chunks → no chunk events,
      // but the run still completes.
      expect(events.some((e) => e.type === 'abort')).toBe(false)
      expect(events.some((e) => e.type === 'complete')).toBe(true)
    })
  })

  // ── Criterion 2: MultiVault_AtomExists partial handling ─────────────────────

  describe('MultiVault_AtomExists partial handling', () => {
    it('confirms atoms now-existing and FAILS+ABORTS for atoms still missing (triples phase does not run)', async () => {
      const atomA = makeAtom('atom:A', 'atom-A')
      const atomB = makeAtom('atom:B', 'atom-B')
      const plan = makePlan({
        atoms: { toCreate: [atomA, atomB], existing: [] },
        triples: {
          toCreate: [makeTriple('triple:1', 'atom:A', 'atom:B', 'atom:A')],
          existing: [],
        },
      })

      mockBatchIsTermCreated
        // initial recheck: neither exists → both need creation
        .mockResolvedValueOnce(existsMap([atomA.computedTermId, atomB.computedTermId], []))
        // per-chunk recheck: neither exists → both submitted
        .mockResolvedValueOnce(existsMap([atomA.computedTermId, atomB.computedTermId], []))
        // post-revert recheck: A exists, B still missing
        .mockResolvedValueOnce(existsMap([atomA.computedTermId, atomB.computedTermId], [atomA.computedTermId]))

      mockMultiVaultCreateAtoms.mockRejectedValue(
        new Error('execution reverted: MultiVault_AtomExists()'),
      )

      const events = await collect(
        executePublishPlan(plan, walletClient(), publicClient()),
      )

      // The chunk failed (some atoms still missing after the atomic revert).
      const failed = events.find(
        (e) => e.type === 'chunk_failed' && e.phase === 'atoms',
      )!
      expect(failed).toBeDefined()
      const mappings = failed.chunkMappings!.atomMappings!
      const aMapping = mappings.find((m) => m.atomId === 'atom:A')!
      const bMapping = mappings.find((m) => m.atomId === 'atom:B')!
      expect(aMapping.status).toBe('confirmed') // now exists
      expect(bMapping.status).toBe('failed') // still missing → real failure

      // Phase aborts before triples.
      const abort = events.find((e) => e.type === 'abort')!
      expect(abort).toBeDefined()
      expect(abort.phase).toBe('atoms')

      // Triples phase must NOT run.
      expect(mockMultiVaultCreateTriples).not.toHaveBeenCalled()
      expect(events.some((e) => e.type === 'phase_start' && e.phase === 'triples')).toBe(false)
      // Run still terminates with a complete event.
      expect(events.some((e) => e.type === 'complete')).toBe(true)
    })

    it('treats the revert as a clean skip (chunk_success, no abort) when every atom turns out to already exist', async () => {
      const atomA = makeAtom('atom:A', 'atom-A')
      const atomB = makeAtom('atom:B', 'atom-B')
      const plan = makePlan({
        atoms: { toCreate: [atomA, atomB], existing: [] },
        triples: {
          toCreate: [makeTriple('triple:1', 'atom:A', 'atom:B', 'atom:A')],
          existing: [],
        },
      })

      mockBatchIsTermCreated
        .mockResolvedValueOnce(existsMap([atomA.computedTermId, atomB.computedTermId], [])) // initial: need both
        .mockResolvedValueOnce(existsMap([atomA.computedTermId, atomB.computedTermId], [])) // per-chunk: submit both
        // post-revert recheck: BOTH now exist → revert was purely already-existing atoms
        .mockResolvedValueOnce(
          existsMap(
            [atomA.computedTermId, atomB.computedTermId],
            [atomA.computedTermId, atomB.computedTermId],
          ),
        )
        // triple-phase recheck (assumeExists): the executor queries the *recomputed*
        // triple term id, so default every queried id to "missing" → submit it.
        .mockImplementationOnce(async (_c: unknown, termIds: Hex[]) =>
          existsMap(termIds, []),
        )

      mockMultiVaultCreateAtoms.mockRejectedValue(
        new Error('execution reverted: MultiVault_AtomExists()'),
      )
      mockMultiVaultCreateTriples.mockResolvedValue('0xtripleTx')
      mockEventParseTripleCreated.mockResolvedValue([atomEvent(TRIPLE_TERM)])

      const events = await collect(
        executePublishPlan(plan, walletClient(), publicClient()),
      )

      // Atom chunk recovered as success, no abort.
      const atomSuccess = events.find(
        (e) => e.type === 'chunk_success' && e.phase === 'atoms',
      )!
      expect(atomSuccess).toBeDefined()
      expect(atomSuccess.chunkMappings!.atomMappings!.every((m) => m.status === 'confirmed')).toBe(true)
      expect(events.some((e) => e.type === 'abort')).toBe(false)

      // Triples phase DOES run since atoms are all accounted for.
      expect(mockMultiVaultCreateTriples).toHaveBeenCalledTimes(1)
      expect(events.some((e) => e.type === 'phase_start' && e.phase === 'triples')).toBe(true)
    })
  })

  // ── Criterion 3: assumeMissing semantics ────────────────────────────────────

  describe('assumeMissing semantics (read failure must not silently skip a needed atom)', () => {
    it('uses failureMode "assumeMissing" on the initial and per-chunk rechecks', async () => {
      const atomA = makeAtom('atom:A', 'atom-A')
      const plan = makePlan({ atoms: { toCreate: [atomA], existing: [] } })

      mockBatchIsTermCreated.mockResolvedValue(existsMap([atomA.computedTermId], []))
      mockMultiVaultCreateAtoms.mockResolvedValue('0xtxA')
      mockEventParseAtomCreated.mockResolvedValue([atomEvent(atomA.computedTermId)])

      await collect(executePublishPlan(plan, walletClient(), publicClient()))

      // Initial recheck (call 0) and per-chunk recheck (call 1) both assumeMissing.
      const initialOpts = mockBatchIsTermCreated.mock.calls[0][2] as { failureMode: string }
      const perChunkOpts = mockBatchIsTermCreated.mock.calls[1][2] as { failureMode: string }
      expect(initialOpts.failureMode).toBe('assumeMissing')
      expect(perChunkOpts.failureMode).toBe('assumeMissing')
    })

    it('a read failure (assumeMissing → false) does NOT skip the atom; it is still submitted for creation', async () => {
      const atomA = makeAtom('atom:A', 'atom-A')
      const plan = makePlan({ atoms: { toCreate: [atomA], existing: [] } })

      // Simulate the read-batcher already having applied assumeMissing: a failed
      // read yields `false` for the atom on both the initial and per-chunk passes.
      // (The map simply has no/false entry → executor reads `?? false`.)
      mockBatchIsTermCreated.mockResolvedValue(new Map<Hex, boolean>())

      mockMultiVaultCreateAtoms.mockResolvedValue('0xtxA')
      mockEventParseAtomCreated.mockResolvedValue([atomEvent(atomA.computedTermId)])

      const events = await collect(
        executePublishPlan(plan, walletClient(), publicClient()),
      )

      // The atom was NOT silently skipped — creation was attempted.
      expect(mockMultiVaultCreateAtoms).toHaveBeenCalledTimes(1)
      const [, callArgs] = mockMultiVaultCreateAtoms.mock.calls[0] as [
        unknown,
        { args: [Hex[], bigint[]] },
      ]
      expect(callArgs.args[0]).toHaveLength(1)

      const success = events.find(
        (e) => e.type === 'chunk_success' && e.phase === 'atoms',
      )!
      const aMapping = success.chunkMappings!.atomMappings!.find((m) => m.atomId === 'atom:A')!
      expect(aMapping.status).toBe('confirmed')
      expect(aMapping.txHash).toBe('0xtxA')
    })
  })
})
