/**
 * POST /api/challenges/[id]/record-supersession (milestone J5 hardening,
 * finding #3)
 *
 * Persists the new claim's term id and the supersedes-triple link on a
 * challenge row after an accepted UPDATE challenge has been published
 * on-chain (`executeOpenUpdate` broadcasting the replacement triple +
 * dispute against the old one).
 *
 * The client used to call `record_challenge_supersession_tx` directly with a
 * client-computed new claim term id — poisonable. Now the new claim term id
 * is always RECOMPUTED server-side from the challenge's own
 * `proposed_value` and the resolved subject/predicate term ids (never
 * trusted from the request body), and the RPC itself is service-role only
 * (revoked from `authenticated`), with the trusted user id passed explicitly
 * as the actor since service-role has no auth.uid().
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { resolveChallengeTripleFull } from '@/lib/intuition/claim-triple'
import {
  computeAtomTermId,
  computeTripleTermId,
} from '@/lib/intuition/tx-helpers'
import { normalizeLiteral } from '@/lib/intuition/atom-normalizer'

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
  const { txHashes } = body as { txHashes?: unknown }

  try {
    const { data: challenge, error: challengeError } = await supabase
      .from('challenges')
      .select(
        'token_id, claim_type, claim_id, field_key, proposed_value, challenge_type',
      )
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

    if (challenge.challenge_type !== 'update') {
      return NextResponse.json(
        { error: 'Only an update challenge can be superseded on-chain' },
        { status: 409 },
      )
    }

    const resolved = await resolveChallengeTripleFull(supabase, {
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

    // Recompute the new claim term id server-side — never trust the client
    // for this. Same subject + predicate as the old claim, new object atom
    // derived from the challenge's own recorded proposed_value.
    const objNorm = normalizeLiteral(String(challenge.proposed_value))
    const newObjectTermId = computeAtomTermId(objNorm)
    const newClaimTermId = computeTripleTermId(
      resolved.subjectTermId,
      resolved.predicateTermId,
      newObjectTermId,
    )

    // Service-role: the RPC is revoked from `authenticated`. The new claim
    // term id is recomputed above, never taken from the request body.
    const svc = createServiceRoleClient()
    const { data: rpcData, error: rpcError } = await svc.rpc(
      'record_challenge_supersession_tx',
      {
        p_challenge_id: id,
        p_actor_id: user.id,
        p_new_claim_term_id: newClaimTermId,
        p_supersedes_triple_term_id: resolved.tripleTermId,
        p_tx_hashes: Array.isArray(txHashes) ? txHashes : [],
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
    console.error('Failed to record challenge supersession:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to record challenge supersession',
      },
      { status: 502 },
    )
  }
}
