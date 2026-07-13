/**
 * Date-only helpers for the Postgres DATE columns (`data_sources.verified_at`,
 * `tokens.tge_date`, `supply_metrics.circulating_date`).
 *
 * These columns carry a calendar day, not an instant, and the naive round-trip
 * silently shifts it by one:
 *
 *   - writing: a Calendar hands back local midnight, and `.toISOString()` turns
 *     2026-07-13T00:00+02:00 into "2026-07-12T22:00Z". Postgres truncates that
 *     to DATE and stores the 12th. The user picked the 13th.
 *   - reading: `new Date('2026-07-13')` parses as midnight UTC, which renders
 *     as the 12th anywhere west of Greenwich.
 *
 * Both ends therefore work on date-only strings, parsed and formatted in LOCAL
 * time. This matters beyond display: `verified_at` is minted on-chain by
 * `triples-export.ts`, where a wrong day is permanent.
 */

import { format, isValid, parseISO } from 'date-fns'

/**
 * Normalises any date-ish string to a `yyyy-MM-dd` calendar day in local time.
 * Full ISO instants are accepted so values already in flight in form state are
 * healed rather than persisted as-is. Returns null for empty or unparseable
 * input, which maps to a NULL column.
 */
export function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null

  const parsed = parseISO(value)
  if (!isValid(parsed)) return null

  return format(parsed, 'yyyy-MM-dd')
}

/**
 * Parses a stored date for display. `parseISO` reads a date-only string as
 * local midnight (unlike `new Date`, which reads it as UTC), and still handles
 * a full ISO instant correctly, so this is safe for DATE and timestamptz alike.
 * Returns null for empty or unparseable input so callers can render a fallback.
 */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null

  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : null
}
