/**
 * Pin TrustNomiks canonical predicates via the Intuition `pinThing` mutation
 * and write the registry. No PINATA_JWT required — Intuition's GraphQL
 * endpoint exposes its own pin mutations and is unauthenticated.
 *
 * Idempotent. Re-running with no missing entries is a no-op. If a predicate
 * is added to the source list below, only that predicate is pinned and the
 * registry JSON is appended in place.
 *
 * Usage:
 *   npm run intuition:pin-predicates              # pin missing entries
 *   npm run intuition:pin-predicates -- --dry-run # list what would be pinned
 *
 * After running, commit canonical-registry.json.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { calculateAtomId } from '@0xintuition/sdk'
import { stringToHex } from 'viem'

import type {
  CanonicalPredicateEntry,
  CanonicalRegistry,
} from '../src/lib/intuition/canonical-registry'
import { pinThing } from '../src/lib/intuition/pin-client'

// ── Source-of-truth list ─────────────────────────────────────────────────────

type PredicateSpec = {
  internalKey: string
  label: string
  description: string
  /** Optional: reuse an existing canonical atom instead of pinning. */
  reuse?: { uri: string; termId: `0x${string}` }
}

const PREDICATES: PredicateSpec[] = [
  // Reused canonical Intuition atom — has_category maps to "is a".
  {
    internalKey: 'has_category',
    label: 'is a',
    description:
      'Reused canonical Intuition atom. The TrustNomiks predicate has_category maps to is a (e.g. "Aave is a Financial token").',
    reuse: {
      uri: 'ipfs://QmSbTY2QqhnZdCr7zqdZkFBLfY9FGEtPf8KUYzezDipPyG',
      termId: '0xf499d9dc45d6fa45bccf6e85bda76966814d81f4f104ab6e5a52b53c47e7408d',
    },
  },

  { internalKey: 'has_allocation_segment', label: 'has allocation segment', description: 'Relates a token to one of its allocation segments (team, treasury, public, etc.).' },
  { internalKey: 'has_vesting_schedule',   label: 'has vesting schedule',   description: 'Relates an allocation segment to its vesting schedule.' },
  { internalKey: 'has_emission_model',     label: 'has emission model',     description: 'Relates a token to its emission model (inflation, burn, buyback).' },
  { internalKey: 'has_data_source',        label: 'has data source',        description: 'Relates a claim or entity to its provenance data source.' },
  { internalKey: 'has_sector',             label: 'has sector',             description: 'Relates a token to its sector (sub-classification within a category).' },
  { internalKey: 'has_chain',              label: 'has chain',              description: 'Relates a token to the blockchain it is deployed on.' },

  { internalKey: 'has_name',             label: 'has name',             description: 'Relates an entity to its display name.' },
  { internalKey: 'has_ticker',           label: 'has ticker',           description: 'Relates a token to its ticker symbol.' },
  { internalKey: 'has_contract_address', label: 'has contract address', description: 'Relates a token to its on-chain contract address.' },
  { internalKey: 'has_tge_date',         label: 'has tge date',         description: 'Relates a token to its Token Generation Event date (YYYY-MM-DD).' },

  { internalKey: 'has_max_supply',         label: 'has max supply',         description: 'Relates a token to its maximum total supply, expressed as a base-10 integer string.' },
  { internalKey: 'has_initial_supply',     label: 'has initial supply',     description: 'Relates a token to its initial supply at launch, expressed as a base-10 integer string.' },
  { internalKey: 'has_tge_supply',         label: 'has tge supply',         description: 'Relates a token to its supply at TGE, expressed as a base-10 integer string.' },
  { internalKey: 'has_circulating_supply', label: 'has circulating supply', description: 'Relates a token to its circulating supply, expressed as a base-10 integer string.' },

  { internalKey: 'has_percentage',     label: 'has percentage',     description: 'Relates an allocation segment to its share of total supply, expressed as a percentage.' },
  { internalKey: 'has_token_amount',   label: 'has token amount',   description: 'Relates an allocation segment to its absolute token amount, expressed as a base-10 integer string.' },
  { internalKey: 'has_wallet_address', label: 'has wallet address', description: 'Relates an allocation segment to the wallet address holding it.' },

  { internalKey: 'has_cliff_months',            label: 'has cliff months',            description: 'Relates a vesting schedule to its cliff duration in months.' },
  { internalKey: 'has_duration_months',         label: 'has duration months',         description: 'Relates a vesting schedule to its full duration in months.' },
  { internalKey: 'has_frequency',               label: 'has frequency',               description: 'Relates a vesting schedule to its unlock frequency (monthly, yearly, etc.).' },
  { internalKey: 'has_tge_percentage',          label: 'has tge percentage',          description: 'Relates a vesting schedule to the percentage unlocked at TGE.' },
  { internalKey: 'has_cliff_unlock_percentage', label: 'has cliff unlock percentage', description: 'Relates a vesting schedule to the percentage unlocked at the end of the cliff.' },

  { internalKey: 'has_annual_inflation_rate', label: 'has annual inflation rate', description: 'Relates an emission model to its annual inflation rate, expressed as a percentage.' },

  { internalKey: 'has_url',         label: 'has url',         description: 'Relates a data source to its canonical URL.' },
  { internalKey: 'has_version',     label: 'has version',     description: 'Relates a data source to its document version identifier.' },
  { internalKey: 'has_verified_at', label: 'has verified at', description: 'Relates a data source to its verification timestamp (YYYY-MM-DD).' },

  { internalKey: 'based_on', label: 'based on', description: 'Relates a claim to its provenance data source.' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

const REGISTRY_PATH = resolve(__dirname, '../src/lib/intuition/canonical-registry.json')

function loadRegistry(): CanonicalRegistry {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8')) as CanonicalRegistry
}

function writeRegistry(reg: CanonicalRegistry): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2) + '\n', 'utf-8')
}

