/**
 * Maps a write-denial error to user-facing copy. Write gating (RLS on the
 * underlying tables and the `save_*_tx` RPC guards) rejects non-contributor
 * writes three ways that all reach the client here: a PostgREST/PG error
 * object with `code === '42501'` (insufficient_privilege), a raw
 * "permission denied" / "row-level security" message from a direct RLS
 * rejection, and a `FORBIDDEN: Contributor role required` message raised by
 * the `save_*_tx` RPC guards. All three map to the same friendly copy;
 * everything else falls back to the caller-supplied (or generic) message.
 * Pure, exported for unit testing. No dependencies.
 */
export function humanizeWriteError(err: unknown, fallback?: string): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined
  const message = extractMessage(err)

  const isWriteDenied =
    code === '42501' ||
    /permission denied/i.test(message) ||
    /row-level security/i.test(message) ||
    /FORBIDDEN/i.test(message)

  if (isWriteDenied) {
    return "You do not have permission to make this change. Only the token's creator, as a contributor, can edit it."
  }

  // 23505 unique_violation: the registry holds one entry per CoinGecko coin and
  // one per deployed contract (20260720_add_token_uniqueness_indexes.sql).
  // Without this branch the user would get the raw Postgres constraint message.
  if (code === '23505' || /duplicate key value/i.test(message)) {
    return 'This token is already in the registry. Open the existing entry instead of creating a second one.'
  }

  return fallback ?? 'Something went wrong. Please try again.'
}

/** Extracts a string message from an Error, a PostgrestError-like object, or unknown. */
function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    return (err as { message: string }).message
  }
  return ''
}
