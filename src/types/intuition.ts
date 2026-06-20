import type { PublishPlan, PublishRunResult, PublishStatus, RunStatus } from '@/lib/intuition/types'

// ── Shared Intuition GraphQL response types ──────────────────────────────────

export interface IntuitionAccountSummary {
  id: string
  label?: string | null
  image?: string | null
}

export interface IntuitionVaultSummary {
  termId: string
  curveId: string | null
  totalShares: string | null
  totalAssets: string | null
  currentSharePrice: string | null
  positionCount: number | string | null
  marketCap: string | null
  totalPositionShares: string | null
}

export interface IntuitionAtomSummary {
  termId: string
  label: string | null
  image: string | null
  type: string | null
  data: string | null
  createdAt: string | null
  transactionHash: string | null
  creator: IntuitionAccountSummary | null
  vault: IntuitionVaultSummary | null
}

export interface IntuitionTripleSummary {
  termId: string
  counterTermId: string | null
  createdAt: string | null
  transactionHash: string | null
  creator: IntuitionAccountSummary | null
  subject: IntuitionAtomSummary | null
  predicate: IntuitionAtomSummary | null
  object: IntuitionAtomSummary | null
  vault: IntuitionVaultSummary | null
  counterVault: IntuitionVaultSummary | null
}

export interface IntuitionPositionSummary {
  id: string
  accountId: string
  shares: string
  termId: string
  curveId: string
  createdAt: string
  updatedAt: string
  transactionHash: string
  vault: IntuitionVaultSummary | null
  atom: IntuitionAtomSummary | null
  triple: IntuitionTripleSummary | null
}

export interface IntuitionAccountActivity {
  walletAddress: string
  chainId: number
  graphqlEndpoint: string
  fetchedAt: string
  aggregates: {
    activePositions: number
    activePositionShares: string | null
    atomsCreated: number
    triplesCreated: number
  }
  positions: IntuitionPositionSummary[]
  createdAtoms: IntuitionAtomSummary[]
  createdTriples: IntuitionTripleSummary[]
}

export interface TrustNomiksStakeSummary {
  walletAddress: string
  chainId: number
  graphqlEndpoint: string
  fetchedAt: string
  claimCount: number
  positionCount: number
  stakedTrustWei: string
}

// ── API: GET /api/intuition/publish-plan ─────────────────────────────────────

export interface PublishPlanResponse {
  plan: PublishPlanSerialized
}

/**
 * Serialized version of PublishPlan where bigint fields are strings.
 * (JSON cannot represent bigint natively.)
 */
export interface PublishPlanSerialized extends Omit<PublishPlan, 'estimatedCost'> {
  estimatedCost: {
    atomCostPerUnit: string
    tripleCostPerUnit: string
    extraDepositPerUnit: string
    totalAtomsCost: string
    totalTriplesCost: string
    totalProvenanceCost: string
    totalCost: string
  }
}

// ── API: POST /api/intuition/publish-runs ────────────────────────────────────

/** Legacy: persist full run at end (backward compatible) */
export interface PublishRunRequest {
  tokenId: string
  walletAddress: string
  chainId: number
  result: PublishRunResult
}

/** Initialize a new run with status=running */
export interface PublishRunInitRequest {
  action: 'init'
  tokenId: string
  walletAddress: string
  chainId: number
}

/** Persist a chunk's mappings and update run counters */
export interface PublishRunChunkRequest {
  action: 'chunk'
  runId: string
  chainId: number
  atomMappings?: PublishRunResult['atomMappings']
  claimMappings?: PublishRunResult['claimMappings']
  provenanceMappings?: PublishRunResult['provenanceMappings']
  txHash?: string
  /** Accumulated counters so far — written to the run row for crash recovery */
  counters?: {
    atomsCreated: number
    atomsSkipped: number
    atomsFailed: number
    triplesCreated: number
    triplesSkipped: number
    triplesFailed: number
  }
}

