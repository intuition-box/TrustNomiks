import { NextRequest, NextResponse } from 'next/server'
import { recoverMessageAddress } from 'viem'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { addressesMatch } from '@/features/wallet-linking/address'

interface ConfirmLinkRpcResult {
  wallet_address: string
  is_primary: boolean
  linked_at: string
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
    const { nonce, signature } = body

    if (!nonce || typeof nonce !== 'string') {
      return NextResponse.json({ error: 'Missing nonce' }, { status: 400 })
    }
    if (!signature || typeof signature !== 'string') {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    const { data: nonceRow, error: nonceErr } = await supabase
      .from('wallet_link_nonces')
      .select('wallet_address, message, expires_at, consumed_at')
      .eq('nonce', nonce)
      .maybeSingle()

    if (nonceErr) {
      console.error('Failed to load wallet link nonce:', nonceErr)
      return NextResponse.json(
        { error: 'Failed to verify wallet link' },
        { status: 500 },
      )
    }
    if (!nonceRow) {
      return NextResponse.json(
        { error: 'invalid or unknown nonce' },
        { status: 409 },
      )
    }
    if (nonceRow.consumed_at) {
      return NextResponse.json(
        { error: 'nonce already consumed' },
        { status: 409 },
      )
    }
    if (new Date(nonceRow.expires_at) < new Date()) {
      return NextResponse.json({ error: 'nonce expired' }, { status: 409 })
    }

    // Standalone signature recovery only (viem's recoverMessageAddress).
    // Smart-wallet signatures (ERC-1271/6492) are explicitly out of scope
    // for MVP — do not switch this to publicClient.verifyMessage.
    let recovered: string
    try {
      recovered = await recoverMessageAddress({
        message: nonceRow.message,
        signature: signature as `0x${string}`,
      })
    } catch {
      return NextResponse.json(
        { error: 'Failed to recover signer from signature' },
        { status: 400 },
      )
    }

    if (!addressesMatch(recovered, nonceRow.wallet_address)) {
      return NextResponse.json(
        { error: 'Signature does not match the wallet address' },
        { status: 403 },
      )
    }

    // The RPC does the authoritative re-check (ownership, expiry, consumption)
    // under the DB transaction; the checks above are a fast, early reject.
    // Runs on the service-role client (revoked from `authenticated`) with the
    // trusted user id from the server-verified session, since service-role
    // has no auth.uid() of its own.
    const svc = createServiceRoleClient()
    const { data, error } = await svc.rpc('confirm_wallet_link_tx', {
      p_nonce: nonce,
      p_user_id: user.id,
      p_recovered_wallet: recovered,
    })

    if (error) {
      if (error.message.includes('CONFLICT')) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (error.message.includes('FORBIDDEN')) {
        return NextResponse.json({ error: error.message }, { status: 403 })
      }
      console.error('confirm_wallet_link_tx failed:', error)
      return NextResponse.json(
        { error: 'Failed to confirm wallet link' },
        { status: 500 },
      )
    }

    const result = data as ConfirmLinkRpcResult
    return NextResponse.json({
      walletAddress: result.wallet_address,
      isPrimary: result.is_primary,
      linkedAt: result.linked_at,
    })
  } catch (err) {
    console.error('Wallet link verify error:', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to confirm wallet link',
      },
      { status: 500 },
    )
  }
}
