/**
 * Builds canonical schema.org payloads for TrustNomiks entity atoms,
 * pins them to IPFS via Intuition's GraphQL `pinThing` mutation, and
 * caches the result in `intuition_pin_cache` so a given content snapshot
 * is only pinned once.
 *
 * Flow per entity:
 *   1. buildPayload(atom) → { schema, data } (Thing / Person / Organization)
 *   2. canonicalize + sha256 → contentHash
 *   3. SELECT (entity_kind, entity_key, content_hash) — return cached result on hit
 *   4. otherwise call Intuition pin mutation → INSERT row → return
 *
 * Intuition's `Thing` schema is fixed at four fields: name, description,
 * image, url. We don't have a place for internal UUIDs in the pinned
 * document — the mapping atom_id ↔ term_id is tracked entirely in the
 * intuition_pin_cache and intuition_atom_mappings tables.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateAtomId } from '@0xintuition/sdk'
import { stringToHex } from 'viem'
import { createHash } from 'node:crypto'

import type { CanonicalAtom } from '@/lib/knowledge-graph/graph-types'
import { pinByPayload, type PinPayload } from './pin-client'

export type EntityKind =
  | 'token'
  | 'allocation'
  | 'vesting'
  | 'emission'
  | 'data_source'
  | 'category'
  | 'sector'
  | 'chain'

export interface PinResult {
  uri: string
  termId: `0x${string}`
  cached: boolean
}

export interface EntityPinnerDeps {
  supabase: SupabaseClient
  /** Map of token_id → token row used to enrich entity names. */
  tokenContext?: Map<string, { name: string; ticker: string }>
}

function entityKindOf(atomType: string): EntityKind {
  switch (atomType) {
    case 'token': return 'token'
    case 'allocation': return 'allocation'
    case 'vesting': return 'vesting'
    case 'emission': return 'emission'
    case 'data_source': return 'data_source'
    case 'category': return 'category'
    case 'sector': return 'sector'
    case 'chain': return 'chain'
    default:
      throw new Error(`[entity-pinner] unsupported entity atom_type: ${atomType}`)
  }
}

