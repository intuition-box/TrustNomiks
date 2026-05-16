import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IntuitionGraphQLError,
  fetchAccountActivity,
  fetchExportRunsByWallet,
  fetchTrustNomiksStakeByWallet,
  isWalletAddress,
  parsePositiveIntParam,
  postIntuitionGraphQL,
} from './graphql-client'
import { createSignedExportRunManifest, type TrustNomiksExportRunSignedPayload } from './attestation'
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex, PublicClient } from 'viem'

const WALLET = '0x6AdBC0c9A30923d4E2377171d278E139dFb3D02B'
const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945387dc9e86dae876e0603f7b3d44fbc2f96f' as Hex
const ATTESTER = privateKeyToAccount(PRIVATE_KEY).address

describe('intuition graphql-client', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-15T08:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('validates EVM wallet addresses', () => {
    expect(isWalletAddress(WALLET)).toBe(true)
    expect(isWalletAddress(WALLET.toLowerCase())).toBe(true)
    expect(isWalletAddress('0x123')).toBe(false)
    expect(isWalletAddress(null)).toBe(false)
    expect(isWalletAddress('not-an-address')).toBe(false)
  })

  it('parses bounded positive integer query params', () => {
    expect(parsePositiveIntParam('25', 10, 100)).toBe(25)
    expect(parsePositiveIntParam('500', 10, 100)).toBe(100)
    expect(parsePositiveIntParam('0', 10, 100)).toBe(10)
    expect(parsePositiveIntParam('-5', 10, 100)).toBe(10)
    expect(parsePositiveIntParam('bad', 10, 100)).toBe(10)
    expect(parsePositiveIntParam(null, 10, 100)).toBe(10)
  })

  it('maps account activity into the UI response shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          positions: [
            {
              id: 'position-1',
              account_id: WALLET,
              shares: '2000000000000000000',
              term_id: '0xterm',
              curve_id: '1',
              created_at: '2026-05-01T00:00:00+00:00',
              updated_at: '2026-05-02T00:00:00+00:00',
              transaction_hash: '0xtx',
              vault: {
                term_id: '0xterm',
                curve_id: '1',
                total_shares: '3000000000000000000',
                total_assets: '3000000000000000000',
                current_share_price: '1000000000000000000',
                position_count: 2,
                market_cap: '3',
                term: {
                  atom: {
                    term_id: '0xterm',
                    label: 'Test Atom',
                    image: null,
                    type: 'Thing',
                    data: 'ipfs://test',
                    created_at: '2026-05-01T00:00:00+00:00',
                    transaction_hash: '0xtx',
                    creator: { id: WALLET, label: 'you', image: null },
                  },
                  triple: null,
                },
              },
            },
          ],
          positions_aggregate: {
            aggregate: { count: 1, sum: { shares: '2000000000000000000' } },
          },
          atoms: [
            {
              term_id: '0xatom',
              label: 'Created Atom',
              image: null,
              type: 'Thing',
              data: 'ipfs://created',
              created_at: '2026-05-03T00:00:00+00:00',
              transaction_hash: '0xatomtx',
              creator: { id: WALLET, label: 'you', image: null },
              term: { vaults: [] },
            },
          ],
          atoms_aggregate: { aggregate: { count: 4 } },
          triples: [
            {
              term_id: '0xtriple',
              counter_term_id: '0xcounter',
              created_at: '2026-05-04T00:00:00+00:00',
              transaction_hash: '0xtripletx',
              creator: { id: WALLET, label: 'you', image: null },
              subject: { term_id: '0xs', label: 'S', image: null, type: 'Thing', data: null },
              predicate: { term_id: '0xp', label: 'P', image: null, type: 'Thing', data: null },
              object: { term_id: '0xo', label: 'O', image: null, type: 'Thing', data: null },
              term: { vaults: [] },
              counter_term: { vaults: [] },
            },
          ],
          triples_aggregate: { aggregate: { count: 5 } },
        },
      })),
    )
    vi.stubGlobal('fetch', fetchMock)

    const activity = await fetchAccountActivity(WALLET, {
      positionLimit: 2,
      createdLimit: 3,
    })

    expect(activity).toMatchObject({
      walletAddress: WALLET,
      chainId: 13579,
      fetchedAt: '2026-05-15T08:00:00.000Z',
      aggregates: {
        activePositions: 1,
        activePositionShares: '2000000000000000000',
        atomsCreated: 4,
        triplesCreated: 5,
      },
    })
    expect(activity.positions[0]).toMatchObject({
      id: 'position-1',
      accountId: WALLET,
      atom: { label: 'Test Atom' },
      triple: null,
    })
    expect(activity.createdAtoms[0]).toMatchObject({ label: 'Created Atom' })
    expect(activity.createdTriples[0]).toMatchObject({
      subject: { label: 'S' },
      predicate: { label: 'P' },
      object: { label: 'O' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('handles missing aggregates and nullable nested records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: {
          positions: [
            {
              id: 'position-1',
              account_id: WALLET,
              shares: '1',
              term_id: '0xterm',
              curve_id: 1,
              created_at: '2026-05-01T00:00:00+00:00',
              updated_at: '2026-05-02T00:00:00+00:00',
              transaction_hash: '0xtx',
              vault: null,
            },
          ],
          positions_aggregate: { aggregate: null },
          atoms: [],
          atoms_aggregate: { aggregate: null },
          triples: [],
          triples_aggregate: { aggregate: null },
        },
      })),
    ))

    const activity = await fetchAccountActivity(WALLET, {
      positionLimit: 1,
      createdLimit: 1,
    })

    expect(activity.aggregates).toEqual({
      activePositions: 0,
      activePositionShares: null,
      atomsCreated: 0,
      triplesCreated: 0,
    })
    expect(activity.positions[0]).toMatchObject({
      curveId: '1',
      vault: null,
      atom: null,
      triple: null,
    })
  })

  it('throws structured errors for GraphQL errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'bad query' }] })),
    ))

    await expect(postIntuitionGraphQL('query Bad { bad }', {})).rejects.toThrow(
      'Intuition GraphQL errors: bad query',
    )
  })

  it('converts abort failures to IntuitionGraphQLError', async () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort))

    await expect(postIntuitionGraphQL('query Slow { positions { id } }', {}))
      .rejects.toBeInstanceOf(IntuitionGraphQLError)
  })

  it('filters My Exports to signed runs with required TrustNomiks links', async () => {
    vi.stubEnv('TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY', PRIVATE_KEY)
    vi.stubEnv('TRUSTNOMIKS_ATTESTER_ADDRESS', ATTESTER)

    const runTermId = term('9')
    const manifest = await createSignedExportRunManifest(exportPayload())
    const spoofManifest = {
      ...manifest,
      attestation: { ...manifest.attestation, signature: term('8') },
    }

    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query: string }
      if (body.query.includes('query ExportRuns')) {
        return new Response(JSON.stringify({
          data: {
            atoms: [
              exportRunAtom(runTermId, JSON.stringify(manifest)),
              exportRunAtom(term('7'), JSON.stringify(spoofManifest)),
            ],
            atoms_aggregate: { aggregate: { count: 2 } },
          },
        }))
      }
      if (body.query.includes('query ExportRunLinks')) {
        return new Response(JSON.stringify({
          data: { triples: verificationLinks(runTermId, manifest) },
        }))
      }
      throw new Error('unexpected query')
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchExportRunsByWallet(WALLET, { page: 1, pageSize: 20 })

    expect(result.runs).toHaveLength(1)
    expect(result.runs[0]).toMatchObject({
      runId: runTermId,
      tokenName: 'TestCoin',
      triplesCreated: 1,
    })
    expect(result.total).toBe(1)
  })

  it('computes TrustNomiks stake only from verified export memberships and on-chain vault reads', async () => {
    vi.stubEnv('TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY', PRIVATE_KEY)
    vi.stubEnv('TRUSTNOMIKS_ATTESTER_ADDRESS', ATTESTER)

    const runTermId = term('9')
    const manifest = await createSignedExportRunManifest(exportPayload())
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { query: string }
      if (body.query.includes('query TrustNomiksStakeExportRuns')) {
        return new Response(JSON.stringify({
          data: { atoms: [exportRunAtom(runTermId, JSON.stringify(manifest))] },
        }))
      }
      if (body.query.includes('query ExportRunLinks')) {
        return new Response(JSON.stringify({
          data: { triples: verificationLinks(runTermId, manifest) },
        }))
      }
      if (body.query.includes('query TrustNomiksStakePositions')) {
        return new Response(JSON.stringify({
          data: {
            positions: [
              {
                id: 'position-1',
                shares: '999',
                term_id: manifest.claimTermIds[0],
                vault: { total_shares: '1', total_assets: '1' },
              },
            ],
          },
        }))
      }
      throw new Error('unexpected query')
    })
    vi.stubGlobal('fetch', fetchMock)

    const publicClient = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        if (functionName === 'getBondingCurveConfig') return { defaultCurveId: BigInt(1) }
        if (functionName === 'getShares') return BigInt(2)
        if (functionName === 'convertToAssets') return BigInt(5)
        throw new Error(`unexpected read ${functionName}`)
      }),
    }

    const result = await fetchTrustNomiksStakeByWallet(WALLET, {
      publicClient: publicClient as unknown as Pick<PublicClient, 'readContract'>,
    })

    expect(result).toMatchObject({
      walletAddress: WALLET,
      claimCount: 1,
      positionCount: 1,
      stakedTrustWei: '5',
    })
    expect(publicClient.readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'convertToAssets',
    }))
  })
})

