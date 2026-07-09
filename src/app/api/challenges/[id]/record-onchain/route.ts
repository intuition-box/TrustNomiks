/**
 * POST /api/challenges/[id]/record-onchain (milestone J3 hardening, finding
 * #2/#10)
 *
 * Persists on-chain references (tx hash, target/counter term ids, curve id,
 * declared stake) on a challenge row after the caller has broadcast a stake,
 * add-stake, or withdraw transaction against the Resolve Box market.
 *
 * The client used to call `record_challenge_onchain_tx` directly with
 * client-supplied term ids — poisonable, since nothing validated them
 * against the actual published claim. Now the target/counter term ids and
 * curve id are always resolved/read server-side (never trusted from the
 * request body), and the RPC itself is service-role only (revoked from
 * `authenticated`), with the trusted user id passed explicitly as the actor
 * since service-role has no auth.uid().
 */

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { resolveChallengeTriple } from '@/lib/intuition/claim-triple'
import { INTUITION_CHAIN, MULTIVAULT_ADDRESS } from '@/lib/intuition/config'

const CURVE_CONFIG_ABI = parseAbi([
  'function getBondingCurveConfig() view returns ((address registry, uint256 defaultCurveId))',
])

/**
 * Defensively extract `defaultCurveId` from the raw `readContract` result,
 * mirroring consensus.ts's / evaluate-threshold's equivalent helper.
 */
function defaultCurveIdFromResult(result: unknown): bigint {
  if (
    typeof result === 'object' &&
    result !== null &&
    'defaultCurveId' in result
  ) {
    return (result as { defaultCurveId: bigint }).defaultCurveId
  }
  if (Array.isArray(result) && typeof result[1] === 'bigint') {
    return result[1]
  }
  throw new Error('Unable to read Intuition default bonding curve id')
}

const VALID_ACTIONS = new Set(['contest', 'add', 'withdraw'])

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { txHash, stakeWei, action } = body as {
    txHash?: unknown
    stakeWei?: unknown
    action?: unknown
  }

  if (typeof action !== 'string' || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  try {
    const { data: challenge, error: challengeError } = await supabase
      .from('challenges')
      .select('token_id, claim_type, claim_id, field_key')
      .eq('id', id)
      .maybeSingle()

    if (challengeError) {
      throw challengeError
    }
    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge not found' },
        { status: 404 },
      )
    }

    const resolved = await resolveChallengeTriple(supabase, {
      tokenId: challenge.token_id,
      claimType: challenge.claim_type,
      claimId: challenge.claim_id,
      fieldKey: challenge.field_key,
    })

    if (resolved === null) {
      return NextResponse.json(
        { error: 'claim is not published on-chain' },
        { status: 409 },
      )
    }

    const readClient = createPublicClient({
      chain: INTUITION_CHAIN,
      transport: http(),
    })

    const curveConfig = await readClient.readContract({
      address: MULTIVAULT_ADDRESS,
      abi: CURVE_CONFIG_ABI,
      functionName: 'getBondingCurveConfig',
    })
    const curveId = defaultCurveIdFromResult(curveConfig)

    // Service-role: the RPC is revoked from `authenticated`. The term ids and
    // curve id come from the server-side resolve/read above, never from the
    // request body.
    const svc = createServiceRoleClient()
    const { data: rpcData, error: rpcError } = await svc.rpc(
      'record_challenge_onchain_tx',
      {
        p_challenge_id: id,
        p_actor_id: user.id,
        p_tx_hash: typeof txHash === 'string' ? txHash : null,
        p_target_triple_term_id: resolved.tripleTermId,
        p_counter_term_id: resolved.counterTermId,
        p_curve_id: Number(curveId),
        p_stake_wei: typeof stakeWei === 'string' ? stakeWei : null,
        p_action: action,
      },
    )

    if (rpcError) {
      if (rpcError.message.includes('FORBIDDEN')) {
        return NextResponse.json({ error: rpcError.message }, { status: 403 })
      }
      if (rpcError.message.includes('CONFLICT')) {
        return NextResponse.json({ error: rpcError.message }, { status: 409 })
      }
      if (rpcError.message.includes('NOT_FOUND')) {
        return NextResponse.json({ error: rpcError.message }, { status: 404 })
      }
      throw rpcError
    }

    return NextResponse.json(rpcData ?? { ok: true })
  } catch (error) {
    console.error('Failed to record on-chain challenge action:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to record on-chain challenge action',
      },
      { status: 502 },
    )
  }
}
