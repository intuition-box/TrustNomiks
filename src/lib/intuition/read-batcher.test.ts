import { describe, expect, it, vi } from 'vitest'
import type { Hex } from 'viem'
import {
  batchIsTermCreated,
  batchPreviewAtomCreates,
  batchPreviewTripleCreates,
  readPublishConfig,
  type MulticallCapableClient,
} from './read-batcher'

const TERM_A = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex
const TERM_B = '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex

function successResult<T>(value: T) {
  return { status: 'success' as const, result: value, error: undefined }
}

function failureResult() {
  return { status: 'failure' as const, result: undefined, error: new Error('revert') }
}

function mockMulticallClient(
  results: Array<{ status: 'success' | 'failure'; result: unknown; error: unknown }>,
): MulticallCapableClient {
  return {
    multicall: vi.fn().mockResolvedValue(results),
    readContract: vi.fn(),
  } as unknown as MulticallCapableClient
}

// ── batchIsTermCreated ───────────────────────────────────────────────────────

describe('batchIsTermCreated', () => {
  it('returns an empty map for empty input', async () => {
    const client = mockMulticallClient([])
    const result = await batchIsTermCreated(client, [])
    expect(result.size).toBe(0)
    expect(client.multicall).not.toHaveBeenCalled()
  })

  it('deduplicates term IDs before the RPC call', async () => {
    const client = mockMulticallClient([successResult(true)])
    const result = await batchIsTermCreated(client, [TERM_A, TERM_A, TERM_A])
    expect(result.size).toBe(1)
    expect(result.get(TERM_A.toLowerCase() as Hex)).toBe(true)
    // Only one contract call, not three
    const multicallArgs = (client.multicall as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(multicallArgs.contracts).toHaveLength(1)
  })

  it('maps true results correctly', async () => {
    const client = mockMulticallClient([successResult(true), successResult(true)])
    const result = await batchIsTermCreated(client, [TERM_A, TERM_B])
    expect(result.get(TERM_A.toLowerCase() as Hex)).toBe(true)
    expect(result.get(TERM_B.toLowerCase() as Hex)).toBe(true)
  })

  it('maps false results correctly', async () => {
    const client = mockMulticallClient([successResult(false), successResult(false)])
    const result = await batchIsTermCreated(client, [TERM_A, TERM_B])
    expect(result.get(TERM_A.toLowerCase() as Hex)).toBe(false)
    expect(result.get(TERM_B.toLowerCase() as Hex)).toBe(false)
  })

  it('chunks large lists automatically', async () => {
    // 250 term IDs with chunkSize 100 → 3 multicalls
    const ids = Array.from({ length: 250 }, (_, i) =>
      `0x${String(i).padStart(64, '0')}` as Hex,
    )
    const results = Array.from({ length: 100 }, () => successResult(false))
    const client = mockMulticallClient(results)

    await batchIsTermCreated(client, ids, { chunkSize: 100 })
    expect(client.multicall).toHaveBeenCalledTimes(3)
  })

  it('failureMode throw throws on failed call', async () => {
    const client = mockMulticallClient([failureResult()])
    await expect(
      batchIsTermCreated(client, [TERM_A], { failureMode: 'throw' }),
    ).rejects.toThrow('isTermCreated multicall failed')
  })

  it('failureMode assumeExists returns true on failed call', async () => {
    const client = mockMulticallClient([failureResult()])
    const result = await batchIsTermCreated(client, [TERM_A], { failureMode: 'assumeExists' })
    expect(result.get(TERM_A.toLowerCase() as Hex)).toBe(true)
  })

  it('failureMode assumeMissing returns false on failed call', async () => {
    const client = mockMulticallClient([failureResult()])
    const result = await batchIsTermCreated(client, [TERM_A], { failureMode: 'assumeMissing' })
    expect(result.get(TERM_A.toLowerCase() as Hex)).toBe(false)
  })

  it('default failureMode is throw', async () => {
    const client = mockMulticallClient([failureResult()])
    await expect(batchIsTermCreated(client, [TERM_A])).rejects.toThrow()
  })

  it('preserves case-insensitive dedup (hex addresses)', async () => {
    const lower = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1' as Hex
    const upper = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1' as Hex
    const client = mockMulticallClient([successResult(true)])

    const result = await batchIsTermCreated(client, [lower, upper])
    expect(result.size).toBe(1)
    const multicallArgs = (client.multicall as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(multicallArgs.contracts).toHaveLength(1)
  })

  // ── Complete multicall rejection ────────────────────────────────────────────

  it('assumeExists on complete multicall rejection', async () => {
    const client = {
      multicall: vi.fn().mockRejectedValue(new Error('rpc down')),
      readContract: vi.fn(),
    } as unknown as MulticallCapableClient

    const result = await batchIsTermCreated(client, [TERM_A, TERM_B], {
      failureMode: 'assumeExists',
    })

    expect(result.get(TERM_A.toLowerCase() as Hex)).toBe(true)
    expect(result.get(TERM_B.toLowerCase() as Hex)).toBe(true)
  })

  it('assumeMissing on complete multicall rejection', async () => {
    const client = {
      multicall: vi.fn().mockRejectedValue(new Error('rpc down')),
      readContract: vi.fn(),
    } as unknown as MulticallCapableClient

    const result = await batchIsTermCreated(client, [TERM_A, TERM_B], {
      failureMode: 'assumeMissing',
    })

    expect(result.get(TERM_A.toLowerCase() as Hex)).toBe(false)
    expect(result.get(TERM_B.toLowerCase() as Hex)).toBe(false)
  })

  it('throw on complete multicall rejection', async () => {
    const client = {
      multicall: vi.fn().mockRejectedValue(new Error('rpc down')),
      readContract: vi.fn(),
    } as unknown as MulticallCapableClient

    await expect(
      batchIsTermCreated(client, [TERM_A], { failureMode: 'throw' }),
    ).rejects.toThrow(/isTermCreated multicall failed.*rpc down/)
  })

  it('chunk-level: one chunk fails, next chunk succeeds', async () => {
    const client = {
      multicall: vi
        .fn()
        .mockRejectedValueOnce(new Error('chunk 1 down'))
        .mockResolvedValueOnce([successResult(false)]),
      readContract: vi.fn(),
    } as unknown as MulticallCapableClient

    const result = await batchIsTermCreated(client, [TERM_A, TERM_B], {
      failureMode: 'assumeExists',
      chunkSize: 1,
    })

    // First chunk rejected → fallback assumeExists → true
    expect(result.get(TERM_A.toLowerCase() as Hex)).toBe(true)
    // Second chunk succeeds with false
    expect(result.get(TERM_B.toLowerCase() as Hex)).toBe(false)
  })
})

// ── batchPreviewAtomCreates ──────────────────────────────────────────────────

describe('batchPreviewAtomCreates', () => {
  it('does nothing for empty items', async () => {
    const client = mockMulticallClient([])
    await batchPreviewAtomCreates(client, [])
    expect(client.multicall).not.toHaveBeenCalled()
  })

  it('resolves when all previews return valid shares', async () => {
    // (shares, assetsAfterFixedFees, assetsAfterFees)
    const client = mockMulticallClient([
      successResult([BigInt(100), BigInt(50), BigInt(48)]),
      successResult([BigInt(200), BigInt(100), BigInt(96)]),
    ])
    await expect(
      batchPreviewAtomCreates(client, [
        { id: 'a1', termId: TERM_A, assets: BigInt(1000) },
        { id: 'a2', termId: TERM_B, assets: BigInt(1000) },
      ]),
    ).resolves.toBeUndefined()
  })

  it('throws when a preview call fails', async () => {
    const client = mockMulticallClient([failureResult()])
    await expect(
      batchPreviewAtomCreates(client, [
        { id: 'a1', termId: TERM_A, assets: BigInt(1000) },
      ]),
    ).rejects.toThrow('Atom creation preview failed')
  })

  it('throws when non-zero deposit mints zero shares', async () => {
    // assetsAfterFixedFees > 0 but shares === 0
    const client = mockMulticallClient([
      successResult([BigInt(0), BigInt(50), BigInt(48)]),
    ])
    await expect(
      batchPreviewAtomCreates(client, [
        { id: 'a1', termId: TERM_A, assets: BigInt(1000) },
      ]),
    ).rejects.toThrow('mints zero shares from non-zero deposit')
  })

  it('does not throw when both assets and shares are zero', async () => {
    // assetsAfterFixedFees === 0, shares === 0 — fine
    const client = mockMulticallClient([
      successResult([BigInt(0), BigInt(0), BigInt(0)]),
    ])
    await expect(
      batchPreviewAtomCreates(client, [
        { id: 'a1', termId: TERM_A, assets: BigInt(0) },
      ]),
    ).resolves.toBeUndefined()
  })

  it('chunks large preview lists', async () => {
    const items = Array.from({ length: 150 }, (_, i) => ({
      id: `a${i}`,
      termId: TERM_A,
      assets: BigInt(1000),
    }))
    const results = Array.from({ length: 100 }, () =>
      successResult([BigInt(100), BigInt(50), BigInt(48)]),
    )
    const client = mockMulticallClient(results)

    await batchPreviewAtomCreates(client, items, { chunkSize: 100 })
    expect(client.multicall).toHaveBeenCalledTimes(2)
  })
})

// ── batchPreviewTripleCreates ────────────────────────────────────────────────

describe('batchPreviewTripleCreates', () => {
  it('does nothing for empty items', async () => {
    const client = mockMulticallClient([])
    await batchPreviewTripleCreates(client, [])
    expect(client.multicall).not.toHaveBeenCalled()
  })

  it('resolves when all previews return valid shares', async () => {
    const client = mockMulticallClient([
      successResult([BigInt(100), BigInt(50), BigInt(48)]),
    ])
    await expect(
      batchPreviewTripleCreates(client, [
        { id: 't1', termId: TERM_A, assets: BigInt(1000) },
      ]),
    ).resolves.toBeUndefined()
  })

  it('throws when a preview call fails', async () => {
    const client = mockMulticallClient([failureResult()])
    await expect(
      batchPreviewTripleCreates(client, [
        { id: 't1', termId: TERM_A, assets: BigInt(1000) },
      ]),
    ).rejects.toThrow('Triple creation preview failed')
  })

  it('throws when non-zero deposit mints zero shares', async () => {
    const client = mockMulticallClient([
      successResult([BigInt(0), BigInt(50), BigInt(48)]),
    ])
    await expect(
      batchPreviewTripleCreates(client, [
        { id: 't1', termId: TERM_A, assets: BigInt(1000) },
      ]),
    ).rejects.toThrow('mints zero shares from non-zero deposit')
  })
})

// ── readPublishConfig ────────────────────────────────────────────────────────

describe('readPublishConfig', () => {
  const FALLBACK_ATOM = BigInt('400000000000000')
  const FALLBACK_TRIPLE = BigInt('400000000000000')
  const FALLBACK_DEPOSIT = BigInt(0)

  it('returns all three config values on full success', async () => {
    const client = mockMulticallClient([
      successResult(BigInt('500000000000000')), // getAtomCost
      successResult(BigInt('600000000000000')), // getTripleCost
      successResult({ minDeposit: BigInt('100000000000000') }), // getGeneralConfig
    ])

    const result = await readPublishConfig(client)
    expect(result.atomCost).toBe(BigInt('500000000000000'))
    expect(result.tripleCost).toBe(BigInt('600000000000000'))
    expect(result.extraDepositPerUnit).toBe(BigInt('100000000000000'))
    expect(client.multicall).toHaveBeenCalledTimes(1)
  })

  it('falls back if any single config read fails', async () => {
    const client = mockMulticallClient([
      successResult(BigInt('500000000000000')),
      failureResult(), // getTripleCost fails
      successResult({ minDeposit: BigInt('100000000000000') }),
    ])

    const result = await readPublishConfig(client)
    expect(result.atomCost).toBe(FALLBACK_ATOM)
    expect(result.tripleCost).toBe(FALLBACK_TRIPLE)
    expect(result.extraDepositPerUnit).toBe(FALLBACK_DEPOSIT)
  })

  it('falls back if the entire multicall throws', async () => {
    const client = {
      multicall: vi.fn().mockRejectedValue(new Error('network error')),
      readContract: vi.fn(),
    } as unknown as MulticallCapableClient

    const result = await readPublishConfig(client)
    expect(result.atomCost).toBe(FALLBACK_ATOM)
    expect(result.tripleCost).toBe(FALLBACK_TRIPLE)
    expect(result.extraDepositPerUnit).toBe(FALLBACK_DEPOSIT)
  })
})
