/**
 * Normalizes TrustNomiks canonical atoms and predicates into stable,
 * deterministic strings for on-chain publication to Intuition Protocol.
 *
 * V2 rules (canonical):
 *  - Predicates resolve to IPFS Thing URIs via the canonical registry
 *    (see canonical-registry.ts). The internal snake_case key remains the
 *    DB index; the on-chain `data` is the registry's `uri`.
 *  - Entity atoms (token, allocation, …) resolve to IPFS Thing URIs via
 *    entity-pinner.ts at bundle-build time.
 *  - Literal atoms remain plain strings on-chain (their dedup is content-based);
 *    internal IDs are now indexed by content hash, not tripleId, so the
 *    in-memory atomMap deduplicates correctly.
 *  - Scalars: numbers as base-10 without separators, dates as YYYY-MM-DD,
 *    booleans as "true"/"false".
 *
 * The legacy `normalizeAtom` is preserved for back-compat with tests and
 * non-publish read paths (graph drill-downs). New publish code should
 * pin entities via entity-pinner instead.
 */

import { createHash } from 'node:crypto'
import type { CanonicalAtom, CanonicalTriple } from '@/lib/knowledge-graph/graph-types'
import { getCanonicalPredicate } from './canonical-registry'

// ── Predicate ontology (kg_triples_v1 predicate → on-chain snake_case) ──────

const PREDICATE_MAP: Record<string, string> = {
  // Structural relationships
  'has Allocation Segment':   'has_allocation_segment',
  'has Vesting Schedule':     'has_vesting_schedule',
  'has Emission Model':       'has_emission_model',
  'has Data Source':          'has_data_source',
  'has Risk Flag':            'has_risk_flag',
  'has Category':             'has_category',
  'has Sector':               'has_sector',
  'has Chain':                'has_chain',

  // Token identity literals
  'has Name':                 'has_name',
  'has Ticker':               'has_ticker',
  'has Contract Address':     'has_contract_address',
  'has TGE Date':             'has_tge_date',
  'has Status':               'has_status',
  'has Completeness':         'has_completeness',

  // Supply literals
  'has Max Supply':           'has_max_supply',
  'has Initial Supply':       'has_initial_supply',
  'has TGE Supply':           'has_tge_supply',
  'has Circulating Supply':   'has_circulating_supply',

  // Allocation literals
  'has Percentage':           'has_percentage',
  'has Token Amount':         'has_token_amount',
  'has Wallet Address':       'has_wallet_address',

  // Vesting literals
  'has Cliff Months':         'has_cliff_months',
  'has Duration Months':      'has_duration_months',
  'has Frequency':            'has_frequency',
  'has TGE Percentage':       'has_tge_percentage',
  'has Cliff Unlock Percentage': 'has_cliff_unlock_percentage',

  // Emission literals
  'has Annual Inflation Rate': 'has_annual_inflation_rate',

  // Source literals
  'has URL':                  'has_url',
  'has Version':              'has_version',
  'has Verified At':          'has_verified_at',

  // Risk flag literals (excluded in V1 but mapped for completeness)
  'has Severity':             'has_severity',
  'is Flagged':               'is_flagged',
  'has Justification':        'has_justification',

  // Provenance
  'based_on':                 'based_on',
}

/**
 * Predicates that carry workflow/internal data — excluded from V1 on-chain publishing.
 */
const EXCLUDED_PREDICATES = new Set([
  'has_status',
  'has_completeness',
])

/**
 * Atom types excluded from V1 on-chain publishing.
 */
const EXCLUDED_ATOM_TYPES = new Set([
  'risk_flag',
])

/**
 * Claim groups (origin tables) excluded from V1.
 */
const EXCLUDED_CLAIM_GROUPS = new Set<string>([
  // risk_flags triples are excluded
])

// ── Predicate normalization ─────────────────────────────────────────────────

