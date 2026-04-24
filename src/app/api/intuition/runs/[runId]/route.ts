import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type {
  RunDetailResponse,
  RunAtomMappingRow,
  RunClaimMappingRow,
  RunProvenanceMappingRow,
} from '@/types/intuition'
import type { PublishStatus, RunStatus } from '@/lib/intuition/types'

interface PublishRunRow {
  id: string
  token_id: string
  wallet_address: string
  chain_id: number
  status: RunStatus
  started_at: string
  completed_at: string | null
  tx_hashes: unknown
  created_by: string
  tokens: { name: string; ticker: string } | { name: string; ticker: string }[] | null
}

interface AtomMappingDbRow {
  atom_id: string
  atom_type: string
  normalized_data: string
  term_id: string | null
  tx_hash: string | null
  status: PublishStatus
  error_message: string | null
}

interface ClaimMappingDbRow {
  triple_id: string
  claim_group: string | null
  origin_row_id: string | null
  subject_term_id: string
  predicate_term_id: string
  object_term_id: string
  triple_term_id: string | null
  tx_hash: string | null
  status: PublishStatus
  error_message: string | null
}

interface ProvMappingDbRow {
  triple_id: string
  source_atom_id: string
  provenance_triple_term_id: string | null
  tx_hash: string | null
  status: PublishStatus
  error_message: string | null
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params
  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 1. Load the run ───────────────────────────────────────────────────────

  const { data: runRaw, error: runErr } = await supabase
    .from('intuition_publish_runs')
    .select(`
      id, token_id, wallet_address, chain_id, status, started_at, completed_at, tx_hashes, created_by,
      tokens ( name, ticker )
    `)
    .eq('id', runId)
    .single()

  if (runErr || !runRaw) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  const run = runRaw as PublishRunRow
  const tokenRel = Array.isArray(run.tokens) ? run.tokens[0] : run.tokens

  // ── 2. Load mappings — try run_id first, fallback to tx_hash for legacy runs ─

  const runIdAttempt = await loadMappingsByRunId(supabase, runId)
  let atomRows = runIdAttempt.atomRows
  let claimRows = runIdAttempt.claimRows
  let provRows = runIdAttempt.provRows
  let isLegacy = false

  const hasAnyRunIdMapping =
    atomRows.length > 0 || claimRows.length > 0 || provRows.length > 0

  if (!hasAnyRunIdMapping) {
    // Legacy fallback: pre-migration runs have no run_id on their mapping rows.
    // We identify them by:
    //   - created_by (same user who owns the run)
    //   - chain_id
    //   - created_at within the run's time window
    // This is broader than tx_hash matching because failed rows have empty tx_hash
    // (see publish-executor.ts error paths) — so tx_hash matching would drop them.
    const legacy = await loadMappingsByRunWindow(supabase, {
      createdBy: run.created_by,
      chainId: run.chain_id,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    })
    atomRows = legacy.atomRows
    claimRows = legacy.claimRows
    provRows = legacy.provRows
    isLegacy = atomRows.length > 0 || claimRows.length > 0 || provRows.length > 0
  }

  // ── 3. Canonical lookups for labels ───────────────────────────────────────

  const atomIds = atomRows.map((r) => r.atom_id)
  const tripleIds = claimRows.map((r) => r.triple_id)

