import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildPublishBundle } from '@/lib/intuition/bundle-builder'
import { resolveExistence } from '@/lib/intuition/existence-resolver'
import { createPublicClient, http } from 'viem'
import { INTUITION_CHAIN } from '@/lib/intuition/config'
import type { PublishPlanSerialized } from '@/types/intuition'
import { normalizeWalletAddress } from '@/lib/intuition/utils'
import {
  buildChallengeMatchContext,
  isTripleChallenged,
  vestingAllocationIdsOf,
  type OpenChallengeRow,
} from '@/lib/claims/publish-challenge-guard'

export async function GET(request: NextRequest) {
  const tokenId = request.nextUrl.searchParams.get('tokenId')
  const walletParam = request.nextUrl.searchParams.get('wallet')

  if (!tokenId) {
    return NextResponse.json({ error: 'tokenId is required' }, { status: 400 })
  }
  if (!walletParam) {
    return NextResponse.json(
      { error: 'wallet is required for verifiable TrustNomiks exports' },
      { status: 400 },
    )
  }

  let walletAddress: string
  try {
    walletAddress = normalizeWalletAddress(walletParam)
  } catch {
    return NextResponse.json(
      { error: 'wallet must be a valid EVM address' },
      { status: 400 },
    )
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate token exists, is owned by the caller, and is eligible
    const { data: token, error: tokenErr } = await supabase
      .from('tokens')
      .select('id, status, created_by')
      .eq('id', tokenId)
      .single()

    if (tokenErr || !token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    if (token.created_by !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (token.status !== 'validated' && token.status !== 'in_review') {
      return NextResponse.json(
        { error: 'Token must be validated or in_review for publish planning' },
        { status: 400 },
      )
    }

    // Build the raw bundle from canonical views (pins entity Things via
    // Intuition's pinThing GraphQL mutation).
    const bundle = await buildPublishBundle(tokenId, supabase, {
      exportRunId: crypto.randomUUID(),
      walletAddress,
    })

    // Create a read-only public client for on-chain existence checks
    const publicClient = createPublicClient({
      chain: INTUITION_CHAIN,
      transport: http(),
    })

    // Resolve existence to produce the final plan
    let plan = await resolveExistence(bundle, publicClient)

    // ── Publish-under-challenge guard (plan §8) ───────────────────────────
    const includeChallenged =
      request.nextUrl.searchParams.get('includeChallenged') === 'true'

    const { data: openChallengesData, error: challengesErr } = await supabase
      .from('challenges')
      .select('claim_type, claim_id, field_key')
      .eq('token_id', tokenId)
      .eq('status', 'open')

    if (challengesErr) {
      throw challengesErr
    }
    const openChallenges = (openChallengesData ?? []) as OpenChallengeRow[]

    // Resolve vesting challenges (claim_id = allocation_id) to the vesting row
    // ids the plan's triples are keyed by (origin_row_id = vesting_schedules.id).
    const vestingAllocationIds = vestingAllocationIdsOf(openChallenges)
    let vestingRows: { id: string; allocation_id: string }[] = []
    if (vestingAllocationIds.length > 0) {
      const { data: vestRows, error: vestErr } = await supabase
        .from('vesting_schedules')
        .select('id, allocation_id')
        .in('allocation_id', vestingAllocationIds)
      if (vestErr) {
        throw vestErr
      }
      vestingRows = (vestRows ?? []).map((r) => ({
        id: String(r.id),
        allocation_id: String(r.allocation_id),
      }))
    }

    const ctx = buildChallengeMatchContext(openChallenges, vestingRows)

    const challengedTripleIds = new Set(
      plan.triples.toCreate
        .filter((t) => isTripleChallenged(t, ctx))
        .map((t) => t.tripleId),
    )

    const challengedClaims = openChallenges.map((c) => ({
      claim_type: c.claim_type,
      claim_id: c.claim_id,
      field_key: c.field_key,
    }))

    if (!includeChallenged && challengedTripleIds.size > 0) {
      const filteredTriplesToCreate = plan.triples.toCreate.filter(
        (t) => !challengedTripleIds.has(t.tripleId),
      )
      const filteredProvenanceToCreate = plan.provenance.toCreate.filter(
        (p) => !challengedTripleIds.has(p.claimTripleId),
      )
      const removedTriples =
        plan.triples.toCreate.length - filteredTriplesToCreate.length
      const removedProvenance =
        plan.provenance.toCreate.length - filteredProvenanceToCreate.length

      // Provenance items share the same per-unit cost as triples (see
      // resolveExistence's tripleUnit) — cheap to keep the estimate accurate.
      const tripleUnit =
        plan.estimatedCost.tripleCostPerUnit +
        plan.estimatedCost.extraDepositPerUnit
      const totalTriplesCost =
        plan.estimatedCost.totalTriplesCost -
        tripleUnit * BigInt(removedTriples)
      const totalProvenanceCost =
        plan.estimatedCost.totalProvenanceCost -
        tripleUnit * BigInt(removedProvenance)

      plan = {
        ...plan,
        triples: { ...plan.triples, toCreate: filteredTriplesToCreate },
        provenance: {
          ...plan.provenance,
          toCreate: filteredProvenanceToCreate,
        },
        summary: {
          ...plan.summary,
          triplesToCreate: filteredTriplesToCreate.length,
          provenanceToCreate: filteredProvenanceToCreate.length,
        },
        estimatedCost: {
          ...plan.estimatedCost,
          totalTriplesCost,
          totalProvenanceCost,
          totalCost:
            plan.estimatedCost.totalAtomsCost +
            totalTriplesCost +
            totalProvenanceCost,
        },
      }
    }

    // Serialize bigints to strings for JSON transport
    const serialized: PublishPlanSerialized = {
      ...plan,
      estimatedCost: {
        atomCostPerUnit: plan.estimatedCost.atomCostPerUnit.toString(),
        tripleCostPerUnit: plan.estimatedCost.tripleCostPerUnit.toString(),
        extraDepositPerUnit: plan.estimatedCost.extraDepositPerUnit.toString(),
        totalAtomsCost: plan.estimatedCost.totalAtomsCost.toString(),
        totalTriplesCost: plan.estimatedCost.totalTriplesCost.toString(),
        totalProvenanceCost: plan.estimatedCost.totalProvenanceCost.toString(),
        totalCost: plan.estimatedCost.totalCost.toString(),
      },
    }

    return NextResponse.json({
      plan: serialized,
      challenge: {
        hasOpenChallenges: challengedClaims.length > 0,
        challengedClaims,
        excludedTripleIds: includeChallenged
          ? []
          : Array.from(challengedTripleIds),
        includeChallenged,
      },
    })
  } catch (err) {
    console.error('Publish plan error:', err)
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Failed to generate publish plan',
      },
      { status: 500 },
    )
  }
}
