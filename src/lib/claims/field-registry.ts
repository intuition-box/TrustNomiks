// App-side whitelist of challengeable fields per claim type (Resolve Box
// plan A5/A6). `challenges.field_key` is validated against this registry —
// `open_challenge_tx` trusts only whitelisted fields. `FIELD_ANCHOR_MODE`
// drives whether the UI shows a per-field chip ('field') or a per-row chip
// with a field picker ('row'). Field keys must match the corresponding Zod
// schema field names in `@/types/form` exactly. `data_source` and
// `risk_flags` are intentionally excluded (out of MVP scope; their saves
// regenerate row ids, so they cannot be stably anchored yet).

import type { ClaimType } from '@/types/form'
import { hasCanonicalPredicate } from '@/lib/intuition/canonical-registry'

export type FieldKind =
  'text' | 'number' | 'percentage' | 'date' | 'enum' | 'boolean'

export interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  /** Internal predicate key (canonical-registry.json), may not be pinned yet. */
  predicate?: string
  enumValues?: readonly string[]
}

export type AnchorMode = 'field' | 'row'

export const CHALLENGEABLE_CLAIM_TYPES = [
  'token_identity',
  'supply_metrics',
  'emission_model',
  'allocation_segment',
  'vesting_schedule',
] as const

export type ChallengeableClaimType = (typeof CHALLENGEABLE_CLAIM_TYPES)[number]

export const FIELD_ANCHOR_MODE: Record<ChallengeableClaimType, AnchorMode> = {
  token_identity: 'field',
  supply_metrics: 'field',
  emission_model: 'field',
  allocation_segment: 'row',
  vesting_schedule: 'row',
}

export const FIELD_REGISTRY: Record<
  ChallengeableClaimType,
  readonly FieldDef[]
> = {
  token_identity: [
    { key: 'name', label: 'Name', kind: 'text', predicate: 'has_name' },
    { key: 'ticker', label: 'Ticker', kind: 'text', predicate: 'has_ticker' },
    { key: 'chain', label: 'Chain', kind: 'text', predicate: 'has_chain' },
    {
      key: 'contract_address',
      label: 'Contract Address',
      kind: 'text',
      predicate: 'has_contract_address',
    },
    {
      key: 'tge_date',
      label: 'TGE Date',
      kind: 'date',
      predicate: 'has_tge_date',
    },
    {
      key: 'category',
      label: 'Category',
      kind: 'text',
      predicate: 'has_category',
    },
    { key: 'sector', label: 'Sector', kind: 'text', predicate: 'has_sector' },
  ],
  supply_metrics: [
    {
      key: 'max_supply',
      label: 'Max Supply',
      kind: 'number',
      predicate: 'has_max_supply',
    },
    {
      key: 'initial_supply',
      label: 'Initial Supply',
      kind: 'number',
      predicate: 'has_initial_supply',
    },
    {
      key: 'tge_supply',
      label: 'TGE Supply',
      kind: 'number',
      predicate: 'has_tge_supply',
    },
    {
      key: 'circulating_supply',
      label: 'Circulating Supply',
      kind: 'number',
      predicate: 'has_circulating_supply',
    },
    { key: 'circulating_date', label: 'Circulating Supply Date', kind: 'date' },
  ],
  emission_model: [
    { key: 'type', label: 'Emission Type', kind: 'text' },
    {
      key: 'annual_inflation_rate',
      label: 'Annual Inflation Rate',
      kind: 'percentage',
    },
    { key: 'has_burn', label: 'Has Burn Mechanism', kind: 'boolean' },
    { key: 'has_buyback', label: 'Has Buyback Mechanism', kind: 'boolean' },
  ],
  allocation_segment: [
    { key: 'segment_type', label: 'Segment Type', kind: 'enum' },
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'percentage', label: 'Percentage', kind: 'percentage' },
    { key: 'token_amount', label: 'Token Amount', kind: 'number' },
    { key: 'wallet_address', label: 'Wallet Address', kind: 'text' },
  ],
  vesting_schedule: [
    { key: 'cliff_months', label: 'Cliff (Months)', kind: 'number' },
    { key: 'duration_months', label: 'Duration (Months)', kind: 'number' },
    { key: 'frequency', label: 'Frequency', kind: 'enum' },
    { key: 'tge_percentage', label: 'TGE Percentage', kind: 'percentage' },
    {
      key: 'cliff_unlock_percentage',
      label: 'Cliff Unlock Percentage',
      kind: 'percentage',
    },
  ],
}

const isChallengeableClaimType = (
  claimType: ClaimType,
): claimType is ChallengeableClaimType =>
  (CHALLENGEABLE_CLAIM_TYPES as readonly string[]).includes(claimType)

export const listFields = (claimType: ClaimType): readonly FieldDef[] => {
  if (!isChallengeableClaimType(claimType)) return []
  return FIELD_REGISTRY[claimType]
}

export const getFieldDef = (
  claimType: ClaimType,
  fieldKey: string,
): FieldDef | undefined =>
  listFields(claimType).find((field) => field.key === fieldKey)

export const isChallengeableField = (
  claimType: ClaimType,
  fieldKey: string,
): boolean => getFieldDef(claimType, fieldKey) !== undefined

// Returns the field's predicate only if it is actually present in the
// canonical registry (pinned or reused) — guards against a typo'd or
// not-yet-pinned internalKey leaking out to callers that build on-chain
// supersession triples.
export const getFieldPredicate = (
  claimType: ClaimType,
  fieldKey: string,
): string | undefined => {
  const predicate = getFieldDef(claimType, fieldKey)?.predicate
  if (!predicate) return undefined
  return hasCanonicalPredicate(predicate) ? predicate : undefined
}
