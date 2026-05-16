import {
  getAddress,
  isAddress,
  keccak256,
  recoverMessageAddress,
  stringToHex,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { INTUITION_CHAIN_ID } from './config'

export const TRUSTNOMIKS_EXPORT_SCHEMA_VERSION = 2
export const TRUSTNOMIKS_EXPORT_TYPE = 'TrustNomiksExportRun'
export const TRUSTNOMIKS_APP_NAME = 'TrustNomiks'

export type TrustNomiksAttestationPredicateKey =
  | 'publishedBy'
  | 'submittedBy'
  | 'attestedBy'
  | 'includesClaim'

export interface TrustNomiksTermRef {
  atomId: string
  uri: string
  termId: Hex
}

export interface TrustNomiksPredicateRef extends TrustNomiksTermRef {
  label: string
}

export interface TrustNomiksExportRunSignedPayload {
  type: typeof TRUSTNOMIKS_EXPORT_TYPE
  schemaVersion: typeof TRUSTNOMIKS_EXPORT_SCHEMA_VERSION
  app: typeof TRUSTNOMIKS_APP_NAME
  exportRunId: string
  tokenId: string
  tokenName: string
  tokenTicker: string
  walletAddress: Address
  chainId: number
  createdAt: string
  appAtom: TrustNomiksTermRef
  submitterAtom: TrustNomiksTermRef
  attesterAtom: TrustNomiksTermRef
  predicates: Record<TrustNomiksAttestationPredicateKey, TrustNomiksPredicateRef>
  claimTermIds: Hex[]
}

export interface TrustNomiksExportRunAttestation {
  signatureKind: 'eip191'
  signerAddress: Address
  payloadHash: Hex
  signature: Hex
}

export interface TrustNomiksExportRunManifest extends TrustNomiksExportRunSignedPayload {
  attestation: TrustNomiksExportRunAttestation
}

export interface ManifestVerificationResult {
  valid: boolean
  reason?: string
  recoveredAddress?: Address
  payload?: TrustNomiksExportRunSignedPayload
}

export function normalizeWalletAddress(address: string): Address {
  if (!isAddress(address)) {
    throw new Error(`Invalid EVM address: ${address}`)
  }
  return getAddress(address)
}

export function caip10Uri(address: string, chainId = INTUITION_CHAIN_ID): string {
  return `caip10:eip155:${chainId}:${normalizeWalletAddress(address)}`
}

export function getTrustNomiksAttesterAddress(): Address | null {
  const configured =
    process.env.TRUSTNOMIKS_ATTESTER_ADDRESS ??
    process.env.NEXT_PUBLIC_TRUSTNOMIKS_ATTESTER_ADDRESS

  if (!configured) return null
  return normalizeWalletAddress(configured)
}

export function getTrustNomiksAttestationPrivateKey(): Hex | null {
  const value = process.env.TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY
  if (!value) return null
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error('TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY must be a 0x-prefixed 32-byte hex private key')
  }
  return value as Hex
}

