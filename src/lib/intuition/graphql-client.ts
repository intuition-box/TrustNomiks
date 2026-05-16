import { createPublicClient, http, parseAbi, type Address, type Hex, type PublicClient } from 'viem'
import {
  INTUITION_CHAIN,
  INTUITION_CHAIN_ID,
  INTUITION_GRAPHQL_ENDPOINT,
  MULTIVAULT_ADDRESS,
} from './config'
import type {
  IntuitionAccountActivity,
  IntuitionAccountSummary,
  IntuitionAtomSummary,
  IntuitionPositionSummary,
  IntuitionTripleSummary,
  IntuitionVaultSummary,
  MyRunsResponse,
  MyRunSummary,
  RunDetailResponse,
  TrustNomiksStakeSummary,
} from '@/types/intuition'
import {
  normalizeWalletAddress,
  parseExportRunManifest,
  verifyExportRunManifest,
  type TrustNomiksExportRunManifest,
  type TrustNomiksExportRunSignedPayload,
} from './attestation'

const DEFAULT_TIMEOUT_MS = 15_000
const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/

interface GraphQLResponse<TData> {
  data?: TData
  errors?: Array<{ message: string }>
}

export class IntuitionGraphQLError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'IntuitionGraphQLError'
  }
}

export function isWalletAddress(value: string | null): value is string {
  return typeof value === 'string' && WALLET_REGEX.test(value)
}