function term(byte: string): Hex {
  return `0x${byte.repeat(64)}` as Hex
}

function exportPayload(): TrustNomiksExportRunSignedPayload {
  return {
    type: 'TrustNomiksExportRun',
    schemaVersion: 2,
    app: 'TrustNomiks',
    exportRunId: 'export-run-1',
    tokenId: 'token-1',
    tokenName: 'TestCoin',
    tokenTicker: 'TEST',
    walletAddress: WALLET,
    chainId: 13579,
    createdAt: '2026-05-15T08:00:00.000Z',
    appAtom: { atomId: 'atom:trustnomiks:app', uri: 'ipfs://app', termId: term('a') },
    submitterAtom: { atomId: 'atom:wallet:submitter', uri: `caip10:eip155:13579:${WALLET}`, termId: term('b') },
    attesterAtom: { atomId: 'atom:wallet:attester', uri: `caip10:eip155:13579:${ATTESTER}`, termId: term('c') },
    predicates: {
      publishedBy: { atomId: 'atom:predicate:published_by', label: 'published by', uri: 'ipfs://published-by', termId: term('d') },
      submittedBy: { atomId: 'atom:predicate:submitted_by', label: 'submitted by', uri: 'ipfs://submitted-by', termId: term('e') },
      attestedBy: { atomId: 'atom:predicate:attested_by', label: 'attested by', uri: 'ipfs://attested-by', termId: term('f') },
      includesClaim: { atomId: 'atom:predicate:includes_claim', label: 'includes claim', uri: 'ipfs://includes-claim', termId: term('1') },
    },
    claimTermIds: [term('2')],
  }
}