/** Finalize the run with final status and counters */
export interface PublishRunFinalizeRequest {
  action: 'finalize'
  runId: string
  status: RunStatus
  counters: {
    atomsCreated: number
    atomsSkipped: number
    atomsFailed: number
    triplesCreated: number
    triplesSkipped: number
    triplesFailed: number
  }
  txHashes: string[]
  errors: Array<{ id: string; error: string }>
}

export type PublishRunActionRequest =
  | PublishRunInitRequest
  | PublishRunChunkRequest
  | PublishRunFinalizeRequest

export interface PublishRunResponse {
  runId: string
  status: RunStatus
}

// ── API: GET /api/intuition/my-runs ──────────────────────────────────────────

export interface MyRunSummary {
  runId: string
  tokenId: string
  tokenName: string
  tokenTicker: string
  walletAddress: string
  chainId: number
  status: RunStatus
  atomsCreated: number
  atomsSkipped: number
  atomsFailed: number
  triplesCreated: number
  triplesSkipped: number
  triplesFailed: number
  txHashCount: number
  startedAt: string
  completedAt: string | null
}

export interface MyRunsResponse {
  runs: MyRunSummary[]
  total: number
  page: number
  pageSize: number
  /** Aggregates across ALL runs for this wallet (not just current page). */
  aggregates: {
    distinctTokens: number
    totalAtomsCreated: number
    totalTriplesCreated: number
    totalRuns: number
    runsByStatus: Record<RunStatus, number>
  }
}

// ── API: GET /api/intuition/runs/[runId] ─────────────────────────────────────

export interface RunAtomMappingRow {
  atomId: string
  atomType: string
  normalizedData: string
  termId: string | null
  txHash: string | null
  status: PublishStatus
  errorMessage: string | null
}

export interface RunClaimMappingRow {
  tripleId: string
  claimGroup: string | null
  originRowId: string | null
  subjectTermId: string
  predicateTermId: string
  objectTermId: string
  tripleTermId: string | null
  txHash: string | null
  status: PublishStatus
  errorMessage: string | null
}

export interface RunProvenanceMappingRow {
  tripleId: string
  sourceAtomId: string
  relation?: 'based_on' | 'includes_claim'
  predicateTermId?: string | null
  provenanceTripleTermId: string | null
  txHash: string | null
  status: PublishStatus
  errorMessage: string | null
}

export interface RunDetailMeta {
  runId: string
  tokenId: string
  tokenName: string
  tokenTicker: string
  walletAddress: string
  chainId: number
  status: RunStatus
  startedAt: string
  completedAt: string | null
  /** True if the run was created before the `run_id` column existed and was resolved via tx_hash fallback. */
  isLegacy: boolean
  /** Where the run detail mappings were loaded from. */
  snapshotSource: 'intuition_graphql' | 'legacy_run_id' | 'legacy_window' | 'empty'
}

export interface RunDetailResponse {
  run: RunDetailMeta
  atomMappings: RunAtomMappingRow[]
  claimMappings: RunClaimMappingRow[]
  provenanceMappings: RunProvenanceMappingRow[]
  /** Canonical atoms joined from kg_atoms_v1 for label resolution (only atoms present in atomMappings). */
  canonicalAtoms: Array<{
    atom_id: string
    atom_type: string
    label: string
    token_id: string | null
    metadata: Record<string, unknown>
  }>
  /** Canonical triples joined from kg_triples_v1 for predicate/subject/object resolution. */
  canonicalTriples: Array<{
    triple_id: string
    subject_id: string
    predicate: string
    object_id: string | null
    object_literal: string | null
    token_id: string
    claim_group: string | null
    origin_table: string | null
    origin_row_id: string | null
  }>
}

// ── API: GET /api/intuition/status ───────────────────────────────────────────

export interface PublishStatusResponse {
  runs: Array<{
    id: string
    tokenId: string
    walletAddress: string
    status: RunStatus
    atomsCreated: number
    triplesCreated: number
    startedAt: string
    completedAt: string | null
  }>
  atomMappings: Array<{
    atomId: string
    atomType: string
    termId: string | null
    status: string
  }>
  claimMappings: Array<{
    tripleId: string
    claimGroup: string | null
    tripleTermId: string | null
    status: string
  }>
}