export function parsePositiveIntParam(
  value: string | null,
  fallback: number,
  max: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

export async function postIntuitionGraphQL<
  TData,
  TVariables extends Record<string, unknown>,
>(
  query: string,
  variables: TVariables,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<TData> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const response = await fetch(INTUITION_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
      next: { revalidate: 30 },
    })

    if (!response.ok) {
      throw new IntuitionGraphQLError(
        `Intuition GraphQL HTTP ${response.status}`,
        response.status,
      )
    }

    const json = (await response.json()) as GraphQLResponse<TData>
    if (json.errors?.length) {
      throw new IntuitionGraphQLError(
        `Intuition GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`,
      )
    }
    if (!json.data) {
      throw new IntuitionGraphQLError('Intuition GraphQL returned empty data')
    }

    return json.data
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new IntuitionGraphQLError(
        `Intuition GraphQL request timed out after ${timeoutMs}ms`,
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

interface RawAggregate {
  aggregate?: {
    count: number
    sum?: {
      shares?: string | null
    } | null
  } | null
}

type RawAccount = IntuitionAccountSummary

interface RawVault {
  term_id: string
  curve_id?: string | number | null
  total_shares?: string | null
  total_assets?: string | null
  current_share_price?: string | null
  position_count?: number | string | null
  market_cap?: string | null
  positions_aggregate?: RawAggregate
  term?: {
    atom?: RawAtom | null
    triple?: RawTriple | null
  } | null
}

interface RawAtom {
  term_id: string
  label?: string | null
  image?: string | null
  type?: string | null
  data?: string | null
  created_at?: string | null
  transaction_hash?: string | null
  creator?: RawAccount | null
  creator_id?: string | null
  term?: {
    vaults?: RawVault[]
  } | null
  value?: {
    thing?: {
      name?: string | null
      description?: string | null
      url?: string | null
    } | null
  } | null
}

interface RawTriple {
  term_id: string
  subject_id?: string | null
  predicate_id?: string | null
  object_id?: string | null
  counter_term_id?: string | null
  created_at?: string | null
  transaction_hash?: string | null
  creator?: RawAccount | null
  creator_id?: string | null
  subject?: RawAtom | null
  predicate?: RawAtom | null
  object?: RawAtom | null
  term?: {
    vaults?: RawVault[]
  } | null
  counter_term?: {
    vaults?: RawVault[]
  } | null
}

interface ExportRunsQueryData {
  atoms: RawAtom[]
  atoms_aggregate: RawAggregate
}

interface ExportRunAtomQueryData {
  atom: RawAtom | null
}

interface ExportRunClaimsQueryData {
  claimTriples: RawTriple[]
}

interface ExportRunLinksQueryData {
  triples: RawTriple[]
}

interface TrustNomiksStakePositionsData {
  positions: Array<{
    id: string
    shares: string
    term_id: string
    vault?: {
      total_shares?: string | null
      total_assets?: string | null
    } | null
  }>
}

interface RawPosition {
  id: string
  account_id: string
  shares: string
  term_id: string
  curve_id: string | number
  created_at: string
  updated_at: string
  transaction_hash: string
  vault?: RawVault | null
}

interface AccountActivityQueryData {
  positions: RawPosition[]
  positions_aggregate: RawAggregate
  atoms: RawAtom[]
  atoms_aggregate: RawAggregate
  triples: RawTriple[]
  triples_aggregate: RawAggregate
}

const ACCOUNT_ACTIVITY_QUERY = /* GraphQL */ `
  query AccountActivity($wallet: String!, $positionLimit: Int!, $createdLimit: Int!) {
    positions(
      where: { account_id: { _eq: $wallet }, shares: { _gt: "0" } }
      limit: $positionLimit
      order_by: { updated_at: desc }
    ) {
      id
      account_id
      shares
      term_id
      curve_id
      created_at
      updated_at
      transaction_hash
      vault {
        term_id
        curve_id
        total_shares
        total_assets
        current_share_price
        position_count
        market_cap
        term {
          atom {
            term_id
            label
            image
            type
            data
            created_at
            transaction_hash
            creator { id label image }
          }
          triple {
            term_id
            counter_term_id
            created_at
            transaction_hash
            creator { id label image }
            subject { term_id label image type data }
            predicate { term_id label image type data }
            object { term_id label image type data }
            term {
              vaults(where: { curve_id: { _eq: "1" } }) {
                term_id
                curve_id
                total_shares
                total_assets
                current_share_price
                position_count
                market_cap
              }
            }
            counter_term {
              vaults(where: { curve_id: { _eq: "1" } }) {
                term_id
                curve_id
                total_shares
                total_assets
                current_share_price
                position_count
                market_cap
              }
            }
          }
        }
      }
    }
    positions_aggregate(
      where: { account_id: { _eq: $wallet }, shares: { _gt: "0" } }
    ) {
      aggregate {
        count
        sum { shares }
      }
    }
    atoms(
      where: { creator_id: { _eq: $wallet } }
      limit: $createdLimit
      order_by: { created_at: desc }
    ) {
      term_id
      label
      image
      type
      data
      created_at
      transaction_hash
      creator { id label image }
      term {
        vaults(where: { curve_id: { _eq: "1" } }) {
          term_id
          curve_id
          total_shares
          total_assets
          current_share_price
          position_count
          market_cap
        }
      }
    }
    atoms_aggregate(where: { creator_id: { _eq: $wallet } }) {
      aggregate { count }
    }
    triples(
      where: { creator_id: { _eq: $wallet } }
      limit: $createdLimit
      order_by: { created_at: desc }
    ) {
      term_id
      counter_term_id
      created_at
      transaction_hash
      creator { id label image }
      subject { term_id label image type data }
      predicate { term_id label image type data }
      object { term_id label image type data }
      term {
        vaults(where: { curve_id: { _eq: "1" } }) {
          term_id
          curve_id
          total_shares
          total_assets
          current_share_price
          position_count
          market_cap
        }
      }
      counter_term {
        vaults(where: { curve_id: { _eq: "1" } }) {
          term_id
          curve_id
          total_shares
          total_assets
          current_share_price
          position_count
          market_cap
        }
      }
    }
    triples_aggregate(where: { creator_id: { _eq: $wallet } }) {
      aggregate { count }
    }
  }
`

const EXPORT_RUN_LABEL_PREFIX = 'TrustNomiks Export:'

const EXPORT_RUNS_QUERY = /* GraphQL */ `
  query ExportRuns(
    $wallet: String!
    $labelPattern: String!
    $limit: Int!
    $offset: Int!
  ) {
    atoms(
      where: { creator_id: { _eq: $wallet }, label: { _ilike: $labelPattern } }
      limit: $limit
      offset: $offset
      order_by: { created_at: desc }
    ) {
      term_id
      label
      type
      data
      created_at
      transaction_hash
      creator { id label image }
      value { thing { name description url } }
    }
    atoms_aggregate(
      where: { creator_id: { _eq: $wallet }, label: { _ilike: $labelPattern } }
    ) {
      aggregate { count }
    }
  }
`

const EXPORT_RUN_ATOM_QUERY = /* GraphQL */ `
  query ExportRunAtom($runTermId: String!) {
    atom(term_id: $runTermId) {
      term_id
      label
      type
      data
      created_at
      transaction_hash
      creator { id label image }
      value { thing { name description url } }
    }
  }
`

const EXPORT_RUN_LINKS_QUERY = /* GraphQL */ `
  query ExportRunLinks($runTermIds: [String!], $predicateIds: [String!]) {
    triples(
      where: {
        subject: { term_id: { _in: $runTermIds } }
        predicate: { term_id: { _in: $predicateIds } }
      }
      limit: 10000
    ) {
      term_id
      subject_id
      predicate_id
      object_id
      created_at
      transaction_hash
      subject { term_id label image type data }
      predicate { term_id label image type data }
      object { term_id label image type data }
    }
  }
`

const EXPORT_RUN_CLAIMS_QUERY = /* GraphQL */ `
  query ExportRunClaims($claimTermIds: [String!]) {
    claimTriples: triples(where: { term_id: { _in: $claimTermIds } }, limit: 10000) {
      term_id
      subject_id
      predicate_id
      object_id
      created_at
      transaction_hash
      subject { term_id label image type data }
      predicate { term_id label image type data }
      object { term_id label image type data }
    }
  }
`

const TRUSTNOMIKS_STAKE_EXPORT_RUNS_QUERY = /* GraphQL */ `
  query TrustNomiksStakeExportRuns($labelPattern: String!, $limit: Int!) {
    atoms(
      where: { label: { _ilike: $labelPattern } }
      limit: $limit
      order_by: { created_at: desc }
    ) {
      term_id
      label
      type
      data
      created_at
      transaction_hash
      creator { id label image }
      value { thing { name description url } }
    }
  }
`

const TRUSTNOMIKS_STAKE_POSITIONS_QUERY = /* GraphQL */ `
  query TrustNomiksStakePositions($wallet: String!, $claimTermIds: [String!]) {
    positions(
      where: {
        account_id: { _eq: $wallet }
        shares: { _gt: "0" }
        term_id: { _in: $claimTermIds }
      }
      limit: 10000
    ) {
      id
      shares
      term_id
      vault {
        total_shares
        total_assets
      }
    }
  }
`

export async function fetchAccountActivity(
  walletAddress: string,
  options: { positionLimit: number; createdLimit: number },
): Promise<IntuitionAccountActivity> {
  const data = await postIntuitionGraphQL<
    AccountActivityQueryData,
    { wallet: string; positionLimit: number; createdLimit: number }
  >(ACCOUNT_ACTIVITY_QUERY, {
    wallet: walletAddress,
    positionLimit: options.positionLimit,
    createdLimit: options.createdLimit,
  })

  return {
    walletAddress,
    chainId: INTUITION_CHAIN_ID,
    graphqlEndpoint: INTUITION_GRAPHQL_ENDPOINT,
    fetchedAt: new Date().toISOString(),
    aggregates: {
      activePositions: data.positions_aggregate.aggregate?.count ?? 0,
      activePositionShares:
        data.positions_aggregate.aggregate?.sum?.shares ?? null,
      atomsCreated: data.atoms_aggregate.aggregate?.count ?? 0,
      triplesCreated: data.triples_aggregate.aggregate?.count ?? 0,
    },
    positions: data.positions.map(mapPosition),
    createdAtoms: data.atoms.map(mapAtom).filter(isNonNull),
    createdTriples: data.triples.map(mapTriple).filter(isNonNull),
  }
}

export async function fetchExportRunsByWallet(
  walletAddress: string,
  options: { page: number; pageSize: number },
): Promise<Pick<MyRunsResponse, 'runs' | 'total' | 'aggregates'>> {
  const normalizedWallet = normalizeWalletAddress(walletAddress)
  const offset = (options.page - 1) * options.pageSize
  const variables = {
    wallet: normalizedWallet.toLowerCase(),
    labelPattern: `${EXPORT_RUN_LABEL_PREFIX}%`,
    limit: options.pageSize,
    offset,
  }

  const data = await postIntuitionGraphQL<ExportRunsQueryData, typeof variables>(
    EXPORT_RUNS_QUERY,
    variables,
  )

  const verifiedCandidates = (await verifyExportRunAtoms(data.atoms))
    .filter(({ payload }) => payload.walletAddress.toLowerCase() === normalizedWallet.toLowerCase())
  const linksByRun = await fetchLinksByRun(verifiedCandidates)

  const runs: MyRunSummary[] = verifiedCandidates.flatMap((candidate) => {
    const claimTermIds = verifiedClaimTermIdsForRun(candidate, linksByRun.get(candidate.atom.term_id) ?? [])
    if (!claimTermIds) return []
    const { atom, payload } = candidate
    return {
      runId: atom.term_id,
      tokenId: payload.tokenId,
      tokenName: payload.tokenName,
      tokenTicker: payload.tokenTicker,
      walletAddress: payload.walletAddress,
      chainId: INTUITION_CHAIN_ID,
      status: 'completed',
      atomsCreated: 1,
      atomsSkipped: 0,
      atomsFailed: 0,
      triplesCreated: claimTermIds.length,
      triplesSkipped: 0,
      triplesFailed: 0,
      txHashCount: atom.transaction_hash ? 1 : 0,
      startedAt: atom.created_at ?? payload.createdAt,
      completedAt: atom.created_at ?? payload.createdAt,
    }
  })

  const total = runs.length

  return {
    runs,
    total,
    aggregates: {
      distinctTokens: new Set(runs.map((run) => run.tokenId)).size,
      totalAtomsCreated: runs.length,
      totalTriplesCreated: runs.reduce((sum, run) => sum + run.triplesCreated, 0),
      totalRuns: total,
      runsByStatus: {
        pending: 0,
        running: 0,
        completed: total,
        partial: 0,
        failed: 0,
      },
    },
  }
}

export async function fetchExportRunDetail(runTermId: string): Promise<RunDetailResponse> {
  const detail = await postIntuitionGraphQL<
    ExportRunAtomQueryData,
    { runTermId: string }
  >(EXPORT_RUN_ATOM_QUERY, { runTermId })

  if (!detail.atom) {
    throw new IntuitionGraphQLError('Export run atom not found on Intuition')
  }

  const [candidate] = await verifyExportRunAtoms([detail.atom])
  if (!candidate) {
    throw new IntuitionGraphQLError('Export run is not signed by the configured TrustNomiks attester')
  }

  const linksByRun = await fetchLinksByRun([candidate])
  const exportLinks = linksByRun.get(detail.atom.term_id) ?? []
  const claimTermIds = verifiedClaimTermIdsForRun(candidate, exportLinks)
  if (!claimTermIds) {
    throw new IntuitionGraphQLError('Export run is missing required TrustNomiks verification links')
  }

  const claims = claimTermIds.length === 0
    ? { claimTriples: [] }
    : await postIntuitionGraphQL<ExportRunClaimsQueryData, { claimTermIds: string[] }>(
      EXPORT_RUN_CLAIMS_QUERY,
      { claimTermIds },
    )

  const atomsByTermId = new Map<string, RawAtom>()
  atomsByTermId.set(detail.atom.term_id, detail.atom)
  for (const claim of claims.claimTriples) {
    for (const atom of [claim.subject, claim.predicate, claim.object]) {
      if (atom?.term_id) atomsByTermId.set(atom.term_id, atom)
    }
  }

  const atomMappings = Array.from(atomsByTermId.values()).map((atom) => ({
    atomId: atom.term_id,
    atomType: atom.term_id === detail.atom!.term_id ? 'export_run' : inferAtomType(atom),
    normalizedData: atom.data ?? atom.label ?? atom.term_id,
    termId: atom.term_id,
    txHash: atom.transaction_hash ?? '',
    status: 'confirmed' as const,
    errorMessage: null,
  }))

  const claimMappings = claims.claimTriples
    .map((claim) => ({
      tripleId: claim.term_id,
      claimGroup: 'intuition_graphql',
      originRowId: null,
      subjectTermId: claim.subject_id ?? claim.subject?.term_id ?? '',
      predicateTermId: claim.predicate_id ?? claim.predicate?.term_id ?? '',
      objectTermId: claim.object_id ?? claim.object?.term_id ?? '',
      tripleTermId: claim.term_id,
      txHash: claim.transaction_hash ?? '',
      status: 'confirmed' as const,
      errorMessage: null,
    }))
    .filter((mapping) => mapping.subjectTermId && mapping.predicateTermId && mapping.objectTermId)

  const verifiedClaimSet = new Set(claimTermIds.map((id) => id.toLowerCase()))
  const provenanceMappings = exportLinks
    .filter((link) => sameTerm(link.predicate_id ?? link.predicate?.term_id, candidate.payload.predicates.includesClaim.termId))
    .filter((link) => verifiedClaimSet.has((link.object_id ?? link.object?.term_id ?? '').toLowerCase()))
    .map((link) => ({
      tripleId: link.object_id ?? link.object?.term_id ?? '',
      sourceAtomId: detail.atom!.term_id,
      relation: 'includes_claim' as const,
      predicateTermId: link.predicate_id ?? link.predicate?.term_id ?? null,
      provenanceTripleTermId: link.term_id,
      txHash: link.transaction_hash ?? '',
      status: 'confirmed' as const,
      errorMessage: null,
    }))
    .filter((mapping) => mapping.tripleId)

  return {
    run: {
      runId: detail.atom.term_id,
      tokenId: candidate.payload.tokenId,
      tokenName: candidate.payload.tokenName,
      tokenTicker: candidate.payload.tokenTicker,
      walletAddress: candidate.payload.walletAddress,
      chainId: INTUITION_CHAIN_ID,
      status: 'completed',
      startedAt: detail.atom.created_at ?? candidate.payload.createdAt,
      completedAt: detail.atom.created_at ?? candidate.payload.createdAt,
      isLegacy: false,
      snapshotSource: 'intuition_graphql',
    },
    atomMappings,
    claimMappings,
    provenanceMappings,
    canonicalAtoms: [],
    canonicalTriples: [],
  }
}

export async function fetchTrustNomiksStakeByWallet(
  walletAddress: string,
  options: { publicClient?: Pick<PublicClient, 'readContract'> } = {},
): Promise<TrustNomiksStakeSummary> {
  const normalizedWallet = normalizeWalletAddress(walletAddress)
  const exportRuns = await postIntuitionGraphQL<
    { atoms: RawAtom[] },
    { labelPattern: string; limit: number }
  >(TRUSTNOMIKS_STAKE_EXPORT_RUNS_QUERY, {
    labelPattern: `${EXPORT_RUN_LABEL_PREFIX}%`,
    limit: 10000,
  })

  const verifiedCandidates = await verifyExportRunAtoms(exportRuns.atoms)
  if (verifiedCandidates.length === 0) {
    return emptyTrustNomiksStake(normalizedWallet)
  }

  const linksByRun = await fetchLinksByRun(verifiedCandidates)
  const claimTermIds = uniqueTermIds(
    verifiedCandidates.flatMap((candidate) =>
      verifiedClaimTermIdsForRun(candidate, linksByRun.get(candidate.atom.term_id) ?? []) ?? [],
    ),
  )
  if (claimTermIds.length === 0) {
    return emptyTrustNomiksStake(normalizedWallet)
  }

  const positions = await postIntuitionGraphQL<
    TrustNomiksStakePositionsData,
    { wallet: string; claimTermIds: string[] }
  >(TRUSTNOMIKS_STAKE_POSITIONS_QUERY, {
    wallet: normalizedWallet.toLowerCase(),
    claimTermIds,
  })

  const positionTermIds = uniqueTermIds(positions.positions.map((position) => position.term_id))
  const chainStake = await readTrustStakeFromChain(
    normalizedWallet,
    positionTermIds,
    options.publicClient,
  )

  return {
    walletAddress: normalizedWallet,
    chainId: INTUITION_CHAIN_ID,
    graphqlEndpoint: INTUITION_GRAPHQL_ENDPOINT,
    fetchedAt: new Date().toISOString(),
    claimCount: claimTermIds.length,
    positionCount: chainStake.positionCount,
    stakedTrustWei: chainStake.stakedTrustWei.toString(),
  }
}

interface VerifiedExportRun {
  atom: RawAtom
  manifest: TrustNomiksExportRunManifest
  payload: TrustNomiksExportRunSignedPayload
}

const TERM_ID_REGEX = /^0x[0-9a-fA-F]{64}$/
const STAKE_READ_ABI = parseAbi([
  'function getBondingCurveConfig() view returns ((address registry, uint256 defaultCurveId))',
  'function getShares(address account, bytes32 termId, uint256 curveId) view returns (uint256)',
  'function convertToAssets(bytes32 termId, uint256 curveId, uint256 shares) view returns (uint256)',
])

async function verifyExportRunAtoms(atoms: RawAtom[]): Promise<VerifiedExportRun[]> {
  const results = await Promise.all(
    atoms.map(async (atom) => {
      const manifest = parseExportRunManifest(atom.value?.thing?.description)
      if (!manifest) return null
      const verification = await verifyExportRunManifest(manifest)
      if (!verification.valid || !verification.payload) return null
      return { atom, manifest, payload: verification.payload }
    }),
  )
  return results.filter(isNonNull)
}

async function fetchLinksByRun(
  runs: VerifiedExportRun[],
): Promise<Map<string, RawTriple[]>> {
  if (runs.length === 0) return new Map()
  const runTermIds = runs.map((run) => run.atom.term_id)
  const predicateIds = uniqueTermIds(runs.flatMap((run) => [
    run.payload.predicates.publishedBy.termId,
    run.payload.predicates.submittedBy.termId,
    run.payload.predicates.attestedBy.termId,
    run.payload.predicates.includesClaim.termId,
  ]))

  const data = await postIntuitionGraphQL<
    ExportRunLinksQueryData,
    { runTermIds: string[]; predicateIds: string[] }
  >(EXPORT_RUN_LINKS_QUERY, { runTermIds, predicateIds })

  const linksByRun = new Map<string, RawTriple[]>()
  for (const link of data.triples) {
    const runTermId = link.subject_id ?? link.subject?.term_id
    if (!runTermId) continue
    const arr = linksByRun.get(runTermId) ?? []
    arr.push(link)
    linksByRun.set(runTermId, arr)
  }
  return linksByRun
}

function verifiedClaimTermIdsForRun(
  run: VerifiedExportRun,
  links: RawTriple[],
): string[] | null {
  const payload = run.payload
  if (!hasLink(links, payload.predicates.publishedBy.termId, payload.appAtom.termId)) {
    return null
  }
  if (!hasLink(links, payload.predicates.submittedBy.termId, payload.submitterAtom.termId)) {
    return null
  }
  if (!hasLink(links, payload.predicates.attestedBy.termId, payload.attesterAtom.termId)) {
    return null
  }

  const signedClaimIds = new Set(payload.claimTermIds.map((id) => id.toLowerCase()))
  return uniqueTermIds(
    links
      .filter((link) => sameTerm(link.predicate_id ?? link.predicate?.term_id, payload.predicates.includesClaim.termId))
      .map((link) => link.object_id ?? link.object?.term_id ?? '')
      .filter((id) => signedClaimIds.has(id.toLowerCase())),
  )
}

function hasLink(links: RawTriple[], predicateTermId: string, objectTermId: string): boolean {
  return links.some((link) =>
    sameTerm(link.predicate_id ?? link.predicate?.term_id, predicateTermId) &&
    sameTerm(link.object_id ?? link.object?.term_id, objectTermId),
  )
}

function sameTerm(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase())
}

function uniqueTermIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    if (!TERM_ID_REGEX.test(id)) continue
    const key = id.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(id)
  }
  return result
}