function termIdFromUri(uri: string): `0x${string}` {
  return calculateAtomId(stringToHex(uri))
}

function cidFromUri(uri: string): string {
  return uri.startsWith('ipfs://') ? uri.slice('ipfs://'.length) : uri
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const registry = loadRegistry()
  const missing = PREDICATES.filter((p) => !(p.internalKey in registry.predicates))

  if (missing.length === 0) {
    console.log('[pin-canonical-predicates] registry already complete — nothing to do')
    return
  }

  console.log(
    `[pin-canonical-predicates] ${missing.length} predicate(s) to materialise${dryRun ? ' (dry-run)' : ''}`,
  )

  const reuseEntries = missing.filter((p) => p.reuse)
  const pinEntries = missing.filter((p) => !p.reuse)

  // Reuse entries — local consistency check, no network.
  for (const spec of reuseEntries) {
    const computed = termIdFromUri(spec.reuse!.uri)
    if (computed.toLowerCase() !== spec.reuse!.termId.toLowerCase()) {
      throw new Error(
        `[pin-canonical-predicates] reuse mismatch for ${spec.internalKey}: ` +
          `computed ${computed} but spec says ${spec.reuse!.termId}.`,
      )
    }
    registry.predicates[spec.internalKey] = {
      internalKey: spec.internalKey,
      canonicalLabel: spec.label,
      source: 'reused',
      cid: null,
      uri: spec.reuse!.uri,
      termId: spec.reuse!.termId,
      pinnedAt: new Date().toISOString(),
      description: spec.description,
      reusedFrom: spec.reuse!.termId,
    } satisfies CanonicalPredicateEntry
    console.log(`  ↳ reused  ${spec.internalKey} → ${spec.label} (${spec.reuse!.termId.slice(0, 10)}…)`)
  }

  if (pinEntries.length > 0) {
    if (dryRun) {
      for (const spec of pinEntries) {
        console.log(`  ↳ would pin ${spec.internalKey} → "${spec.label}"`)
      }
      console.log('[pin-canonical-predicates] dry-run complete; no registry write')
      return
    }

    // Pin one at a time, persisting between calls so a mid-batch failure
    // leaves the registry consistent (every successful pin is saved).
    for (const spec of pinEntries) {
      try {
        const uri = await pinThing({
          name: spec.label,
          description: spec.description,
          image: '',
          url: '',
        })
        const termId = termIdFromUri(uri)
        registry.predicates[spec.internalKey] = {
          internalKey: spec.internalKey,
          canonicalLabel: spec.label,
          source: 'pinned',
          cid: cidFromUri(uri),
          uri,
          termId,
          pinnedAt: new Date().toISOString(),
          description: spec.description,
        } satisfies CanonicalPredicateEntry
        writeRegistry(registry)
        console.log(`  ↳ pinned  ${spec.internalKey} → ${cidFromUri(uri)} (${termId.slice(0, 10)}…)`)
      } catch (err) {
        console.error(
          `[pin-canonical-predicates] FAILED at ${spec.internalKey}; ` +
            `previously pinned entries are persisted. Re-run to resume.`,
        )
        throw err
      }
    }
  }

  writeRegistry(registry)
  console.log('[pin-canonical-predicates] done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
