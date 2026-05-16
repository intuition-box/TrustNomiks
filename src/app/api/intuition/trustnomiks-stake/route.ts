import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  fetchTrustNomiksStakeByWallet,
  isWalletAddress,
} from '@/lib/intuition/graphql-client'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const wallet = request.nextUrl.searchParams.get('wallet')
  if (!isWalletAddress(wallet)) {
    return NextResponse.json(
      { error: 'Valid wallet address is required (0x-prefixed, 40 hex chars)' },
      { status: 400 },
    )
  }

  try {
    return NextResponse.json(await fetchTrustNomiksStakeByWallet(wallet))
  } catch (error) {
    console.error('Failed to fetch TrustNomiks stake:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch TrustNomiks stake',
      },
      { status: 502 },
    )
  }
}
