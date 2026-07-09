import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeWalletAddress } from '@/lib/intuition/utils'

interface RequestNonceRpcResult {
  nonce: string
  message: string
  expires_at: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { walletAddress } = body

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json(
        { error: 'Missing walletAddress' },
        { status: 400 },
      )
    }

    let normalized: string
    try {
      normalized = normalizeWalletAddress(walletAddress)
    } catch {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 },
      )
    }

    const { data, error } = await supabase.rpc('request_wallet_link_nonce_tx', {
      p_wallet_address: normalized,
    })

    if (error) {
      if (error.message.includes('CONFLICT')) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (error.message.includes('FORBIDDEN')) {
        return NextResponse.json({ error: error.message }, { status: 403 })
      }
      console.error('request_wallet_link_nonce_tx failed:', error)
      return NextResponse.json(
        { error: 'Failed to request wallet link nonce' },
        { status: 500 },
      )
    }

    const result = data as RequestNonceRpcResult
    return NextResponse.json({
      nonce: result.nonce,
      message: result.message,
      expiresAt: result.expires_at,
    })
  } catch (err) {
    console.error('Wallet link nonce error:', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to request wallet link nonce',
      },
      { status: 500 },
    )
  }
}
