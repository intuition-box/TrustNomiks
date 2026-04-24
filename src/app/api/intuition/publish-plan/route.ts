import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildPublishBundle } from '@/lib/intuition/bundle-builder'
import { resolveExistence } from '@/lib/intuition/existence-resolver'
import { createPublicClient, http } from 'viem'
import { INTUITION_CHAIN } from '@/lib/intuition/config'
import type { PublishPlanSerialized } from '@/types/intuition'

export async function GET(request: NextRequest) {
  const tokenId = request.nextUrl.searchParams.get('tokenId')

  if (!tokenId) {
    return NextResponse.json({ error: 'tokenId is required' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate token exists and is eligible
    const { data: token, error: tokenErr } = await supabase
      .from('tokens')
      .select('id, status')
      .eq('id', tokenId)
      .single()

    if (tokenErr || !token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    if (token.status !== 'validated' && token.status !== 'in_review') {
      return NextResponse.json(
        { error: 'Token must be validated or in_review for publish planning' },
        { status: 400 },
      )
    }

    // Build the raw bundle from canonical views
    const bundle = await buildPublishBundle(tokenId, supabase)

    // Create a read-only public client for on-chain existence checks
    const publicClient = createPublicClient({
      chain: INTUITION_CHAIN,
      transport: http(),
    })

    // Resolve existence to produce the final plan
    const plan = await resolveExistence(bundle, publicClient)

    // Serialize bigints to strings for JSON transport
    const serialized: PublishPlanSerialized = {
      ...plan,
      estimatedCost: {
        atomCostPerUnit: plan.estimatedCost.atomCostPerUnit.toString(),
        tripleCostPerUnit: plan.estimatedCost.tripleCostPerUnit.toString(),
        totalAtomsCost: plan.estimatedCost.totalAtomsCost.toString(),
        totalTriplesCost: plan.estimatedCost.totalTriplesCost.toString(),
        totalProvenanceCost: plan.estimatedCost.totalProvenanceCost.toString(),
        totalCost: plan.estimatedCost.totalCost.toString(),
      },
    }

    return NextResponse.json({ plan: serialized })
  } catch (err) {
    console.error('Publish plan error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate publish plan' },
      { status: 500 },
    )
  }
}
