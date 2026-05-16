import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  fetchAccountActivity,
  isWalletAddress,
  parsePositiveIntParam,
} from '@/lib/intuition/graphql-client'

const DEFAULT_POSITION_LIMIT = 25
const DEFAULT_CREATED_LIMIT = 25
const MAX_LIMIT = 100

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const wallet = params.get('wallet')
  if (!isWalletAddress(wallet)) {
    return NextResponse.json(
      { error: 'Valid wallet address is required (0x-prefixed, 40 hex chars)' },
      { status: 400 },
    )
  }

  const positionLimit = parsePositiveIntParam(
    params.get('limit'),
    DEFAULT_POSITION_LIMIT,
    MAX_LIMIT,
  )
  const createdLimit = parsePositiveIntParam(
    params.get('createdLimit'),
    DEFAULT_CREATED_LIMIT,
    MAX_LIMIT,
  )

  try {
    const activity = await fetchAccountActivity(wallet, {
      positionLimit,
      createdLimit,
    })
    return NextResponse.json(activity)
  } catch (error) {
    console.error('Failed to fetch Intuition account activity:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch Intuition account activity',
      },
      { status: 502 },
    )
  }
}