export function createTrustNomiksAttesterAccount() {
  const privateKey = getTrustNomiksAttestationPrivateKey()
  if (!privateKey) {
    throw new Error(
      'TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY is required to publish verifiable TrustNomiks exports',
    )
  }
  const account = privateKeyToAccount(privateKey)
  const expected = getTrustNomiksAttesterAddress()
  if (expected && account.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(
      `TRUSTNOMIKS_ATTESTATION_PRIVATE_KEY resolves to ${account.address}, ` +
        `but TRUSTNOMIKS_ATTESTER_ADDRESS is ${expected}`,
    )
  }
  return account
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function exportManifestPayloadHash(
  payload: TrustNomiksExportRunSignedPayload,
): Hex {
  return keccak256(stringToHex(stableStringify(payload)))
}

export async function signExportRunPayload(
  payload: TrustNomiksExportRunSignedPayload,
): Promise<TrustNomiksExportRunAttestation> {
  const account = createTrustNomiksAttesterAccount()
  const canonicalPayload = stableStringify(payload)
  const signature = await account.signMessage({ message: canonicalPayload })
  return {
    signatureKind: 'eip191',
    signerAddress: account.address,
    payloadHash: keccak256(stringToHex(canonicalPayload)),
    signature,
  }
}

export async function createSignedExportRunManifest(
  payload: TrustNomiksExportRunSignedPayload,
): Promise<TrustNomiksExportRunManifest> {
  const attestation = await signExportRunPayload(payload)
  return { ...payload, attestation }
}

export async function verifyExportRunManifest(
  manifest: TrustNomiksExportRunManifest,
  expectedSigner = getTrustNomiksAttesterAddress(),
): Promise<ManifestVerificationResult> {
  if (!expectedSigner) {
    return { valid: false, reason: 'TrustNomiks attester address is not configured' }
  }

  const payload = manifestPayload(manifest)
  const structureReason = validateManifestPayload(payload)
  if (structureReason) {
    return { valid: false, reason: structureReason, payload }
  }

  const attestation = manifest.attestation
  if (!attestation || attestation.signatureKind !== 'eip191') {
    return { valid: false, reason: 'Missing or unsupported TrustNomiks attestation', payload }
  }
  if (!/^0x[0-9a-fA-F]+$/.test(attestation.signature)) {
    return { valid: false, reason: 'Invalid TrustNomiks attestation signature', payload }
  }
  if (attestation.payloadHash.toLowerCase() !== exportManifestPayloadHash(payload).toLowerCase()) {
    return { valid: false, reason: 'TrustNomiks attestation payload hash mismatch', payload }
  }

  try {
    const recoveredAddress = await recoverMessageAddress({
      message: stableStringify(payload),
      signature: attestation.signature,
    })
    const recovered = normalizeWalletAddress(recoveredAddress)
    if (recovered.toLowerCase() !== expectedSigner.toLowerCase()) {
      return {
        valid: false,
        reason: `TrustNomiks attestation signed by unexpected address ${recovered}`,
        recoveredAddress: recovered,
        payload,
      }
    }
    if (normalizeWalletAddress(attestation.signerAddress).toLowerCase() !== expectedSigner.toLowerCase()) {
      return {
        valid: false,
        reason: 'TrustNomiks attestation signerAddress does not match the configured signer',
        recoveredAddress: recovered,
        payload,
      }
    }
    if (payload.attesterAtom.uri.toLowerCase() !== caip10Uri(expectedSigner).toLowerCase()) {
      return {
        valid: false,
        reason: 'TrustNomiks attester atom does not match the configured signer',
        recoveredAddress: recovered,
        payload,
      }
    }
    if (payload.submitterAtom.uri.toLowerCase() !== caip10Uri(payload.walletAddress).toLowerCase()) {
      return {
        valid: false,
        reason: 'TrustNomiks submitter atom does not match the export wallet',
        recoveredAddress: recovered,
        payload,
      }
    }
    return { valid: true, recoveredAddress: recovered, payload }
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : 'Failed to recover TrustNomiks attestation signer',
      payload,
    }
  }
}

export function parseExportRunManifest(raw: string | null | undefined): TrustNomiksExportRunManifest | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as TrustNomiksExportRunManifest
    return parsed?.type === TRUSTNOMIKS_EXPORT_TYPE && parsed?.app === TRUSTNOMIKS_APP_NAME
      ? parsed
      : null
  } catch {
    return null
  }
}

function manifestPayload(
  manifest: TrustNomiksExportRunManifest,
): TrustNomiksExportRunSignedPayload {
  const payload = { ...manifest } as Partial<TrustNomiksExportRunManifest>
  delete payload.attestation
  return payload as TrustNomiksExportRunSignedPayload
}

function validateManifestPayload(payload: TrustNomiksExportRunSignedPayload): string | null {
  if (payload.type !== TRUSTNOMIKS_EXPORT_TYPE) return 'Unexpected export manifest type'
  if (payload.schemaVersion !== TRUSTNOMIKS_EXPORT_SCHEMA_VERSION) {
    return 'Unsupported TrustNomiks export manifest schema version'
  }
  if (payload.app !== TRUSTNOMIKS_APP_NAME) return 'Unexpected export manifest app'
  if (!payload.exportRunId) return 'Missing exportRunId'
  if (!payload.tokenId || !payload.tokenName) return 'Missing token identity'
  if (payload.chainId !== INTUITION_CHAIN_ID) return 'Unexpected Intuition chain id'
  if (!isAddress(payload.walletAddress)) return 'Invalid submitter wallet address'
  if (!payload.claimTermIds.every((id) => /^0x[0-9a-fA-F]{64}$/.test(id))) {
    return 'Invalid claim term id in manifest'
  }
  for (const key of ['publishedBy', 'submittedBy', 'attestedBy', 'includesClaim'] as const) {
    const predicate = payload.predicates?.[key]
    if (!predicate?.termId || !/^0x[0-9a-fA-F]{64}$/.test(predicate.termId)) {
      return `Missing or invalid ${key} predicate term id`
    }
    if (!predicate.uri?.startsWith('ipfs://')) {
      return `Missing or invalid ${key} predicate uri`
    }
  }
  for (const ref of [payload.appAtom, payload.submitterAtom, payload.attesterAtom]) {
    if (!ref?.termId || !/^0x[0-9a-fA-F]{64}$/.test(ref.termId)) {
      return 'Missing or invalid attestation atom term id'
    }
  }
  if (!payload.appAtom.uri?.startsWith('ipfs://')) {
    return 'Missing or invalid TrustNomiks app atom uri'
  }
  return null
}