async function readTrustStakeFromChain(
  walletAddress: Address,
  termIds: string[],
  client: Pick<PublicClient, 'readContract'> = createPublicClient({
    chain: INTUITION_CHAIN,
    transport: http(),
  }),
): Promise<{ positionCount: number; stakedTrustWei: bigint }> {
  if (termIds.length === 0) {
    return { positionCount: 0, stakedTrustWei: BigInt(0) }
  }

  const curveConfig = await client.readContract({
    address: MULTIVAULT_ADDRESS,
    abi: STAKE_READ_ABI,
    functionName: 'getBondingCurveConfig',
  })
  const curveId = defaultCurveIdFromResult(curveConfig)
  const stakes = await mapLimit(termIds, 8, async (termId) => {
    const shares = await client.readContract({
      address: MULTIVAULT_ADDRESS,
      abi: STAKE_READ_ABI,
      functionName: 'getShares',
      args: [walletAddress, termId as Hex, curveId],
    }) as bigint
    if (shares === BigInt(0)) return BigInt(0)
    return await client.readContract({
      address: MULTIVAULT_ADDRESS,
      abi: STAKE_READ_ABI,
      functionName: 'convertToAssets',
      args: [termId as Hex, curveId, shares],
    }) as bigint
  })

  return {
    positionCount: stakes.filter((stake) => stake > BigInt(0)).length,
    stakedTrustWei: stakes.reduce((sum, stake) => sum + stake, BigInt(0)),
  }
}

