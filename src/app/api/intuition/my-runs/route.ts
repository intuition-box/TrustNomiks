import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchExportRunsByWallet } from '@/lib/intuition/graphql-client'
import type { MyRunsResponse } from '@/types/intuition'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/

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
  let verifiedRuns: Pick<MyRunsResponse, 'runs' | 'total' | 'aggregates'>
  try {
    verifiedRuns = await fetchExportRunsByWallet(wallet, { page, pageSize })
  } catch (error) {
    console.error('Failed to fetch verified Intuition export runs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch verified Intuition export runs' },
      { status: 502 },
    )
  }

  const response: MyRunsResponse = {
    runs: verifiedRuns.runs,
    total: verifiedRuns.total,
    page,
    pageSize,
    aggregates: verifiedRuns.aggregates,
  }

  return NextResponse.json(response)
}
