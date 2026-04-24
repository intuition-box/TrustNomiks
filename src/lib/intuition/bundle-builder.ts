/**
 * Builds a publish bundle from canonical SQL views (kg_atoms_v1, kg_triples_v1,
 * kg_triple_sources_v1). The bundle contains all atoms, triples, and provenance
 * needed to publish a token's core graph to the Intuition testnet.
 *
 * The bundle builder:
 *  1. Fetches canonical data from Supabase
 *  2. Filters out excluded claims (risk_flags, status, completeness)
 *  3. Normalizes atoms + predicates + literals
 *  4. Injects synthetic triples for token name/ticker (not in SQL views)
 *  5. Collects provenance links from kg_triple_sources_v1
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanonicalAtom, CanonicalTriple, CanonicalSource } from '@/lib/knowledge-graph/graph-types'
import {
  normalizeAtom,
  normalizePredicate,
  normalizeLiteral,
  filterAtoms,
  filterTriples,
  collectUniquePredicates,
  predicateToAtomId,
  literalToAtomId,
} from './atom-normalizer'

// ── Raw bundle (before existence resolution) ────────────────────────────────

export interface RawAtomEntry {
  atomId: string
  atomType: string
  normalizedData: string
}

export interface RawTripleEntry {
  tripleId: string
  claimGroup: string | null
  originRowId: string | null
  subjectAtomId: string
  predicateAtomId: string
  objectAtomId: string
}

export interface RawProvenanceEntry {
  claimTripleId: string
  sourceAtomId: string
  predicateAtomId: string // always "atom:predicate:based_on"
}

export interface RawBundle {
  tokenId: string
  tokenName: string
  tokenTicker: string
  atoms: RawAtomEntry[]
  triples: RawTripleEntry[]
  provenance: RawProvenanceEntry[]
}

// ── Main builder ────────────────────────────────────────────────────────────

export async function buildPublishBundle(
  tokenId: string,
  supabase: SupabaseClient,
): Promise<RawBundle> {
  // 1. Fetch canonical data in parallel
  const scopeFilter = `token_id.eq.${tokenId},token_id.is.null`

  const [atomsResult, triplesResult, sourcesResult, tokenResult] = await Promise.all([
    supabase.from('kg_atoms_v1').select('*').or(scopeFilter).limit(10000),
    supabase.from('kg_triples_v1').select('*').eq('token_id', tokenId).limit(50000),
    supabase.from('kg_triple_sources_v1').select('*').eq('token_id', tokenId).limit(10000),
    supabase.from('tokens').select('name, ticker').eq('id', tokenId).single(),
  ])

  if (atomsResult.error) throw new Error(`Atoms fetch failed: ${atomsResult.error.message}`)
  if (triplesResult.error) throw new Error(`Triples fetch failed: ${triplesResult.error.message}`)
  if (sourcesResult.error) throw new Error(`Sources fetch failed: ${sourcesResult.error.message}`)
  if (tokenResult.error) throw new Error(`Token fetch failed: ${tokenResult.error.message}`)

  const rawAtoms = (atomsResult.data ?? []) as CanonicalAtom[]
  const rawTriples = (triplesResult.data ?? []) as CanonicalTriple[]
  const claimSources = (sourcesResult.data ?? []) as CanonicalSource[]
  const { name: tokenName, ticker: tokenTicker } = tokenResult.data

  // 2. Filter excluded types
  const atoms = filterAtoms(rawAtoms)
  const triples = filterTriples(rawTriples)

  // 3. Build atom registry (deduplicated)
  const atomMap = new Map<string, RawAtomEntry>()

  // Entity atoms from kg_atoms_v1
  for (const atom of atoms) {
    const normalizedData = normalizeAtom(atom)
    atomMap.set(atom.atom_id, {
      atomId: atom.atom_id,
      atomType: atom.atom_type,
      normalizedData,
    })
  }

  // Predicate atoms (implicit — not in kg_atoms_v1)
  const predicates = collectUniquePredicates(triples)
  for (const { normalized } of predicates) {
    const atomId = predicateToAtomId(normalized)
    if (!atomMap.has(atomId)) {
      atomMap.set(atomId, {
        atomId,
        atomType: 'predicate',
        normalizedData: normalized,
      })
    }
  }

  // Synthetic predicate atoms for name/ticker (always needed)
  for (const pred of ['has_name', 'has_ticker']) {
    const atomId = predicateToAtomId(pred)
    if (!atomMap.has(atomId)) {
      atomMap.set(atomId, {
        atomId,
        atomType: 'predicate',
        normalizedData: pred,
      })
    }
  }

  // 4. Build triple list + collect literal atoms
  const tripleEntries: RawTripleEntry[] = []
  const tokenAtomId = `atom:token:${tokenId}`

  // Inject synthetic triples: token has_name and has_ticker
  // (not produced by kg_triples_v1)
  const syntheticTriples: Array<{
    tripleId: string
    predicate: string
    literal: string
  }> = [
    {
      tripleId: `triple:${tokenId}:has_name`,
      predicate: 'has_name',
      literal: tokenName,
    },
    {
      tripleId: `triple:${tokenId}:has_ticker`,
      predicate: 'has_ticker',
      literal: tokenTicker,
    },
  ]

  for (const syn of syntheticTriples) {
    const literalAtomId = literalToAtomId(syn.tripleId, syn.literal)
    atomMap.set(literalAtomId, {
      atomId: literalAtomId,
      atomType: 'literal',
      normalizedData: normalizeLiteral(syn.literal),
    })
    tripleEntries.push({
      tripleId: syn.tripleId,
      claimGroup: 'token_identity',
      originRowId: tokenId,
      subjectAtomId: tokenAtomId,
      predicateAtomId: predicateToAtomId(syn.predicate),
      objectAtomId: literalAtomId,
    })
  }

  // Process canonical triples
  for (const triple of triples) {
    const normalizedPredicate = normalizePredicate(triple.predicate)
    const predicateAtomId = predicateToAtomId(normalizedPredicate)

    let objectAtomId: string

    if (triple.object_id) {
      // Structural triple — object is an existing atom
      objectAtomId = triple.object_id
    } else if (triple.object_literal != null) {
      // Literal triple — create a literal atom
      const normalizedLiteral = normalizeLiteral(triple.object_literal)
      const litAtomId = literalToAtomId(triple.triple_id, normalizedLiteral)
      objectAtomId = litAtomId

      if (!atomMap.has(litAtomId)) {
        atomMap.set(litAtomId, {
          atomId: litAtomId,
          atomType: 'literal',
          normalizedData: normalizedLiteral,
        })
      }
    } else {
      // Skip triples with neither object_id nor object_literal
      continue
    }

    tripleEntries.push({
      tripleId: triple.triple_id,
      claimGroup: triple.claim_group,
      originRowId: triple.origin_row_id ? String(triple.origin_row_id) : null,
      subjectAtomId: triple.subject_id,
      predicateAtomId,
      objectAtomId,
    })
  }

  // 5. Build provenance entries from claim_sources
  const basedOnPredicateId = predicateToAtomId('based_on')
  const provenanceEntries: RawProvenanceEntry[] = []

  // Index triples by claim_group + origin_row_id for matching
  const triplesByClaimKey = new Map<string, string[]>()
  const triplesByGroupToken = new Map<string, string[]>()

  for (const te of tripleEntries) {
    if (te.claimGroup && te.originRowId) {
      const key = `${te.claimGroup}:${te.originRowId}`
      const arr = triplesByClaimKey.get(key)
      if (arr) arr.push(te.tripleId)
      else triplesByClaimKey.set(key, [te.tripleId])
    }
    if (te.claimGroup) {
      const key = `${te.claimGroup}:${tokenId}`
      const arr = triplesByGroupToken.get(key)
      if (arr) arr.push(te.tripleId)
      else triplesByGroupToken.set(key, [te.tripleId])
    }
  }

  const seenProvenance = new Set<string>()

  for (const cs of claimSources) {
    if (!atomMap.has(cs.source_atom_id)) continue

    // Try specific match: claim_type + claim_id
    let targetTripleIds: string[] = []
    if (cs.claim_id) {
      targetTripleIds = triplesByClaimKey.get(`${cs.claim_type}:${cs.claim_id}`) ?? []
    }

    // Fallback: claim_type + token_id
    if (targetTripleIds.length === 0) {
      targetTripleIds = triplesByGroupToken.get(`${cs.claim_type}:${tokenId}`) ?? []
    }

    for (const tripleId of targetTripleIds) {
      const provKey = `${tripleId}:${cs.source_atom_id}`
      if (seenProvenance.has(provKey)) continue
      seenProvenance.add(provKey)

      provenanceEntries.push({
        claimTripleId: tripleId,
        sourceAtomId: cs.source_atom_id,
        predicateAtomId: basedOnPredicateId,
      })
    }
  }

  return {
    tokenId,
    tokenName,
    tokenTicker,
    atoms: Array.from(atomMap.values()),
    triples: tripleEntries,
    provenance: provenanceEntries,
  }
}
