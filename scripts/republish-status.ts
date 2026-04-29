/**
 * Diagnostic for the V2 vocabulary migration.
 *
 * Two failure modes a published token can have:
 *   1. Predicate term_id in DB does NOT match canonical-registry.json
 *      (either plain snake_case string, OR an earlier IPFS Thing pinned
 *      with a non-canonical label — both need republish to align with
 *      the TrustNomiks canonical registry).
 *   2. Predicate term_id matches but some triples were created against
 *      the wrong predicate (rare; covered by 1).
 *
 * Strategy: for each predicate atom_id in intuition_atom_mappings, look
 * up its expected term_id from the canonical registry. Diverging rows
 * are flagged. Tokens whose claims reference any diverging predicate
 * term_id are listed.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/republish-status.ts
 */

import { createClient } from '@supabase/supabase-js'
import { getCanonicalRegistry } from '../src/lib/intuition/canonical-registry'

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

  console.log('[republish-status] comparing predicate term_ids against canonical registry…')

  // 1. Pull all predicate mappings (both snake_case and earlier-IPFS).
  const { data: predMappings, error: e1 } = await supabase
    .from('intuition_atom_mappings')
    .select('atom_id, atom_type, normalized_data, term_id')
    .eq('atom_type', 'predicate')
  if (e1) throw new Error(`atom_mappings query: ${e1.message}`)

  const registry = getCanonicalRegistry().predicates
  const diverging: AtomMapping[] = []
  const aligned: AtomMapping[] = []

  for (const m of (predMappings ?? []) as AtomMapping[]) {
    const internalKey = m.atom_id.replace(/^atom:predicate:/, '')
    const expected = registry[internalKey]
    if (!expected) {
      // Predicate not in registry (excluded V1 like has_status, or unknown).
      // Treat as diverging so it gets re-evaluated on republish.
      diverging.push(m)
      continue
    }
    if ((m.term_id ?? '').toLowerCase() === expected.termId.toLowerCase()) {
      aligned.push(m)
    } else {
      diverging.push(m)
    }
  }

  console.log(`  ${aligned.length} predicate(s) already aligned with registry`)
  console.log(`  ${diverging.length} predicate(s) diverging — need republish`)
  if (diverging.length === 0) {
    console.log('[republish-status] all predicates aligned — nothing to migrate.')
    return
  }

  console.log('')
  console.log('Diverging predicates:')
  for (const m of diverging) {
    const internalKey = m.atom_id.replace(/^atom:predicate:/, '')
    const expected = registry[internalKey]
    const dataPreview = m.normalized_data.startsWith('ipfs://')
      ? `ipfs://…${m.normalized_data.slice(-12)}`
      : m.normalized_data
    console.log(
      `  ${internalKey.padEnd(32)} db=${m.term_id?.slice(0, 10) ?? '—'} expected=${expected ? expected.termId.slice(0, 10) : '<not in registry>'}…  data=${dataPreview}`,
    )
  }

  const legacyTermIds = diverging.map((m) => m.term_id).filter(Boolean) as string[]

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