export function normalizePredicate(rawPredicate: string): string {
  const mapped = PREDICATE_MAP[rawPredicate]
  if (mapped) return mapped

  // Fallback: convert to snake_case
  return rawPredicate
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function isPredicateExcluded(normalizedPredicate: string): boolean {
  return EXCLUDED_PREDICATES.has(normalizedPredicate)
}

// ── Atom normalization ──────────────────────────────────────────────────────

export function isAtomTypeExcluded(atomType: string): boolean {
  return EXCLUDED_ATOM_TYPES.has(atomType)
}

/**
 * Normalize a canonical atom into a stable on-chain string.
 */
export function normalizeAtom(atom: CanonicalAtom): string {
  const meta = atom.metadata ?? {}

  switch (atom.atom_type) {
    case 'token': {
      // If token has a valid EVM contract address, we could use createAtomFromEthereumAccount.
      // But for V1 string-only approach, we use the trustnomiks namespace.
      return `trustnomiks:token:${atom.token_id}`
    }
    case 'allocation':
      return `trustnomiks:allocation:${atom.atom_id.replace('atom:alloc:', '')}`
    case 'vesting':
      return `trustnomiks:vesting:${atom.atom_id.replace('atom:vest:', '')}`
    case 'emission':
      return `trustnomiks:emission:${atom.atom_id.replace('atom:emission:', '')}`
    case 'data_source': {
      const url = meta.url as string | undefined
      const version = meta.version as string | undefined
      if (url) {
        const normalizedUrl = normalizeUrl(url)
        return version
          ? `trustnomiks:source:${normalizedUrl}|${version}`
          : `trustnomiks:source:${normalizedUrl}`
      }
      return `trustnomiks:source:${atom.atom_id.replace('atom:source:', '')}`
    }
    case 'category':
    case 'sector':
    case 'chain':
      return atom.label?.toLowerCase().trim() ?? atom.atom_id
    default:
      return atom.atom_id
  }
}

/**
 * Generate a synthetic atom ID for a predicate string.
 * The internal key remains snake_case; the on-chain data is resolved via
 * `predicateNormalizedData` which looks the URI up in the canonical registry.
 */
export function predicateToAtomId(normalizedPredicate: string): string {
  return `atom:predicate:${normalizedPredicate}`
}

/**
 * Resolve the on-chain `normalizedData` for a predicate (an IPFS Thing URI).
 * Throws if the predicate is missing from the canonical registry — that means
 * `pin-canonical-predicates.ts` was not re-run after a new entry was added.
 */
export function predicateNormalizedData(normalizedPredicate: string): string {
  return getCanonicalPredicate(normalizedPredicate).uri
}

/**
 * Generate a synthetic atom ID for a literal value.
 *
 * Indexed by the hash of the normalized value, not the triple it came from,
 * so two triples carrying "monthly" share the same internal atom and the
 * in-memory atomMap deduplicates correctly. The on-chain dedup is unaffected
 * (it has always been by content hash).
 *
 * The `_tripleId` arg is preserved for callsite compatibility but unused.
 */
export function literalToAtomId(_tripleId: string, literal: string): string {
  const normalized = normalizeLiteral(literal)
  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 16)
  return `atom:literal:${digest}`
}

// ── Literal normalization ───────────────────────────────────────────────────

/**
 * Normalize a literal value for on-chain publication.
 */
export function normalizeLiteral(value: string | null | undefined): string {
  if (value == null) return ''

  const trimmed = value.trim()

  // Boolean normalization
  if (trimmed.toLowerCase() === 'true') return 'true'
  if (trimmed.toLowerCase() === 'false') return 'false'

  // Date normalization (already ISO from SQL cast)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10) // YYYY-MM-DD only, strip time
  }

  // Number normalization: remove thousand separators, keep decimal dot
  if (/^[\d,]+\.?\d*$/.test(trimmed)) {
    return trimmed.replace(/,/g, '')
  }

  return trimmed
}

// ── URL normalization ───────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    // Remove trailing slash, lowercase host
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/$/, '')}${parsed.search}`
  } catch {
    return url.trim().toLowerCase()
  }
}

// ── Predicate collection ────────────────────────────────────────────────────

/**
 * Collect all unique normalized predicates from a set of triples.
 * Returns an array of { rawPredicate, normalizedPredicate } tuples (deduplicated).
 */
export function collectUniquePredicates(
  triples: CanonicalTriple[],
): Array<{ raw: string; normalized: string }> {
  const seen = new Set<string>()
  const result: Array<{ raw: string; normalized: string }> = []

  for (const triple of triples) {
    const normalized = normalizePredicate(triple.predicate)
    if (!seen.has(normalized)) {
      seen.add(normalized)
      result.push({ raw: triple.predicate, normalized })
    }
  }

  // Always include "based_on" for provenance
  if (!seen.has('based_on')) {
    result.push({ raw: 'based_on', normalized: 'based_on' })
  }

  return result
}

/**
 * Filter triples to only those eligible for V1 on-chain publishing.
 * Excludes: risk_flag triples, status/completeness literal triples.
 */
export function filterTriples(triples: CanonicalTriple[]): CanonicalTriple[] {
  return triples.filter((triple) => {
    // Exclude triples whose subject or object is a risk_flag atom
    if (triple.subject_id.startsWith('atom:risk:')) return false
    if (triple.object_id?.startsWith('atom:risk:')) return false

    // Exclude workflow predicates
    const normalized = normalizePredicate(triple.predicate)
    if (isPredicateExcluded(normalized)) return false

    return true
  })
}

/**
 * Filter atoms to only those eligible for V1 on-chain publishing.
 */
export function filterAtoms(atoms: CanonicalAtom[]): CanonicalAtom[] {
  return atoms.filter((atom) => !isAtomTypeExcluded(atom.atom_type))
}
