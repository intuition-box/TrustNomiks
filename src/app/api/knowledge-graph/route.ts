import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGraph } from '@/lib/knowledge-graph/build-graph'
import type {
  CanonicalAtom,
  CanonicalTriple,
  CanonicalSource,
} from '@/lib/knowledge-graph/graph-types'
import type { KnowledgeGraphResponse } from '@/types/knowledge-graph'

// ── Cache (5 min — graph data rarely changes mid-session) ─────────────────

const CACHE_TTL_MS = 5 * 60_000
const cache = new Map<string, { data: KnowledgeGraphResponse; ts: number }>()

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const scope = params.get('scope') || 'global'
  const tokenIdsParam = params.get('tokenIds')
  const includeSources = params.get('includeSources') !== 'false'
  const includeTaxonomy = params.get('includeTaxonomy') !== 'false'
  const includeLiterals = params.get('includeLiterals') === 'true'
  const bust = params.get('bust') === 'true'

  if (scope !== 'global' && scope !== 'token') {
    return NextResponse.json({ error: 'scope must be "global" or "token"' }, { status: 400 })
  }
  if (scope === 'token' && !tokenIdsParam) {
    return NextResponse.json({ error: 'tokenIds required when scope=token' }, { status: 400 })
  }

  const tokenIds = tokenIdsParam
    ? tokenIdsParam.split(',').map((s) => s.trim()).filter(Boolean)
    : []

  const cacheKey = `${scope}:${tokenIds.join(',')}:${includeSources}:${includeTaxonomy}:${includeLiterals}`
  const cached = cache.get(cacheKey)
  if (!bust && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data)
  }

  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Resolve token IDs for scope filtering (single query) ─────────

    let scopeTokenIds: string[] = tokenIds
    if (scope === 'global') {
      const { data: validTokens } = await supabase
        .from('tokens')
        .select('id')
        .in('status', ['in_review', 'validated'])
      scopeTokenIds = (validTokens ?? []).map((t: { id: string }) => t.id)
      if (scopeTokenIds.length === 0) {
        const empty: KnowledgeGraphResponse = {
          nodes: [], edges: [],
          meta: { totalTokens: 0, totalNodes: 0, totalEdges: 0 },
        }
        return NextResponse.json(empty)
      }
    }

    const orFilter = `token_id.in.(${scopeTokenIds.join(',')}),token_id.is.null`

    // ── Fetch atoms + triples + sources in PARALLEL ──────────────────

    const [atomsResult, triplesResult, sourcesResult] = await Promise.all([
      supabase.from('kg_atoms_v1').select('*').or(orFilter).limit(10000),
      supabase.from('kg_triples_v1').select('*').in('token_id', scopeTokenIds).limit(50000),
      includeSources
        ? supabase.from('kg_triple_sources_v1').select('*').in('token_id', scopeTokenIds).limit(10000)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (atomsResult.error) {
      return NextResponse.json({ error: atomsResult.error.message }, { status: 500 })
    }
    if (triplesResult.error) {
      return NextResponse.json({ error: triplesResult.error.message }, { status: 500 })
    }
    if (sourcesResult.error) {
      return NextResponse.json({ error: sourcesResult.error.message }, { status: 500 })
    }

    // ── Build graph ──────────────────────────────────────────────────

    const { nodes, edges } = buildGraph(
      (atomsResult.data ?? []) as CanonicalAtom[],
      (triplesResult.data ?? []) as CanonicalTriple[],
      (sourcesResult.data ?? []) as CanonicalSource[],
      { includeSources, includeTaxonomy, includeLiterals },
    )

    const response: KnowledgeGraphResponse = {
      nodes,
      edges,
      meta: {
        totalTokens: scopeTokenIds.length,
        totalNodes: nodes.length,
        totalEdges: edges.length,
      },
    }

    cache.set(cacheKey, { data: response, ts: Date.now() })
    return NextResponse.json(response)
  } catch (err) {
    console.error('Knowledge graph error:', err)
    return NextResponse.json({ error: 'Failed to build knowledge graph' }, { status: 500 })
  }
}
