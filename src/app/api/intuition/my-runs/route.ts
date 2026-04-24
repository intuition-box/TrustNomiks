import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { MyRunSummary, MyRunsResponse } from '@/types/intuition'
import type { RunStatus } from '@/lib/intuition/types'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/

interface PublishRunRow {
  id: string
  token_id: string
  wallet_address: string
  chain_id: number
  status: RunStatus
  atoms_created: number
  atoms_skipped: number
  atoms_failed: number
  triples_created: number
  triples_skipped: number
  triples_failed: number
  tx_hashes: unknown
  started_at: string
  completed_at: string | null
  tokens: { name: string; ticker: string } | { name: string; ticker: string }[] | null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const wallet = params.get('wallet')
  const pageRaw = params.get('page')
  const pageSizeRaw = params.get('pageSize')

  if (!wallet || !WALLET_REGEX.test(wallet)) {
    return NextResponse.json(
      { error: 'Valid wallet address is required (0x-prefixed, 40 hex chars)' },
      { status: 400 },
    )
  }

  const page = Math.max(1, parseInt(pageRaw ?? '1', 10) || 1)
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(pageSizeRaw ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
  )
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  // Case-insensitive wallet match — EIP-55 checksum addresses may have been
  // stored with any casing depending on what the wallet client sent.
  const { data, error, count } = await supabase
    .from('intuition_publish_runs')
    .select(
      `
        id,
        token_id,
        wallet_address,
        chain_id,
        status,
        atoms_created,
        atoms_skipped,
        atoms_failed,
        triples_created,
        triples_skipped,
        triples_failed,
        tx_hashes,
        started_at,
        completed_at,
        tokens ( name, ticker )
      `,
      { count: 'exact' },
    )
    .ilike('wallet_address', wallet)
    .order('started_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('Failed to fetch publish runs:', error)
    return NextResponse.json({ error: 'Failed to fetch publish runs' }, { status: 500 })
  }

  const rows = (data ?? []) as PublishRunRow[]

  const runs: MyRunSummary[] = rows.map((row) => {
    const tokenRel = Array.isArray(row.tokens) ? row.tokens[0] : row.tokens
    const txHashes = Array.isArray(row.tx_hashes) ? row.tx_hashes : []

    return {
      runId: row.id,
      tokenId: row.token_id,
      tokenName: tokenRel?.name ?? '(unknown)',
      tokenTicker: tokenRel?.ticker ?? '',
      walletAddress: row.wallet_address,
      chainId: row.chain_id,
      status: row.status,
      atomsCreated: row.atoms_created,
      atomsSkipped: row.atoms_skipped,
      atomsFailed: row.atoms_failed,
      triplesCreated: row.triples_created,
      triplesSkipped: row.triples_skipped,
      triplesFailed: row.triples_failed,
      txHashCount: txHashes.length,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }
  })

  // Aggregates across ALL runs of this wallet (separate light query, no pagination)
  const { data: aggRows, error: aggErr } = await supabase
    .from('intuition_publish_runs')
    .select('token_id, status, atoms_created, triples_created')
    .ilike('wallet_address', wallet)

  if (aggErr) {
    console.error('Failed to aggregate publish runs:', aggErr)
    return NextResponse.json({ error: 'Failed to aggregate publish runs' }, { status: 500 })
  }

  const aggregates = computeAggregates(
    (aggRows ?? []) as Array<{
      token_id: string
      status: RunStatus
      atoms_created: number
      triples_created: number
    }>,
  )

  const response: MyRunsResponse = {
    runs,
    total: count ?? 0,
    page,
    pageSize,
    aggregates,
  }

  return NextResponse.json(response)
}

function computeAggregates(
  rows: Array<{ token_id: string; status: RunStatus; atoms_created: number; triples_created: number }>,
): MyRunsResponse['aggregates'] {
  const distinctTokens = new Set<string>()
  let totalAtomsCreated = 0
  let totalTriplesCreated = 0
  const runsByStatus: Record<RunStatus, number> = {
    pending: 0,
    running: 0,
    completed: 0,
    partial: 0,
    failed: 0,
  }

  for (const row of rows) {
    distinctTokens.add(row.token_id)
    totalAtomsCreated += row.atoms_created ?? 0
    totalTriplesCreated += row.triples_created ?? 0
    runsByStatus[row.status] = (runsByStatus[row.status] ?? 0) + 1
  }

  return {
    distinctTokens: distinctTokens.size,
    totalAtomsCreated,
    totalTriplesCreated,
    totalRuns: rows.length,
    runsByStatus,
  }
}