function defaultCurveIdFromResult(result: unknown): bigint {
  if (typeof result === 'object' && result !== null && 'defaultCurveId' in result) {
    return (result as { defaultCurveId: bigint }).defaultCurveId
  }
  if (Array.isArray(result) && typeof result[1] === 'bigint') {
    return result[1]
  }
  throw new Error('Unable to read Intuition default bonding curve id')
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    results.push(...await Promise.all(batch.map(mapper)))
  }
  return results
}

function mapPosition(position: RawPosition): IntuitionPositionSummary {
  return {
    id: position.id,
    accountId: position.account_id,
    shares: position.shares,
    termId: position.term_id,
    curveId: String(position.curve_id),
    createdAt: position.created_at,
    updatedAt: position.updated_at,
    transactionHash: position.transaction_hash,
    vault: mapVault(position.vault),
    atom: mapAtom(position.vault?.term?.atom ?? null),
    triple: mapTriple(position.vault?.term?.triple ?? null),
  }
}

function mapAtom(atom: RawAtom | null | undefined): IntuitionAtomSummary | null {
  if (!atom) return null
  return {
    termId: atom.term_id,
    label: atom.label ?? null,
    image: atom.image ?? null,
    type: atom.type ?? null,
    data: atom.data ?? null,
    createdAt: atom.created_at ?? null,
    transactionHash: atom.transaction_hash ?? null,
    creator: atom.creator ?? null,
    vault: mapVault(firstVault(atom.term?.vaults)),
  }
}

