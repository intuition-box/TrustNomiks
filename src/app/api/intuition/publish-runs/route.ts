import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PublishRunRequest, PublishRunActionRequest } from '@/types/intuition'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Route to incremental flow if body has an 'action' field
    if ('action' in body) {
      return handleIncrementalAction(supabase, user.id, body as PublishRunActionRequest)
    }

    // Legacy flow: full persist at end
    return handleLegacyPersist(supabase, user.id, body as PublishRunRequest)
  } catch (err) {
    console.error('Publish runs error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save publish run' },
      { status: 500 },
    )
  }
}

// ── Incremental persistence (init → chunk → finalize) ──────────────────────

async function handleIncrementalAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: PublishRunActionRequest,
) {
  switch (body.action) {
    case 'init':
      return handleInit(supabase, userId, body)
    case 'chunk':
      return handleChunk(supabase, userId, body)
    case 'finalize':
      return handleFinalize(supabase, userId, body)
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}

async function handleInit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: Extract<PublishRunActionRequest, { action: 'init' }>,
) {
  const { tokenId, walletAddress, chainId } = body

  if (!tokenId || !walletAddress) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate token exists
  const { data: token, error: tokenErr } = await supabase
    .from('tokens')
    .select('id')
    .eq('id', tokenId)
    .single()

  if (tokenErr || !token) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  const { data: run, error: runErr } = await supabase
    .from('intuition_publish_runs')
    .insert({
      token_id: tokenId,
      chain_id: chainId,
      wallet_address: walletAddress,
      status: 'running',
      atoms_created: 0,
      atoms_skipped: 0,
      atoms_failed: 0,
      triples_created: 0,
      triples_skipped: 0,
      triples_failed: 0,
      tx_hashes: [],
      errors: [],
      created_by: userId,
    })
    .select('id')
    .single()

  if (runErr) {
    console.error('Failed to create publish run:', runErr)
    return NextResponse.json({ error: 'Failed to create publish run' }, { status: 500 })
  }

  return NextResponse.json({ runId: run.id, status: 'running' })
}

