/**
 * Diagnostic for the V1 → V2 vocabulary migration.
 *
 * Lists tokens that have been published with the legacy snake_case
 * `TextObject` predicates and need to be re-published so their triples
 * land on the new canonical (IPFS-pinned) predicates.
 *
 * Strategy: query intuition_atom_mappings for rows whose normalized_data is
 * a bare snake_case string (no "ipfs://" prefix) AND atom_type='predicate'.
 * Group by token_id (via the bundle's claim_mappings → predicate_term_id
 * back-reference), and print one row per affected token.
 *
 * The script does NOT republish — that runs through the existing publish UI,
 * which now uses the canonical registry automatically. Output is a checklist.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/republish-status.ts
 */

import { createClient } from '@supabase/supabase-js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    throw new Error(`Missing env var: ${name}`)
  }
  return v
}

interface AtomMapping {
  atom_id: string
  atom_type: string
  normalized_data: string
  term_id: string | null
}

interface ClaimMapping {
  triple_id: string
  predicate_term_id: string
  origin_row_id: string | null
}

interface TokenRow {
  id: string
  name: string
  ticker: string
  status: string
}

async function main() {
  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )

  console.log('[republish-status] scanning intuition_atom_mappings for legacy predicates…')

  // 1. Find legacy predicate mappings (snake_case TextObject — no ipfs:// prefix).
  const { data: legacyMappings, error: e1 } = await supabase
    .from('intuition_atom_mappings')
    .select('atom_id, atom_type, normalized_data, term_id')
    .eq('atom_type', 'predicate')
    .not('normalized_data', 'like', 'ipfs://%')
  if (e1) throw new Error(`atom_mappings query: ${e1.message}`)

  const legacy = (legacyMappings ?? []) as AtomMapping[]
  if (legacy.length === 0) {
    console.log('[republish-status] no legacy predicates found — nothing to migrate.')
    return
  }

  console.log(`[republish-status] ${legacy.length} legacy predicate term_id(s) on-chain:`)
  for (const m of legacy) {
    console.log(`    ${m.normalized_data.padEnd(36)} ${m.term_id?.slice(0, 10)}…`)
  }

  const legacyTermIds = legacy.map((m) => m.term_id).filter(Boolean) as string[]

  // 2. Pull triples that reference any legacy predicate.
  const { data: claims, error: e2 } = await supabase
    .from('intuition_claim_mappings')
    .select('triple_id, predicate_term_id, origin_row_id')
    .in('predicate_term_id', legacyTermIds)
  if (e2) throw new Error(`claim_mappings query: ${e2.message}`)

  const affected = (claims ?? []) as ClaimMapping[]

  // 3. Map triple_id back to token_id by parsing the prefix or via origin_row_id.
  // Triples in this codebase have token_id encoded either as the origin row
  // owner or via the synthetic prefix `triple:{tokenId}:…` for has_name/has_ticker.
  // We pull tokens with publish runs and intersect.
  const { data: runs, error: e3 } = await supabase
    .from('intuition_publish_runs')
    .select('token_id, status')
    .in('status', ['completed', 'partial'])
  if (e3) throw new Error(`publish_runs query: ${e3.message}`)

  const publishedTokenIds = Array.from(
    new Set((runs ?? []).map((r) => r.token_id as string)),
  )
  if (publishedTokenIds.length === 0) {
    console.log('[republish-status] no completed publish runs in DB; legacy predicates exist but no token attribution available.')
    return
  }

  const { data: tokens, error: e4 } = await supabase
    .from('tokens')
    .select('id, name, ticker, status')
    .in('id', publishedTokenIds)
    .order('name', { ascending: true })
  if (e4) throw new Error(`tokens query: ${e4.message}`)

  // 4. Print checklist.
  console.log('')
  console.log(`[republish-status] ${(tokens ?? []).length} published token(s) to re-publish under V2 vocabulary:`)
  console.log('')
  console.log('  status  ticker     name                         token_id')
  console.log('  ' + '─'.repeat(78))
  for (const t of (tokens ?? []) as TokenRow[]) {
    console.log(`  ${t.status.padEnd(7)} ${(t.ticker ?? '').padEnd(10)} ${(t.name ?? '').padEnd(28)} ${t.id}`)
  }

  console.log('')
  console.log(`Affected on-chain triples: ${affected.length}`)
  console.log('')
  console.log('Next step:')
  console.log('  Open each token in the dashboard and click "Publish to Intuition".')
  console.log('  The bundle-builder now resolves predicates via canonical-registry.json,')
  console.log('  so the new run will produce fresh canonical predicate term_ids and')
  console.log('  re-link existing entity atoms to them. Old triples remain on-chain as')
  console.log('  legacy noise (testnet acceptable). Mainnet migration would add')
  console.log('  `deprecates` provenance triples — out of scope for this sprint.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