/**
 * Stable JSON serialization for content hashing.
 * Sorts object keys recursively so semantically equal payloads hash identically.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}'
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function titleCase(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed
  return trimmed
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

// ── Payload builders ────────────────────────────────────────────────────────

function buildTokenPayload(atom: CanonicalAtom): PinPayload {
  const meta = atom.metadata ?? {}
  const ticker = meta.ticker as string | undefined
  const chain = meta.chain as string | undefined
  const description = [
    ticker ? `Ticker: ${ticker}` : null,
    chain ? `Chain: ${chain}` : null,
  ].filter(Boolean).join(' · ')

  return {
    schema: 'Thing',
    data: {
      name: atom.label,
      description,
      image: '',
      url: '',
    },
  }
}

function buildAllocationPayload(atom: CanonicalAtom, deps: EntityPinnerDeps): PinPayload {
  const meta = atom.metadata ?? {}
  const segmentType = meta.segment_type as string | undefined
  const tokenName = atom.token_id ? deps.tokenContext?.get(atom.token_id)?.name : undefined
  const baseLabel = atom.label || segmentType || 'allocation'
  const name = tokenName ? `${tokenName} ${baseLabel} allocation` : `${baseLabel} allocation`

  return {
    schema: 'Thing',
    data: { name, description: `Token allocation segment.`, image: '', url: '' },
  }
}

function buildVestingPayload(atom: CanonicalAtom, deps: EntityPinnerDeps): PinPayload {
  const tokenName = atom.token_id ? deps.tokenContext?.get(atom.token_id)?.name : undefined
  const name = tokenName ? `${tokenName} vesting schedule` : 'vesting schedule'
  return {
    schema: 'Thing',
    data: { name, description: `Token vesting schedule.`, image: '', url: '' },
  }
}

function buildEmissionPayload(atom: CanonicalAtom, deps: EntityPinnerDeps): PinPayload {
  const tokenName = atom.token_id ? deps.tokenContext?.get(atom.token_id)?.name : undefined
  const name = tokenName ? `${tokenName} emission model` : 'emission model'
  return {
    schema: 'Thing',
    data: { name, description: `Token emission model.`, image: '', url: '' },
  }
}

function buildDataSourcePayload(atom: CanonicalAtom): PinPayload {
  const meta = atom.metadata ?? {}
  const url = (meta.url as string | undefined) ?? ''
  const version = meta.version as string | undefined
  const sourceType = meta.source_type as string | undefined
  const baseName = atom.label || (url ? safeHostname(url) : 'source')
  const name = version ? `${baseName} (v${version})` : baseName
  const description = sourceType ? `Source type: ${sourceType}` : ''

  return {
    schema: 'Thing',
    data: { name, description, image: '', url },
  }
}

function buildTaxonomyPayload(atom: CanonicalAtom): PinPayload {
  const name = titleCase(atom.label || '') || atom.label
  return {
    schema: 'Thing',
    data: { name, description: '', image: '', url: '' },
  }
}

function safeHostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

function buildPayload(atom: CanonicalAtom, deps: EntityPinnerDeps): PinPayload {
  switch (atom.atom_type) {
    case 'token':       return buildTokenPayload(atom)
    case 'allocation':  return buildAllocationPayload(atom, deps)
    case 'vesting':     return buildVestingPayload(atom, deps)
    case 'emission':    return buildEmissionPayload(atom, deps)
    case 'data_source': return buildDataSourcePayload(atom)
    case 'category':
    case 'sector':
    case 'chain':       return buildTaxonomyPayload(atom)
    default:
      throw new Error(`[entity-pinner] no payload builder for atom_type: ${atom.atom_type}`)
  }
}

// ── Cache I/O ───────────────────────────────────────────────────────────────

interface CacheRow { cid: string; uri: string; term_id: string }

async function readCache(
  supabase: SupabaseClient,
  kind: EntityKind,
  key: string,
  contentHash: string,
): Promise<CacheRow | null> {
  const { data, error } = await supabase
    .from('intuition_pin_cache')
    .select('cid, uri, term_id')
    .eq('entity_kind', kind)
    .eq('entity_key', key)
    .eq('content_hash', contentHash)
    .maybeSingle()
  if (error) throw new Error(`[entity-pinner] cache read failed: ${error.message}`)
  return (data as CacheRow | null) ?? null
}

async function writeCache(
  supabase: SupabaseClient,
  row: {
    entity_kind: EntityKind
    entity_key: string
    content_hash: string
    cid: string
    uri: string
    term_id: string
    pinned_json: unknown
  },
): Promise<void> {
  const { error } = await supabase
    .from('intuition_pin_cache')
    .upsert(row, { onConflict: 'entity_kind,entity_key,content_hash' })
  if (error) throw new Error(`[entity-pinner] cache write failed: ${error.message}`)
}

function cidFromUri(uri: string): string {
  return uri.startsWith('ipfs://') ? uri.slice('ipfs://'.length) : uri
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Pin (or fetch from cache) the canonical IPFS payload for an entity atom.
 * Returns the on-chain `data` URI and the deterministic termId.
 */
export async function pinEntity(
  atom: CanonicalAtom,
  deps: EntityPinnerDeps,
): Promise<PinResult> {
  const kind = entityKindOf(atom.atom_type)
  const payload = buildPayload(atom, deps)
  const contentHash = sha256Hex(canonicalJson(payload))

  const cached = await readCache(deps.supabase, kind, atom.atom_id, contentHash)
  if (cached) {
    return { uri: cached.uri, termId: cached.term_id as `0x${string}`, cached: true }
  }

  const uri = await pinByPayload(payload)
  const termId = calculateAtomId(stringToHex(uri))

  await writeCache(deps.supabase, {
    entity_kind: kind,
    entity_key: atom.atom_id,
    content_hash: contentHash,
    cid: cidFromUri(uri),
    uri,
    term_id: termId,
    pinned_json: payload,
  })

  return { uri, termId, cached: false }
}

export async function pinEntities(
  atoms: CanonicalAtom[],
  deps: EntityPinnerDeps,
): Promise<Map<string, PinResult>> {
  const out = new Map<string, PinResult>()
  for (const atom of atoms) {
    out.set(atom.atom_id, await pinEntity(atom, deps))
  }
  return out
}

export const _internal = { canonicalJson, sha256Hex, buildPayload, entityKindOf }