async function handleChunk(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: Extract<PublishRunActionRequest, { action: 'chunk' }>,
) {
  const { runId, chainId, atomMappings, claimMappings, provenanceMappings, txHash } = body

  if (!runId) {
    return NextResponse.json({ error: 'Missing runId' }, { status: 400 })
  }

  // Verify run belongs to user
  const { data: run, error: runErr } = await supabase
    .from('intuition_publish_runs')
    .select('id, created_by')
    .eq('id', runId)
    .single()

  if (runErr || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }
  if (run.created_by !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Update run row: append txHash + write accumulated counters
  {
    const { data: runData } = await supabase
      .from('intuition_publish_runs')
      .select('tx_hashes')
      .eq('id', runId)
      .single()

    const currentHashes = Array.isArray(runData?.tx_hashes) ? runData.tx_hashes : []
    const updatedHashes = txHash ? [...currentHashes, txHash] : currentHashes

    const runUpdate: Record<string, unknown> = { tx_hashes: updatedHashes }
    if (body.counters) {
      runUpdate.atoms_created = body.counters.atomsCreated
      runUpdate.atoms_skipped = body.counters.atomsSkipped
      runUpdate.atoms_failed = body.counters.atomsFailed
      runUpdate.triples_created = body.counters.triplesCreated
      runUpdate.triples_skipped = body.counters.triplesSkipped
      runUpdate.triples_failed = body.counters.triplesFailed
    }

    const { error: runUpdateErr } = await supabase
      .from('intuition_publish_runs')
      .update(runUpdate)
      .eq('id', runId)

    if (runUpdateErr) {
      console.error('Failed to update run row:', runUpdateErr)
      return NextResponse.json({ error: 'Failed to update run' }, { status: 500 })
    }
  }

  // Upsert atom mappings
  if (atomMappings && atomMappings.length > 0) {
    const atomRows = atomMappings.map((m) => ({
      atom_id: m.atomId,
      atom_type: m.atomType,
      normalized_data: m.normalizedData,
      term_id: m.termId,
      chain_id: chainId,
      tx_hash: m.txHash,
      status: m.status,
      error_message: m.errorMessage ?? null,
      created_by: userId,
    }))

    const { error: atomErr } = await supabase
      .from('intuition_atom_mappings')
      .upsert(atomRows, { onConflict: 'atom_id' })

    if (atomErr) {
      console.error('Failed to upsert atom mappings:', atomErr)
      return NextResponse.json({ error: 'Failed to persist atom mappings' }, { status: 500 })
    }
  }

  // Upsert claim mappings
  if (claimMappings && claimMappings.length > 0) {
    const claimRows = claimMappings.map((m) => ({
      triple_id: m.tripleId,
      claim_group: m.claimGroup,
      origin_row_id: m.originRowId,
      subject_term_id: m.subjectTermId,
      predicate_term_id: m.predicateTermId,
      object_term_id: m.objectTermId,
      triple_term_id: m.tripleTermId,
      chain_id: chainId,
      tx_hash: m.txHash,
      status: m.status,
      error_message: m.errorMessage ?? null,
      created_by: userId,
    }))

    const { error: claimErr } = await supabase
      .from('intuition_claim_mappings')
      .upsert(claimRows, { onConflict: 'triple_id' })

    if (claimErr) {
      console.error('Failed to upsert claim mappings:', claimErr)
      return NextResponse.json({ error: 'Failed to persist claim mappings' }, { status: 500 })
    }
  }

  // Upsert provenance mappings
  if (provenanceMappings && provenanceMappings.length > 0) {
    const provRows = provenanceMappings.map((m) => ({
      triple_id: m.tripleId,
      source_atom_id: m.sourceAtomId,
      provenance_triple_term_id: m.provenanceTripleTermId,
      chain_id: chainId,
      tx_hash: m.txHash,
      status: m.status,
      error_message: m.errorMessage ?? null,
      created_by: userId,
    }))

    const { error: provErr } = await supabase
      .from('intuition_provenance_mappings')
      .upsert(provRows, { onConflict: 'triple_id,source_atom_id,chain_id' })

    if (provErr) {
      console.error('Failed to upsert provenance mappings:', provErr)
      return NextResponse.json({ error: 'Failed to persist provenance mappings' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

async function handleFinalize(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: Extract<PublishRunActionRequest, { action: 'finalize' }>,
) {
  const { runId, status, counters, txHashes, errors } = body

  if (!runId) {
    return NextResponse.json({ error: 'Missing runId' }, { status: 400 })
  }

  // Verify run belongs to user
  const { data: run, error: runErr } = await supabase
    .from('intuition_publish_runs')
    .select('id, created_by')
    .eq('id', runId)
    .single()

  if (runErr || !run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }
  if (run.created_by !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { error: updateErr } = await supabase
    .from('intuition_publish_runs')
    .update({
      status,
      atoms_created: counters.atomsCreated,
      atoms_skipped: counters.atomsSkipped,
      atoms_failed: counters.atomsFailed,
      triples_created: counters.triplesCreated,
      triples_skipped: counters.triplesSkipped,
      triples_failed: counters.triplesFailed,
      tx_hashes: txHashes,
      errors,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)

  if (updateErr) {
    console.error('Failed to finalize publish run:', updateErr)
    return NextResponse.json({ error: 'Failed to finalize run' }, { status: 500 })
  }

  return NextResponse.json({ runId, status })
}

// ── Legacy flow (full persist at end) ───────────────────────────────────────

async function handleLegacyPersist(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  body: PublishRunRequest,
) {
  const { tokenId, walletAddress, chainId, result } = body

  if (!tokenId || !walletAddress || !result) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Validate token exists
  const { data: token, error: tokenErr } = await supabase
    .from('tokens')
    .select('id')
    .eq('id', tokenId)
    .single()

  if (tokenErr || !token) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  // 1. Create the publish run record
  const runStatus =
    result.atomsFailed === 0 && result.triplesFailed === 0
      ? 'completed'
      : result.atomsCreated > 0 || result.triplesCreated > 0
        ? 'partial'
        : 'failed'

  const { data: run, error: runErr } = await supabase
    .from('intuition_publish_runs')
    .insert({
      token_id: tokenId,
      chain_id: chainId,
      wallet_address: walletAddress,
      status: runStatus,
      atoms_created: result.atomsCreated,
      atoms_skipped: result.atomsSkipped,
      atoms_failed: result.atomsFailed,
      triples_created: result.triplesCreated,
      triples_skipped: result.triplesSkipped,
      triples_failed: result.triplesFailed,
      tx_hashes: result.txHashes,
      errors: result.errors,
      completed_at: new Date().toISOString(),
      created_by: userId,
    })
    .select('id')
    .single()

  if (runErr) {
    console.error('Failed to create publish run:', runErr)
    return NextResponse.json({ error: 'Failed to save publish run' }, { status: 500 })
  }

  // 2. Upsert atom mappings
  if (result.atomMappings.length > 0) {
    const atomRows = result.atomMappings.map((m) => ({
      atom_id: m.atomId,
      atom_type: m.atomType,
      normalized_data: m.normalizedData,
      term_id: m.termId,
      chain_id: chainId,
      tx_hash: m.txHash,
      status: m.status,
      error_message: m.errorMessage ?? null,
      created_by: userId,
    }))

    const { error: atomErr } = await supabase
      .from('intuition_atom_mappings')
      .upsert(atomRows, { onConflict: 'atom_id' })

    if (atomErr) {
      console.error('Failed to upsert atom mappings:', atomErr)
    }
  }

  // 3. Upsert claim mappings
  if (result.claimMappings.length > 0) {
    const claimRows = result.claimMappings.map((m) => ({
      triple_id: m.tripleId,
      claim_group: m.claimGroup,
      origin_row_id: m.originRowId,
      subject_term_id: m.subjectTermId,
      predicate_term_id: m.predicateTermId,
      object_term_id: m.objectTermId,
      triple_term_id: m.tripleTermId,
      chain_id: chainId,
      tx_hash: m.txHash,
      status: m.status,
      error_message: m.errorMessage ?? null,
      created_by: userId,
    }))

    const { error: claimErr } = await supabase
      .from('intuition_claim_mappings')
      .upsert(claimRows, { onConflict: 'triple_id' })

    if (claimErr) {
      console.error('Failed to upsert claim mappings:', claimErr)
    }
  }

  // 4. Upsert provenance mappings
  if (result.provenanceMappings && result.provenanceMappings.length > 0) {
    const provRows = result.provenanceMappings.map((m) => ({
      triple_id: m.tripleId,
      source_atom_id: m.sourceAtomId,
      provenance_triple_term_id: m.provenanceTripleTermId,
      chain_id: chainId,
      tx_hash: m.txHash,
      status: m.status,
      error_message: m.errorMessage ?? null,
      created_by: userId,
    }))

    const { error: provErr } = await supabase
      .from('intuition_provenance_mappings')
      .upsert(provRows, { onConflict: 'triple_id,source_atom_id,chain_id' })

    if (provErr) {
      console.error('Failed to upsert provenance mappings:', provErr)
    }
  }

  return NextResponse.json({
    runId: run.id,
    status: runStatus,
  })
}
