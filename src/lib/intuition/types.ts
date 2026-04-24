import type { Hex } from 'viem'

// ── Publish statuses ────────────────────────────────────────────────────────

export type PublishStatus = 'pending' | 'submitted' | 'confirmed' | 'failed'
export type RunStatus = 'pending' | 'running' | 'completed' | 'partial' | 'failed'

// ── Atom plan item ──────────────────────────────────────────────────────────

export interface AtomPlanItem {
  /** Local ID from kg_atoms_v1 or synthetic (e.g. "atom:predicate:has_name") */
  atomId: string
  /** e.g. "token", "allocation", "predicate", "literal", "category" */
  atomType: string
  /** Normalized string to be published on-chain */
  normalizedData: string
  /** Pre-computed term_id (Keccak256) */
  computedTermId: Hex
  /** Whether this atom already exists on-chain */
  exists: boolean
}

// ── Triple plan item ────────────────────────────────────────────────────────

export interface TriplePlanItem {
  /** Local ID from kg_triples_v1 */
  tripleId: string
  claimGroup: string | null
  originRowId: string | null
  subjectAtomId: string
  predicateAtomId: string
  objectAtomId: string
  /** Pre-computed term_ids after atom resolution */
  subjectTermId: Hex
  predicateTermId: Hex
  objectTermId: Hex
  /** Pre-computed triple term_id */
  computedTripleTermId: Hex
  /** Whether this triple already exists on-chain */
  exists: boolean
}

// ── Provenance plan item ────────────────────────────────────────────────────

export interface ProvenancePlanItem {
  /** The claim triple this provenance links to */
  claimTripleId: string
  claimTripleTermId: Hex
  /** The source atom this provenance links to */
  sourceAtomId: string
  sourceTermId: Hex
  /** The predicate for provenance ("based_on") */
  predicateTermId: Hex
  /** Pre-computed provenance triple term_id */
  computedTripleTermId: Hex
  exists: boolean
}

// ── Batch info (chunk sizes + estimated wallet signatures) ──────────────────

export interface BatchInfo {
  atomChunkSize: number
  tripleChunkSize: number
  provenanceChunkSize: number
  atomChunks: number
  tripleChunks: number
  provenanceChunks: number
  estimatedWalletSignatures: number
}

// ── Publish plan (returned by publish-plan API) ─────────────────────────────

export interface PublishPlan {
  tokenId: string
  tokenName: string
  tokenTicker: string
  atoms: {
    toCreate: AtomPlanItem[]
    existing: AtomPlanItem[]
  }
  triples: {
    toCreate: TriplePlanItem[]
    existing: TriplePlanItem[]
  }
  provenance: {
    toCreate: ProvenancePlanItem[]
    existing: ProvenancePlanItem[]
  }
  estimatedCost: {
    atomCostPerUnit: bigint
    tripleCostPerUnit: bigint
    totalAtomsCost: bigint
    totalTriplesCost: bigint
    totalProvenanceCost: bigint
    totalCost: bigint
  }
  summary: {
    atomsToCreate: number
    atomsExisting: number
    triplesToCreate: number
    triplesExisting: number
    provenanceToCreate: number
    provenanceExisting: number
  }
  batchInfo: BatchInfo
}

// ── Publish events (streamed by executor) ───────────────────────────────────

export type PublishEventType =
  | 'phase_start'
  | 'phase_end'
  | 'chunk_pending'
  | 'chunk_success'
  | 'chunk_failed'
  | 'abort'
  | 'complete'

export interface ChunkMappings {
  atomMappings?: PublishRunResult['atomMappings']
  claimMappings?: PublishRunResult['claimMappings']
  provenanceMappings?: PublishRunResult['provenanceMappings']
}

export interface PublishEvent {
  type: PublishEventType
  phase?: 'atoms' | 'triples' | 'provenance'
  chunkIndex?: number
  totalChunks?: number
  txHash?: string
  error?: string
  progress?: {
    currentChunk: number
    totalChunks: number
    itemsProcessed: number
    totalItems: number
  }
  /** Mapping data for incremental persistence (present in chunk_success/chunk_failed) */
  chunkMappings?: ChunkMappings
}

// ── Publish run result (persisted to Supabase) ──────────────────────────────

export interface PublishRunResult {
  tokenId: string
  walletAddress: string
  chainId: number
  atomMappings: Array<{
    atomId: string
    atomType: string
    normalizedData: string
    termId: string
    txHash: string
    status: PublishStatus
    errorMessage?: string
  }>
  claimMappings: Array<{
    tripleId: string
    claimGroup: string | null
    originRowId: string | null
    subjectTermId: string
    predicateTermId: string
    objectTermId: string
    tripleTermId: string
    txHash: string
    status: PublishStatus
    errorMessage?: string
  }>
  provenanceMappings: Array<{
    tripleId: string
    sourceAtomId: string
    provenanceTripleTermId: string
    txHash: string
    status: PublishStatus
    errorMessage?: string
  }>
  txHashes: string[]
  errors: Array<{ id: string; error: string }>
  atomsCreated: number
  atomsSkipped: number
  atomsFailed: number
  triplesCreated: number
  triplesSkipped: number
  triplesFailed: number
}