function mapTriple(
  triple: RawTriple | null | undefined,
): IntuitionTripleSummary | null {
  if (!triple) return null
  return {
    termId: triple.term_id,
    counterTermId: triple.counter_term_id ?? null,
    createdAt: triple.created_at ?? null,
    transactionHash: triple.transaction_hash ?? null,
    creator: triple.creator ?? null,
    subject: mapAtom(triple.subject),
    predicate: mapAtom(triple.predicate),
    object: mapAtom(triple.object),
    vault: mapVault(firstVault(triple.term?.vaults)),
    counterVault: mapVault(firstVault(triple.counter_term?.vaults)),
  }
}

function mapVault(vault: RawVault | null | undefined): IntuitionVaultSummary | null {
  if (!vault) return null
  return {
    termId: vault.term_id,
    curveId: vault.curve_id == null ? null : String(vault.curve_id),
    totalShares: vault.total_shares ?? null,
    totalAssets: vault.total_assets ?? null,
    currentSharePrice: vault.current_share_price ?? null,
    positionCount: vault.position_count ?? null,
    marketCap: vault.market_cap ?? null,
    totalPositionShares:
      vault.positions_aggregate?.aggregate?.sum?.shares ?? null,
  }
}

function firstVault(vaults: RawVault[] | null | undefined): RawVault | null {
  return vaults?.[0] ?? null
}

function inferAtomType(atom: RawAtom): string {
  const label = atom.label?.toLowerCase() ?? ''
  if (label.includes('source') || label.startsWith('http')) return 'data_source'
  if (label.includes('trustnomiks')) return 'application'
  if (atom.data?.startsWith('caip10:')) return 'wallet'
  if (atom.type === 'TextObject') return 'literal'
  return 'category'
}

function emptyTrustNomiksStake(walletAddress: string): TrustNomiksStakeSummary {
  return {
    walletAddress,
    chainId: INTUITION_CHAIN_ID,
    graphqlEndpoint: INTUITION_GRAPHQL_ENDPOINT,
    fetchedAt: new Date().toISOString(),
    claimCount: 0,
    positionCount: 0,
    stakedTrustWei: '0',
  }
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null
}
