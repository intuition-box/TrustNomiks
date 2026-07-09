// Shared by use-open-challenge.ts and use-resolve-challenge.ts. Postgrest
// errors are plain objects, not `Error` instances (pattern lifted from
// src/features/wallet-linking/use-wallet-link.ts). The challenge RPCs raise
// with a 'FORBIDDEN: '/'CONFLICT: '/'NOT_FOUND: ' error-code prefix
// (see supabase/migrations/20260709_add_challenges_rpcs.sql); strip it so
// the toast reads as a sentence instead of a wire-protocol code.
const CODE_PREFIX_RE = /^(FORBIDDEN|CONFLICT|NOT_FOUND):\s*/

export function extractErrorMessage(err: unknown, fallback: string): string {
  let message: string | undefined
  if (err instanceof Error) {
    message = err.message
  } else if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message?: unknown }).message === 'string'
  ) {
    message = (err as { message: string }).message
  }
  if (!message) return fallback
  return message.replace(CODE_PREFIX_RE, '')
}
