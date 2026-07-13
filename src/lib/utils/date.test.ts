import { describe, it, expect } from 'vitest'
import { toDateOnly, parseDateOnly } from './date'

describe('toDateOnly', () => {
  it('passes a date-only string straight through', () => {
    expect(toDateOnly('2026-07-13')).toBe('2026-07-13')
  })

  it('keeps the LOCAL calendar day of an instant, which is the day the user picked', () => {
    // The regression this exists to prevent: the Calendar hands back local
    // midnight, `.toISOString()` shifts it to the previous day in UTC for any
    // timezone east of Greenwich, and Postgres truncates that to DATE. Feeding
    // that instant back through toDateOnly recovers the intended day.
    const localMidnight = new Date(2026, 6, 13, 0, 0, 0) // 13 July, local
    expect(toDateOnly(localMidnight.toISOString())).toBe('2026-07-13')
  })

  it('does not shift a late-evening local time to the next day', () => {
    const lateEvening = new Date(2026, 6, 13, 23, 30, 0)
    expect(toDateOnly(lateEvening.toISOString())).toBe('2026-07-13')
  })

  it('maps empty and unparseable input to null', () => {
    expect(toDateOnly(null)).toBeNull()
    expect(toDateOnly(undefined)).toBeNull()
    expect(toDateOnly('')).toBeNull()
    expect(toDateOnly('not a date')).toBeNull()
  })
})

describe('parseDateOnly', () => {
  it('reads a date-only string as LOCAL midnight, not UTC midnight', () => {
    const parsed = parseDateOnly('2026-07-13')

    expect(parsed).not.toBeNull()
    // getDate() is local. `new Date('2026-07-13')` would give the 12th here for
    // any negative UTC offset; parseISO gives the 13th everywhere.
    expect(parsed!.getFullYear()).toBe(2026)
    expect(parsed!.getMonth()).toBe(6)
    expect(parsed!.getDate()).toBe(13)
    expect(parsed!.getHours()).toBe(0)
  })

  it('round-trips through an ISO instant without losing the day', () => {
    const day = '2028-02-29' // leap day, for good measure
    expect(toDateOnly(parseDateOnly(day)!.toISOString())).toBe(day)
  })

  it('still parses a full ISO instant correctly', () => {
    const parsed = parseDateOnly('2026-07-13T10:30:00Z')
    expect(parsed).not.toBeNull()
    expect(parsed!.toISOString()).toBe('2026-07-13T10:30:00.000Z')
  })

  it('maps empty and unparseable input to null', () => {
    expect(parseDateOnly(null)).toBeNull()
    expect(parseDateOnly('')).toBeNull()
    expect(parseDateOnly('not a date')).toBeNull()
  })
})
