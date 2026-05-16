import { afterEach, describe, expect, it, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import {
  createSignedExportRunManifest,
  stableStringify,
  verifyExportRunManifest,
  type TrustNomiksExportRunSignedPayload,
} from './attestation'

const PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945387dc9e86dae876e0603f7b3d44fbc2f96f' as Hex
const OTHER_PRIVATE_KEY = `0x${'2'.repeat(64)}` as Hex
const ATTESTER = privateKeyToAccount(PRIVATE_KEY).address
const OTHER_ATTESTER = privateKeyToAccount(OTHER_PRIVATE_KEY).address

function term(byte: string): Hex {
  return `0x${byte.repeat(64)}` as Hex
}

function payload(overrides: Partial<TrustNomiksExportRunSignedPayload> = {}): TrustNomiksExportRunSignedPayload {
  return {
    type: 'TrustNomiksExportRun',
    schemaVersion: 2,
    app: 'TrustNomiks',
    exportRunId: 'run-1',
    tokenId: 'token-1',
    tokenName: 'TestCoin',
    tokenTicker: 'TEST',
    walletAddress: '0x6AdBC0c9A30923d4E2377171d278E139dFb3D02B',
    chainId: 13579,
    createdAt: '2026-05-15T08:00:00.000Z',
    appAtom: { atomId: 'atom:trustnomiks:app', uri: 'ipfs://app', termId: term('a') },
    submitterAtom: { atomId: 'atom:wallet:submitter', uri: 'caip10:eip155:13579:0x6AdBC0c9A30923d4E2377171d278E139dFb3D02B', termId: term('b') },
    attesterAtom: { atomId: 'atom:wallet:attester', uri: `caip10:eip155:13579:${ATTESTER}`, termId: term('c') },
    predicates: {
      publishedBy: { atomId: 'atom:predicate:published_by', label: 'published by', uri: 'ipfs://published-by', termId: term('d') },
      submittedBy: { atomId: 'atom:predicate:submitted_by', label: 'submitted by', uri: 'ipfs://submitted-by', termId: term('e') },
      attestedBy: { atomId: 'atom:predicate:attested_by', label: 'attested by', uri: 'ipfs://attested-by', termId: term('f') },
      includesClaim: { atomId: 'atom:predicate:includes_claim', label: 'includes claim', uri: 'ipfs://includes-claim', termId: term('1') },
    },
    claimTermIds: [term('2'), term('3')],
    ...overrides,
  }
}

describe('TrustNomiks export attestation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('stableStringify canonicalizes object key order', () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}')
  })

  it('accepts a manifest signed by the configured TrustNomiks attester', async () => {
    vi.stubEnv('TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY', PRIVATE_KEY)
    vi.stubEnv('TRUSTNOMIKS_ATTESTER_ADDRESS', ATTESTER)

    const manifest = await createSignedExportRunManifest(payload())
    await expect(verifyExportRunManifest(manifest)).resolves.toMatchObject({
      valid: true,
      recoveredAddress: ATTESTER,
    })
  })

  it('rejects a manifest whose signed payload was modified after signing', async () => {
    vi.stubEnv('TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY', PRIVATE_KEY)
    vi.stubEnv('TRUSTNOMIKS_ATTESTER_ADDRESS', ATTESTER)

    const manifest = await createSignedExportRunManifest(payload())
    const tampered = { ...manifest, tokenName: 'TamperedCoin' }

    await expect(verifyExportRunManifest(tampered)).resolves.toMatchObject({
      valid: false,
      reason: 'TrustNomiks attestation payload hash mismatch',
    })
  })

  it('rejects a manifest signed by another address', async () => {
    vi.stubEnv('TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY', OTHER_PRIVATE_KEY)
    vi.stubEnv('TRUSTNOMIKS_ATTESTER_ADDRESS', OTHER_ATTESTER)
    const manifest = await createSignedExportRunManifest(payload({
      attesterAtom: {
        atomId: 'atom:wallet:other-attester',
        uri: `caip10:eip155:13579:${OTHER_ATTESTER}`,
        termId: term('4'),
      },
    }))

    vi.stubEnv('TRUSTNOMIKS_ATTESTER_ADDRESS', ATTESTER)
    await expect(verifyExportRunManifest(manifest)).resolves.toMatchObject({
      valid: false,
    })
  })

  it('refuses to sign when TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY is not configured', async () => {
    vi.stubEnv('TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY', '')
    vi.stubEnv('TRUSTNOMIKS_ATTESTER_ADDRESS', ATTESTER)

    await expect(createSignedExportRunManifest(payload())).rejects.toThrow(
      /TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY is required/,
    )
  })

  it('rejects a manifest whose attestation payloadHash was falsified directly', async () => {
    vi.stubEnv('TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY', PRIVATE_KEY)
    vi.stubEnv('TRUSTNOMIKS_ATTESTER_ADDRESS', ATTESTER)

    const manifest = await createSignedExportRunManifest(payload())
    const forgedHash = `0x${'f'.repeat(64)}` as Hex
    const tampered = {
      ...manifest,
      attestation: { ...manifest.attestation, payloadHash: forgedHash },
    }

    await expect(verifyExportRunManifest(tampered)).resolves.toMatchObject({
      valid: false,
      reason: 'TrustNomiks attestation payload hash mismatch',
    })
  })
})
