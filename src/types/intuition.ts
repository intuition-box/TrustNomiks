import type { PublishPlan, PublishRunResult, RunStatus } from '@/lib/intuition/types'

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