  const [canonicalAtomsResult, canonicalTriplesResult] = await Promise.all([
    atomIds.length > 0
      ? supabase.from('kg_atoms_v1').select('*').in('atom_id', atomIds)
      : Promise.resolve({ data: [], error: null }),
    tripleIds.length > 0
      ? supabase.from('kg_triples_v1').select('*').in('triple_id', tripleIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (canonicalAtomsResult.error) {
    console.error('canonical atoms fetch failed:', canonicalAtomsResult.error)
    return NextResponse.json({ error: 'Failed to load canonical atoms' }, { status: 500 })
  }
  if (canonicalTriplesResult.error) {
    console.error('canonical triples fetch failed:', canonicalTriplesResult.error)
    return NextResponse.json({ error: 'Failed to load canonical triples' }, { status: 500 })
  }

  // ── 4. Shape response ─────────────────────────────────────────────────────

  const response: RunDetailResponse = {
    run: {
      runId: run.id,
      tokenId: run.token_id,
      tokenName: tokenRel?.name ?? '(unknown)',
      tokenTicker: tokenRel?.ticker ?? '',
      walletAddress: run.wallet_address,
      chainId: run.chain_id,
      status: run.status,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      isLegacy,
    },
    atomMappings: atomRows.map(mapAtomRow),
    claimMappings: claimRows.map(mapClaimRow),
    provenanceMappings: provRows.map(mapProvRow),
    canonicalAtoms: (canonicalAtomsResult.data ?? []) as RunDetailResponse['canonicalAtoms'],
    canonicalTriples: (canonicalTriplesResult.data ?? []) as RunDetailResponse['canonicalTriples'],
  }

  return NextResponse.json(response)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function loadMappingsByRunId(supabase: SupabaseClient, runId: string) {
  const [atoms, claims, provs] = await Promise.all([
    supabase
      .from('intuition_atom_mappings')
      .select('atom_id, atom_type, normalized_data, term_id, tx_hash, status, error_message')
      .eq('run_id', runId),
    supabase
      .from('intuition_claim_mappings')
      .select(
        'triple_id, claim_group, origin_row_id, subject_term_id, predicate_term_id, object_term_id, triple_term_id, tx_hash, status, error_message',
      )
      .eq('run_id', runId),
    supabase
      .from('intuition_provenance_mappings')
      .select('triple_id, source_atom_id, provenance_triple_term_id, tx_hash, status, error_message')
      .eq('run_id', runId),
  ])

  return {
    atomRows: ((atoms.data as AtomMappingDbRow[] | null) ?? []),
    claimRows: ((claims.data as ClaimMappingDbRow[] | null) ?? []),
    provRows: ((provs.data as ProvMappingDbRow[] | null) ?? []),
  }
}

async function loadMappingsByRunWindow(
  supabase: SupabaseClient,
  params: {
    createdBy: string
    chainId: number
    startedAt: string
    completedAt: string | null
  },
) {
  const upperBound = params.completedAt ?? new Date().toISOString()

  const [atoms, claims, provs] = await Promise.all([
    supabase
      .from('intuition_atom_mappings')
      .select('atom_id, atom_type, normalized_data, term_id, tx_hash, status, error_message')
      .eq('chain_id', params.chainId)
      .eq('created_by', params.createdBy)
      .gte('created_at', params.startedAt)
      .lte('created_at', upperBound),
    supabase
      .from('intuition_claim_mappings')
      .select(
        'triple_id, claim_group, origin_row_id, subject_term_id, predicate_term_id, object_term_id, triple_term_id, tx_hash, status, error_message',
      )
      .eq('chain_id', params.chainId)
      .eq('created_by', params.createdBy)
      .gte('created_at', params.startedAt)
      .lte('created_at', upperBound),
    supabase
      .from('intuition_provenance_mappings')
      .select('triple_id, source_atom_id, provenance_triple_term_id, tx_hash, status, error_message')
      .eq('chain_id', params.chainId)
      .eq('created_by', params.createdBy)
      .gte('created_at', params.startedAt)
      .lte('created_at', upperBound),
  ])

  return {
    atomRows: ((atoms.data as AtomMappingDbRow[] | null) ?? []),
    claimRows: ((claims.data as ClaimMappingDbRow[] | null) ?? []),
    provRows: ((provs.data as ProvMappingDbRow[] | null) ?? []),
  }
}

function mapAtomRow(r: AtomMappingDbRow): RunAtomMappingRow {
  return {
    atomId: r.atom_id,
    atomType: r.atom_type,
    normalizedData: r.normalized_data,
    termId: r.term_id,
    txHash: r.tx_hash,
    status: r.status,
    errorMessage: r.error_message,
  }
}

function mapClaimRow(r: ClaimMappingDbRow): RunClaimMappingRow {
  return {
    tripleId: r.triple_id,
    claimGroup: r.claim_group,
    originRowId: r.origin_row_id,
    subjectTermId: r.subject_term_id,
    predicateTermId: r.predicate_term_id,
    objectTermId: r.object_term_id,
    tripleTermId: r.triple_term_id,
    txHash: r.tx_hash,
    status: r.status,
    errorMessage: r.error_message,
  }
}

function mapProvRow(r: ProvMappingDbRow): RunProvenanceMappingRow {
  return {
    tripleId: r.triple_id,
    sourceAtomId: r.source_atom_id,
    provenanceTripleTermId: r.provenance_triple_term_id,
    txHash: r.tx_hash,
    status: r.status,
    errorMessage: r.error_message,
  }
}