function exportRunAtom(termId: Hex, description: string) {
  return {
    term_id: termId,
    label: 'TrustNomiks Export: TestCoin (TEST)',
    type: 'Thing',
    data: 'ipfs://export',
    created_at: '2026-05-15T08:00:00+00:00',
    transaction_hash: '0xtx',
    creator: { id: WALLET.toLowerCase(), label: 'you', image: null },
    value: { thing: { name: 'TrustNomiks Export: TestCoin (TEST)', description, url: '' } },
  }
}

function verificationLinks(runTermId: Hex, manifest: Awaited<ReturnType<typeof createSignedExportRunManifest>>) {
  return [
    {
      term_id: term('3'),
      subject_id: runTermId,
      predicate_id: manifest.predicates.publishedBy.termId,
      object_id: manifest.appAtom.termId,
    },
    {
      term_id: term('4'),
      subject_id: runTermId,
      predicate_id: manifest.predicates.submittedBy.termId,
      object_id: manifest.submitterAtom.termId,
    },
    {
      term_id: term('5'),
      subject_id: runTermId,
      predicate_id: manifest.predicates.attestedBy.termId,
      object_id: manifest.attesterAtom.termId,
    },
    {
      term_id: term('6'),
      subject_id: runTermId,
      predicate_id: manifest.predicates.includesClaim.termId,
      object_id: manifest.claimTermIds[0],
    },
  ]
}
