import { describe, it, expect } from 'vitest'
import { humanizeWriteError } from './supabase-error'

const DENIED_MESSAGE =
  "You do not have permission to make this change. Only the token's creator, as a contributor, can edit it."

describe('humanizeWriteError', () => {
  it('maps a PostgrestError-like object with code 42501 to the denied message', () => {
    expect(
      humanizeWriteError({
        code: '42501',
        message: 'permission denied for table tokens',
      }),
    ).toBe(DENIED_MESSAGE)
  })

  it('maps a "permission denied" message to the denied message', () => {
    expect(
      humanizeWriteError(new Error('permission denied for table tokens')),
    ).toBe(DENIED_MESSAGE)
  })

  it('maps a "row-level security" message to the denied message', () => {
    expect(
      humanizeWriteError(
        new Error(
          'new row violates row-level security policy for table "tokens"',
        ),
      ),
    ).toBe(DENIED_MESSAGE)
  })

  it('maps a FORBIDDEN RPC guard message to the denied message', () => {
    expect(
      humanizeWriteError(new Error('FORBIDDEN: Contributor role required')),
    ).toBe(DENIED_MESSAGE)
  })

  it('is case-insensitive when matching the denial patterns', () => {
    expect(humanizeWriteError(new Error('Permission Denied'))).toBe(
      DENIED_MESSAGE,
    )
  })

  it('handles a plain PostgrestError shape ({ code, message }) without an Error instance', () => {
    expect(
      humanizeWriteError({
        code: '42501',
        message: 'insufficient_privilege',
        details: null,
        hint: null,
      }),
    ).toBe(DENIED_MESSAGE)
  })

  it('returns the fallback for a generic error', () => {
    expect(
      humanizeWriteError(
        new Error('network timeout'),
        'Failed to update status',
      ),
    ).toBe('Failed to update status')
  })

  it('returns the default fallback when none is supplied', () => {
    expect(humanizeWriteError(new Error('network timeout'))).toBe(
      'Something went wrong. Please try again.',
    )
  })

  it('returns the fallback for unknown, non-object error shapes', () => {
    expect(humanizeWriteError('a plain string', 'Failed to save')).toBe(
      'Failed to save',
    )
    expect(humanizeWriteError(null, 'Failed to save')).toBe('Failed to save')
    expect(humanizeWriteError(undefined, 'Failed to save')).toBe(
      'Failed to save',
    )
  })
})
