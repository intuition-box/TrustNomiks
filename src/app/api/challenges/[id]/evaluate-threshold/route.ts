/**
 * POST /api/challenges/[id]/evaluate-threshold (milestone J4)
 *
 * Does a fresh on-chain read of a dispute's community counter-stake, decides
 * whether it clears the anti-sybil auto-threshold (src/lib/challenges/
 * threshold.ts), and drives the auto-adopt state machine via the
 * `evaluate_stake_threshold_tx` RPC (supabase/migrations/
 * 20260710_add_evaluate_stake_threshold_tx.sql). That RPC enforces its own
 * freshness bound on the verified snapshot this route passes in, so a stale
 * read here can never silently drive a state transition.
 *
 * Reads are intentionally NOT the `@0xintuition/protocol` wrappers: their
 * `ReadConfig` needs a full viem `PublicClient`, so this mirrors
 * src/lib/intuition/consensus.ts's local `parseAbi` subset instead.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbi } from 'viem'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { checkChallengeRateLimit } from '@/lib/challenges/rate-limiter'
import { resolveChallengeTriple } from '@/lib/intuition/claim-triple'
import { gatherDisputeAccounts } from '@/lib/intuition/consensus'
import { evaluateAutoThreshold } from '@/lib/challenges/threshold'
import { INTUITION_CHAIN, MULTIVAULT_ADDRESS } from '@/lib/intuition/config'

const THRESHOLD_READ_ABI = parseAbi([
  'function getTripleCost() view returns (uint256)',
  'function getBondingCurveConfig() view returns ((address registry, uint256 defaultCurveId))',
])

/**
 * Defensively extract `defaultCurveId` from the raw `readContract` result,
 * mirroring fetchConsensusSnapshot's equivalent helper in consensus.ts.
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

interface ThresholdVerdictRpcResult {
  status: string
  veto_until?: string | null
  eligible_from?: string | null
}

const EMPTY_VERDICT = {
  met: false,
  totalStakeWei: '0',
  distinctAccounts: 0,
} as const

export async function POST(
  _request: NextRequest,
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

  const { allowed, retryAfterMs } = checkChallengeRateLimit(
    `eval:${user.id}:${id}`,
  )
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfterMs },
      { status: 429 },
    )
  }

  try {
    const { data: challenge, error: challengeError } = await supabase
      .from('challenges')
      .select('token_id, claim_type, claim_id, field_key, challenge_type')
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

    if (challenge.challenge_type !== 'dispute') {
      return NextResponse.json({ status: 'not_a_dispute', ...EMPTY_VERDICT })
    }

    const resolved = await resolveChallengeTriple(supabase, {
      tokenId: challenge.token_id,
      claimType: challenge.claim_type,
      claimId: challenge.claim_id,
      fieldKey: challenge.field_key,
    })

    if (resolved === null) {
      return NextResponse.json({ status: 'not_published', ...EMPTY_VERDICT })
    }

    const readClient = createPublicClient({
      chain: INTUITION_CHAIN,
      transport: http(),
    })

    const [curveConfig, tripleCostWei] = await Promise.all([
      readClient.readContract({
        address: MULTIVAULT_ADDRESS,
        abi: THRESHOLD_READ_ABI,
        functionName: 'getBondingCurveConfig',
      }),
      readClient.readContract({
        address: MULTIVAULT_ADDRESS,
        abi: THRESHOLD_READ_ABI,
        functionName: 'getTripleCost',
      }),
    ])
    const curveId = defaultCurveIdFromResult(curveConfig)

    // Excluded accounts: the token owner, plus (best-effort) the wallet that
    // most recently published this token, resolved to its linked user.
    const excludedUserIds: string[] = []

    const { data: tokenRow } = await supabase
      .from('tokens')
      .select('created_by')
      .eq('id', challenge.token_id)
      .maybeSingle()

    if (tokenRow?.created_by) {
      excludedUserIds.push(tokenRow.created_by)
    }

    try {
      const { data: publishRun } = await supabase
        .from('intuition_publish_runs')
        .select('wallet_address')
        .eq('token_id', challenge.token_id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (publishRun?.wallet_address) {
        const { data: walletLink } = await supabase
          .from('wallet_links')
          .select('user_id')
          .eq('wallet_address', publishRun.wallet_address.toLowerCase())
          .is('unlinked_at', null)
          .maybeSingle()

        if (walletLink?.user_id) {
          excludedUserIds.push(walletLink.user_id)
        }
      }
    } catch (error) {
      console.warn(
        'evaluate-threshold: publisher exclusion lookup failed, continuing without it',
        error instanceof Error ? error.message : error,
      )
    }

    const dedupedExcludedUserIds = Array.from(new Set(excludedUserIds))

    const accounts = await gatherDisputeAccounts(
      supabase,
      {
        challengeId: id,
        counterTermId: resolved.counterTermId,
        curveId,
        excludedUserIds: dedupedExcludedUserIds,
        nowMs: Date.now(),
      },
      readClient,
    )

    const result = evaluateAutoThreshold(accounts, tripleCostWei)

    // Service-role: this RPC is revoked from `authenticated` since it drives
    // the auto-adopt state machine from a server-verified on-chain read, not
    // anything the caller supplies. Signature is unchanged (no actor param
    // needed — it never reads auth.uid()).
    const svc = createServiceRoleClient()
    const { data: rpcData, error: rpcError } = await svc.rpc(
      'evaluate_stake_threshold_tx',
      {
        p_challenge_id: id,
        p_threshold_met: result.met,
        p_verified_stake_wei: result.totalStakeWei.toString(),
        p_verified_accounts: result.distinctAccounts,
        p_verified_at: new Date().toISOString(),
      },
    )

    if (rpcError) {
      if (rpcError.message.includes('CONFLICT')) {
        return NextResponse.json({ error: rpcError.message }, { status: 409 })
      }
      if (rpcError.message.includes('NOT_FOUND')) {
        return NextResponse.json({ error: rpcError.message }, { status: 404 })
      }
      throw rpcError
    }

    const verdict = rpcData as ThresholdVerdictRpcResult

    return NextResponse.json({
      status: verdict.status,
      vetoUntil: verdict.veto_until ?? null,
      eligibleFrom: verdict.eligible_from ?? null,
      met: result.met,
      totalStakeWei: result.totalStakeWei.toString(),
      distinctAccounts: result.distinctAccounts,
    })
  } catch (error) {
    console.error('Failed to evaluate challenge threshold:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to evaluate challenge threshold',
      },
      { status: 502 },
    )
  }
}
