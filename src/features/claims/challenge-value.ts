// Encodes a claim field's raw UI value to the same JSON shape Postgres'
// `to_jsonb(<typed column>)` produces for that column, so client-side
// comparisons (and the `proposed_value` sent to `open_challenge_tx`) line up
// byte-for-byte with what `mark_stale_challenges_for_field` compares against
// on save (see supabase/migrations/20260709_add_challenges_rpcs.sql).

import type { FieldKind } from '@/lib/claims/field-registry'

export type Json = string | number | boolean | null

const isEmpty = (raw: unknown): raw is null | undefined | '' =>
  raw === null || raw === undefined || raw === ''

/**
 * `kind` selects the Postgres column type being mirrored:
 *  - 'number' | 'percentage' -> numeric: a plain JS `number`. Note: JS numbers
 *    only round-trip integers exactly up to 2^53 - 1 (Number.MAX_SAFE_INTEGER).
 *    A value beyond that may lose precision here versus the Postgres numeric
 *    column. That's acceptable for this feature: the only consumer of this
 *    mismatch is mark_stale_challenges_for_field's proposed-value comparison,
 *    where a precision drift only downgrades an auto-accept to 'stale'
 *    (the challenger can reopen) — it never corrupts stored data.
 *  - 'boolean' -> boolean, tolerant of string/number encodings from form state.
 *  - 'date' -> 'YYYY-MM-DD' (a Postgres `date` serializes to this in JSON).
 *  - 'text' | 'enum' -> trimmed string.
 * Empty/nullish raw input always encodes to `null` (matching to_jsonb(NULL)).
 */
export function encodeFieldValue(kind: FieldKind, raw: unknown): Json {
  switch (kind) {
    case 'number':
    case 'percentage': {
      if (isEmpty(raw)) return null
      const n = Number(raw)
      return Number.isNaN(n) ? null : n
    }
    case 'boolean': {
      if (raw === null || raw === undefined) return null
      if (raw === false || raw === 'false' || raw === 0 || raw === '')
        return false
      if (raw === true || raw === 'true' || raw === 1) return true
      return Boolean(raw)
    }
    case 'date': {
      if (isEmpty(raw)) return null
      return String(raw).slice(0, 10)
    }
    case 'text':
    case 'enum': {
      if (raw === null || raw === undefined) return null
      const s = String(raw).trim()
      return s === '' ? null : s
    }
  }
}

/**
 * Inverse of encodeFieldValue: turns a challenge's `proposed_value` (jsonb,
 * shaped like to_jsonb(<column>) -- see encodeFieldValue above) back into the
 * value a form input expects. Used by the studio's "pre-fill from an
 * accepted challenge" flow (use-token-save-handlers.ts's
 * prefillFromChallenge) to seed a field from proposed_value instead of
 * making the moderator/owner re-type it.
 *
 * Every form input in this codebase stores its value as a string, except
 * has_burn/has_buyback (booleans) -- so 'boolean' is the only kind that
 * doesn't round-trip through String().
 */
export function decodeFieldValue(
  kind: FieldKind,
  value: unknown,
): string | boolean {
  if (kind === 'boolean') return Boolean(value)
  return value === null || value === undefined ? '' : String(value)
}
