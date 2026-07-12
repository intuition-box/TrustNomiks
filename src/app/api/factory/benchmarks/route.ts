import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
// Subpath import (not the barrel): keeps the server bundle to the pure
// aggregation module (tasks/factory-plan.md, Phase 0 barrel rule).
import {
  buildBenchmarkResponse,
  resolveCohort,
  type CohortTokenRow,
  type FactoryBenchmarkSnapshot,
  type KgAtomRow,
  type KgTripleRow,
} from '@/lib/tokenomics/benchmarks'
import { normalizeSector } from '@/lib/tokenomics/schemas'

// ── Cache (5 min). The key is the sector ONLY: the attested-only cohort is a
// fixed server-side invariant (MIN_COHORT_ATTESTED in the aggregation module),
// never a request dimension — no query param, header or body field may vary it.
const CACHE_TTL_MS = 5 * 60_000
const cache = new Map<string, { data: FactoryBenchmarkSnapshot; ts: number }>()

const ATOM_TOKEN_PREFIX = 'atom:token:'

/** The only literals the aggregation consumes; the fetch is bounded to them. */
const TRIPLE_PREDICATES = [
  'has Percentage',
  'has Vesting Schedule',
  'has Cliff Months',
  'has Duration Months',
  'has TGE Percentage',
  'has Cliff Unlock Percentage',
  'has Frequency',
  'has Annual Inflation Rate',
]

export async function GET(request: NextRequest) {
  const sectorParam = request.nextUrl.searchParams.get('sector')
  const bust = request.nextUrl.searchParams.get('bust') === 'true'

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Explicit contributor gate: the nav zone and RoleGate are client-only
    // affordances, so the route re-checks the role server-side.
    const { data: isContributor, error: roleErr } =
      await supabase.rpc('is_contributor')
    if (roleErr) {
      return NextResponse.json({ error: roleErr.message }, { status: 500 })
    }
    if (!isContributor) {
      return NextResponse.json(
        { error: 'Contributor role required' },
        { status: 403 },
      )
    }

    // A design without a sector cannot resolve a cohort: an explicit reason,
    // not an empty 200 (the panel routes the user to the Identity section).
    if (!sectorParam) {
      return NextResponse.json({ cohort: null, reason: 'no-sector' })
    }

    // Allowlist validation against the 28-value taxonomy; never interpolated.
    const sector = normalizeSector(sectorParam)
    if (!sector) {
      return NextResponse.json(
        { error: `Unknown sector "${sectorParam}"` },
        { status: 400 },
      )
    }

    const cached = cache.get(sector)
    if (!bust && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return NextResponse.json(cached.data)
    }

    // ── Cohort inputs: validated tokens + the attested push ledger ─────────
    const [tokensResult, mappingsResult] = await Promise.all([
      supabase
        .from('tokens')
        .select('id, status, sector, category')
        .eq('status', 'validated'),
      supabase
        .from('intuition_atom_mappings')
        .select('atom_id')
        .eq('status', 'confirmed')
        .like('atom_id', `${ATOM_TOKEN_PREFIX}%`),
    ])
    if (tokensResult.error) {
      return NextResponse.json(
        { error: tokensResult.error.message },
        { status: 500 },
      )
    }
    if (mappingsResult.error) {
      return NextResponse.json(
        { error: mappingsResult.error.message },
        { status: 500 },
      )
    }

    const tokens = (tokensResult.data ?? []) as CohortTokenRow[]
    // The mappings table has no token_id column: the token UUID is the
    // 'atom:token:{uuid}' suffix of atom_id.
    const attestedTokenIds = new Set(
      (mappingsResult.data ?? []).map((m: { atom_id: string }) =>
        m.atom_id.slice(ATOM_TOKEN_PREFIX.length),
      ),
    )

    // ── Resolve the cohort FIRST, then fetch bounded to it ─────────────────
    // (No global .limit(10000/50000) like the kg route: an unordered global
    // limit truncates nondeterministically and would break snapshot
    // reproducibility.)
    const { cohort, tokenIds } = resolveCohort({
      requestedSector: sector,
      tokens,
      attestedTokenIds,
    })

    let snapshot: FactoryBenchmarkSnapshot
    if (cohort.basis === 'none') {
      snapshot = {
        requestedSector: sector,
        cohort,
        allocation: {},
        vesting: {},
        emission: { annualInflationRate: null },
        generatedAt: new Date().toISOString(),
      }
    } else {
      const [atomsResult, triplesResult] = await Promise.all([
        supabase
          .from('kg_atoms_v1')
          .select('atom_id, atom_type, label, token_id, metadata')
          .eq('atom_type', 'allocation')
          .in('token_id', tokenIds),
        supabase
          .from('kg_triples_v1')
          .select('subject_id, predicate, object_id, object_literal, token_id')
          .in('predicate', TRIPLE_PREDICATES)
          .in('token_id', tokenIds),
      ])
      if (atomsResult.error) {
        return NextResponse.json(
          { error: atomsResult.error.message },
          { status: 500 },
        )
      }
      if (triplesResult.error) {
        return NextResponse.json(
          { error: triplesResult.error.message },
          { status: 500 },
        )
      }

      snapshot = {
        ...buildBenchmarkResponse({
          requestedSector: sector,
          tokens,
          attestedTokenIds,
          atoms: (atomsResult.data ?? []) as KgAtomRow[],
          triples: (triplesResult.data ?? []) as KgTripleRow[],
        }),
        generatedAt: new Date().toISOString(),
      }
    }

    cache.set(sector, { data: snapshot, ts: Date.now() })
    return NextResponse.json(snapshot)
  } catch (err) {
    console.error('Factory benchmarks error:', err)
    return NextResponse.json(
      { error: 'Failed to compute benchmarks' },
      { status: 500 },
    )
  }
}
