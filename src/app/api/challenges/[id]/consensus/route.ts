import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkChallengeRateLimit } from '@/lib/challenges/rate-limiter'
import { resolveChallengeTriple } from '@/lib/intuition/claim-triple'
import { fetchConsensusSnapshot } from '@/lib/intuition/consensus'

export async function GET(
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

  const { allowed, retryAfterMs } = checkChallengeRateLimit(`${user.id}:${id}`)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfterMs },
      { status: 429 },
    )
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

    const snapshot = await fetchConsensusSnapshot(resolved)

    return NextResponse.json(snapshot)
  } catch (error) {
    console.error('Failed to fetch challenge consensus:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch challenge consensus',
      },
      { status: 502 },
    )
  }
}
